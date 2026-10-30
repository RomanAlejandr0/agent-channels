import express from "express";
import { MessageCipher } from "./encryption.js";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { fileURLToPath } from "node:url";
import { z, ZodError } from "zod";
import { mcpAuthRouter } from "@modelcontextprotocol/sdk/server/auth/router.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Database } from "./db.js";
import { Service, type User } from "./service.js";
import { OAuthProvider } from "./oauth.js";
import { createMcp } from "./mcp.js";
import { AppError, requireThat, hash } from "./security.js";
export async function createApp(options: {
  dataDir: string;
  baseUrl: string;
  databaseUrl?: string;
  rateLimits?: boolean;
  internalProxyHost?: string;
}) {
  const baseUrl = options.baseUrl.replace(/\/$/, "");
  const base = new URL(baseUrl);
  requireThat(
    base.pathname === "/" &&
      !base.search &&
      !base.hash &&
      !base.username &&
      !base.password,
    500,
    "BASE_URL debe ser el origen sin ruta.",
  );
  requireThat(
    base.protocol === "https:" ||
      (base.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)),
    500,
    "Se requiere HTTPS para acceso remoto.",
  );
  const db = await Database.open(options.dataDir, options.databaseUrl),
    service = new Service(
      db,
      baseUrl,
      await MessageCipher.load(
        options.dataDir,
        !!(await db.query("SELECT 1 FROM messages LIMIT 1")).rows.length,
      ),
    ),
    oauth = new OAuthProvider(service);
  if (
    base.protocol === "https:" &&
    !(await db.query("SELECT 1 FROM users LIMIT 1")).rows.length
  ) {
    await db.close();
    throw new Error(
      "Configura el administrador localmente antes de publicar el servicio.",
    );
  }
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          formAction: ["'self'"],
        },
      },
      strictTransportSecurity: base.protocol === "https:" ? undefined : false,
    }),
  );
  // Validate Host and browser Origin before cookies, OAuth or MCP processing (DNS rebinding/CSRF).
  app.use((req, res, next) => {
    const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
      req.socket.remoteAddress || "",
    );
    const trustedLocalProxy =
      options.internalProxyHost &&
      loopback &&
      req.headers.host === options.internalProxyHost &&
      req.headers["x-forwarded-host"] === base.host;
    if (req.headers.host !== base.host && !trustedLocalProxy)
      return res.status(403).json({ error: "Host no autorizado." });
    if (
      req.path === "/mcp" &&
      req.headers.origin &&
      req.headers.origin !== base.origin
    )
      return res.status(403).json({ error: "Origen no autorizado." });
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());
  const limiter = (limit: number) =>
    rateLimit({
      windowMs: 60000,
      limit,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      skip: () => options.rateLimits === false,
      message: { error: "Demasiadas solicitudes. Espera un minuto." },
    });
  app.use("/api", limiter(240));
  app.use("/api/login", limiter(10));
  app.use("/api/setup", limiter(5));
  app.use("/api/accept-invite", limiter(10));
  app.use(
    mcpAuthRouter({
      provider: oauth,
      issuerUrl: base,
      resourceServerUrl: new URL(oauth.resource),
      scopesSupported: ["messaging"],
      resourceName: "AgentChannels",
    }),
  );
  app.get("/health", async (_req, res) => {
    await db.query("SELECT 1");
    res.json({ status: "ok", version: "0.1.0" });
  });
  app.get("/api/status", async (_req, res) =>
    res.json({
      needs_setup: !(await db.query("SELECT 1 FROM users LIMIT 1")).rows.length,
    }),
  );
  app.post("/api/setup", async (req, res) => {
    await service.setup(req.body);
    res.status(201).json({ ok: true });
  });
  app.post("/api/login", async (req, res) => {
    const a = z
      .object({
        email: z.string().email().max(200),
        password: z.string().min(1).max(256),
      })
      .strict()
      .parse(req.body);
    const login = await service.login(a.email, a.password);
    res.cookie("ac_session", login.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: base.protocol === "https:",
      path: "/",
      maxAge: 12 * 3600000,
    });
    res.json({ user: login.user, csrf: login.csrf });
  });
  app.post("/api/accept-invite", async (req, res) => {
    await service.acceptInvite(req.body);
    res.status(201).json({ ok: true });
  });
  // Require the exact origin for all browser state changes, including login and setup.
  // The early middleware below is mounted through a wrapper at the end (see originGuard).
  app.use("/api", async (req, res, next) => {
    const session = await service.session(req.cookies.ac_session);
    if (!session)
      return res.status(401).json({ error: "Inicia sesión para continuar." });
    res.locals.user = session.user;
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.headers["x-csrf-token"] !== session.csrf
    )
      return res
        .status(403)
        .json({ error: "Sesión inválida. Actualiza la página." });
    res.locals.csrf = session.csrf;
    next();
  });
  const user = (res: express.Response) => res.locals.user as User;
  app.get("/api/me", (req, res) =>
    res.json({ user: user(res), csrf: res.locals.csrf, base_url: baseUrl }),
  );
  app.post("/api/logout", async (req, res) => {
    await db.query("DELETE FROM sessions WHERE hash=$1", [
      hash(req.cookies.ac_session),
    ]);
    res.clearCookie("ac_session", { path: "/" }).json({ ok: true });
  });
  app.get("/api/channels", async (req, res) =>
    res.json(await service.channels(user(res))),
  );
  app.post("/api/channels", async (req, res) =>
    res.status(201).json(await service.createChannel(user(res), req.body)),
  );
  app.get("/api/channels/:id/messages", async (req, res) =>
    res.json(
      await service.panelMessages(
        user(res),
        z.string().uuid().parse(req.params.id),
        z
          .string()
          .regex(/^\d{1,18}$/)
          .parse(req.query.after || "0"),
        req.query.before === undefined
          ? undefined
          : z
              .string()
              .regex(/^\d{1,18}$/)
              .parse(req.query.before),
      ),
    ),
  );
  app.post("/api/messages", async (req, res) =>
    res.status(201).json(await service.post({ user: user(res) }, req.body)),
  );
  app.get("/api/channels/:id/members", async (req, res) =>
    res.json(
      await service.members(user(res), z.string().uuid().parse(req.params.id)),
    ),
  );
  app.put("/api/channels/:id/agents", async (req, res) => {
    await service.membership(
      user(res),
      z.string().uuid().parse(req.params.id),
      req.body,
    );
    res.json({ ok: true });
  });
  app.put("/api/channels/:id/pause", async (req, res) => {
    const a = z.object({ paused: z.boolean() }).strict().parse(req.body);
    await service.pauseChannel(
      user(res),
      z.string().uuid().parse(req.params.id),
      a.paused,
    );
    res.json({ ok: true });
  });
  app.put("/api/channels/:id/people", async (req, res) => {
    const a = z
      .object({
        user_id: z.string().uuid(),
        remove: z.boolean().default(false),
      })
      .strict()
      .parse(req.body);
    await service.addHuman(
      user(res),
      z.string().uuid().parse(req.params.id),
      a.user_id,
      a.remove,
    );
    res.json({ ok: true });
  });
  app.post("/api/invites", async (req, res) =>
    res.status(201).json(await service.invite(user(res), req.body)),
  );
  app.get("/api/agents", async (req, res) =>
    res.json(await service.agents(user(res))),
  );
  app.post("/api/agents", async (req, res) =>
    res.status(201).json(await service.createAgent(user(res), req.body)),
  );
  app.delete("/api/agents/:id", async (req, res) => {
    await service.revokeAgent(
      user(res),
      z.string().uuid().parse(req.params.id),
    );
    res.json({ ok: true });
  });
  app.post("/api/agents/:id/token", async (req, res) =>
    res
      .status(201)
      .json(
        await oauth.personalToken(
          user(res),
          z.string().uuid().parse(req.params.id),
        ),
      ),
  );
  app.get("/api/people", async (req, res) => {
    service.admin(user(res));
    res.json(
      (
        await db.query(
          "SELECT id,name,email,role FROM users ORDER BY created_at",
        )
      ).rows,
    );
  });
  app.get("/api/audit", async (req, res) => {
    service.admin(user(res));
    res.json(
      (await db.query("SELECT * FROM audit ORDER BY seq DESC LIMIT 100")).rows,
    );
  });
  app.get("/api/authorization/:request", async (req, res) =>
    res.json(
      await oauth.request(
        user(res),
        z.string().max(100).parse(req.params.request),
      ),
    ),
  );
  app.post("/api/authorization/:request", async (req, res) => {
    const a = z
      .object({
        agent_id: z.string().uuid().optional(),
        deny: z.boolean().default(false),
      })
      .strict()
      .parse(req.body);
    requireThat(a.deny || a.agent_id, 400, "Selecciona un agente.");
    res.json(
      await oauth.consent(
        user(res),
        String(req.params.request),
        a.agent_id,
        a.deny,
      ),
    );
  });
  const bearer = requireBearerAuth({
    verifier: oauth,
    requiredScopes: ["messaging"],
    resourceMetadataUrl: baseUrl + "/.well-known/oauth-protected-resource/mcp",
    expectedResource: new URL(oauth.resource),
  });
  app.all("/mcp", limiter(240), bearer, async (req, res) => {
    if (req.method !== "POST")
      return res.status(405).set("Allow", "POST").json({
        error:
          "Este servidor MCP usa peticiones POST sin sesiones persistentes.",
      });
    const aid = String(req.auth!.extra!.agent_id),
      server = createMcp(service, aid);
    if (req.body?.method === "initialize")
      await service.audit(db, aid, "connection.used", aid);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  app.use(
    express.static(fileURLToPath(new URL("../public", import.meta.url)), {
      index: "index.html",
      etag: false,
    }),
  );
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (res.headersSent) return;
      if (err instanceof AppError)
        return res.status(err.status).json({ error: err.message });
      if (err instanceof ZodError)
        return res.status(400).json({
          error: "Revisa los campos del formulario.",
          fields: err.issues.map((i) => i.path.join(".")),
        });
      const e = err as { code?: string; status?: number };
      if (e.code === "23505")
        return res.status(409).json({ error: "El registro ya existe." });
      if (e.code === "23503")
        return res
          .status(400)
          .json({ error: "El registro relacionado no está disponible." });
      if (e.status === 413)
        return res
          .status(413)
          .json({ error: "El mensaje es demasiado grande." });
      // Never log request bodies, cookies, tokens or invite URLs.
      console.error("Request failed", {
        kind: err instanceof Error ? err.name : "Unknown",
      });
      res.status(500).json({ error: "No se pudo completar la operación." });
    },
  );
  const guarded = express();
  guarded.use((req, res, next) => {
    if (
      req.path.startsWith("/api") &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.headers.origin !== base.origin
    )
      return res.status(403).json({ error: "Origen no autorizado." });
    next();
  });
  guarded.use(app);
  return { app: guarded, db, service, oauth };
}
