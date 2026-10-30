import { test, expect } from "@playwright/test";
import { createApp } from "../../src/app.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import type { Server } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
let app: Awaited<ReturnType<typeof createApp>>, server: Server, dir: string;
const base = "http://localhost:14311";
test.beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "agentchannels-ui-"));
  app = await createApp({ dataDir: dir, baseUrl: base, rateLimits: false });
  server = await new Promise<Server>((resolve) => {
    const s = app.app.listen(14311, "127.0.0.1", () => resolve(s));
  });
});
test.afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await app.db.close();
  await rm(dir, { recursive: true, force: true });
});

test("two people control the complete private-channel flow in the browser", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Crea tu espacio" }),
  ).toBeVisible();
  await page.getByLabel("Tu nombre").fill("Román");
  await page.getByLabel("Correo electrónico").fill("roman@example.test");
  await page
    .getByLabel("Contraseña", { exact: true })
    .fill("Una-clave-larga-de-prueba");
  await page.getByRole("button", { name: "Crear espacio" }).click();
  await page.getByRole("button", { name: "+ Nuevo canal" }).click();
  await page.getByLabel("Nombre del canal").fill("Juego de carreras");
  await page
    .getByLabel("Descripción")
    .fill("Diseño, pruebas y avances del equipo");
  await page.getByRole("button", { name: "Crear canal", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "# Juego de carreras" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Agentes y conexiones" }).click();
  await page.getByRole("button", { name: "+ Registrar agente" }).click();
  await page.getByLabel("Nombre del agente").fill("Agente de Román");
  await page.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Agente de Román", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Conectar por MCP" }).click();
  await page.getByRole("button", { name: "Generar credencial" }).click();
  await expect(
    page.getByRole("heading", { name: "Credencial de conexión" }),
  ).toBeVisible();
  const tokenA = await page.locator("dialog[open] .secret").innerText();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page
    .getByRole("button", { name: "Conversaciones", exact: true })
    .click();
  await page.getByRole("button", { name: "Administrar participantes" }).click();
  await page.getByLabel("Permiso de Agente de Román").selectOption("write");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.getByRole("button", { name: "Invitar a una persona" }).click();
  await page.getByLabel("Correo de la persona").fill("amigo@example.test");
  await page.getByRole("button", { name: "Crear invitación" }).click();
  await expect(
    page.getByRole("heading", { name: "Invitación creada" }),
  ).toBeVisible();
  const invite = await page.locator("dialog[open] .secret").innerText();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  const friendContext = await browser.newContext();
  const friend = await friendContext.newPage();
  friend.on("pageerror", (e) => errors.push(e.message));
  await friend.goto(invite);
  await friend.getByLabel("Tu nombre").fill("Alex");
  await friend.getByLabel("Correo electrónico").fill("amigo@example.test");
  await friend
    .getByLabel("Contraseña", { exact: true })
    .fill("Otra-clave-larga-de-prueba");
  await friend.getByRole("button", { name: "Aceptar invitación" }).click();
  await expect(
    friend.getByRole("heading", { name: "# Juego de carreras" }),
  ).toBeVisible();
  await friend.getByRole("button", { name: "Agentes y conexiones" }).click();
  await friend.getByRole("button", { name: "+ Registrar agente" }).click();
  await friend.getByLabel("Nombre del agente").fill("Agente de Alex");
  await friend.getByRole("button", { name: "Registrar", exact: true }).click();
  await friend.getByRole("button", { name: "Conectar por MCP" }).click();
  await friend.getByRole("button", { name: "Generar credencial" }).click();
  await expect(
    friend.getByRole("heading", { name: "Credencial de conexión" }),
  ).toBeVisible();
  const tokenB = await friend.locator("dialog[open] .secret").innerText();
  await friend.getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: "Administrar participantes" }).click();
  await page.getByLabel("Permiso de Agente de Alex").selectOption("write");
  await page
    .getByRole("button", { name: "Guardar", exact: true })
    .nth(1)
    .click();
  await page.getByRole("button", { name: "Cerrar", exact: true }).click();
  const a = new Client({ name: "browser-pilot-a", version: "1" }),
    b = new Client({ name: "browser-pilot-b", version: "1" });
  await a.connect(
    new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
      requestInit: { headers: { Authorization: "Bearer " + tokenA } },
    }),
  );
  await b.connect(
    new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
      requestInit: { headers: { Authorization: "Bearer " + tokenB } },
    }),
  );
  const call = async (
    c: Client,
    name: string,
    args: Record<string, unknown> = {},
  ) => {
    const r = await c.callTool({ name, arguments: args });
    expect(r.isError).toBeFalsy();
    return JSON.parse((r.content as any)[0].text);
  };
  const channel = (await call(a, "list_channels"))[0];
  await page
    .getByRole("textbox", { name: "Mensaje", exact: true })
    .fill("¿Pueden revisar la iluminación de la nave?");
  await page.getByRole("button", { name: "Enviar mensaje" }).click();
  const inbox = await call(a, "get_inbox");
  expect(inbox.messages).toHaveLength(1);
  await call(a, "ack_messages", { message_ids: [inbox.messages[0].id] });
  const update = await call(a, "post_message", {
    channel_id: channel.id,
    body: "La nave está lista para revisar. Dejé más contraste en las curvas.",
    operation_id: randomUUID(),
    reply_to: inbox.messages[0].id,
  });
  const received = await call(b, "get_inbox");
  await call(b, "ack_messages", {
    message_ids: received.messages.map((m: any) => m.id),
  });
  await call(b, "post_message", {
    channel_id: channel.id,
    body: "Revisión completada: las curvas se distinguen mejor. Mañana pruebo los controles.",
    operation_id: randomUUID(),
    reply_to: update.id,
  });
  await expect(
    page.getByText(
      "Revisión completada: las curvas se distinguen mejor. Mañana pruebo los controles.",
      { exact: true },
    ),
  ).toBeVisible({ timeout: 12000 });
  await page.reload();
  await expect(page.getByText("1/1 recibidos", { exact: true })).toBeVisible();
  await page.screenshot({
    path: "test-results/panel-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Pausar nuevos mensajes" }).click();
  await expect(page.getByText("CANAL PAUSADO", { exact: true })).toBeVisible();
  expect(
    (
      await a.callTool({
        name: "post_message",
        arguments: {
          channel_id: channel.id,
          body: "No se debe enviar",
          operation_id: randomUUID(),
        },
      })
    ).isError,
  ).toBeTruthy();
  await page.getByRole("button", { name: "Reanudar canal" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/panel-mobile.png",
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 1000 });
  // Browser consent for a real OAuth authorization request; intercept only the external callback page.
  const client = (await (
    await fetch(base + "/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: "Cliente MCP de prueba",
        redirect_uris: ["http://localhost:15433/callback"],
        token_endpoint_auth_method: "none",
      }),
    })
  ).json()) as any;
  const verifier = randomUUID() + randomUUID(),
    challenge = createHash("sha256").update(verifier).digest("base64url");
  const auth = new URL(base + "/authorize");
  for (const [k, v] of Object.entries({
    client_id: client.client_id,
    redirect_uri: "http://localhost:15433/callback",
    response_type: "code",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: base + "/mcp",
  }))
    auth.searchParams.set(k, v);
  const authorization = await fetch(auth, { redirect: "manual" });
  await page.goto(authorization.headers.get("location")!);
  await expect(
    page.getByRole("heading", { name: "Conectar Cliente MCP de prueba" }),
  ).toBeVisible();
  await page
    .getByLabel("Agente a conectar")
    .selectOption({ label: "Agente de Román" });
  await page.route("http://localhost:15433/callback**", (route) =>
    route.fulfill({
      contentType: "text/plain",
      body: "Autorización recibida.",
    }),
  );
  await page.getByRole("button", { name: "Autorizar conexión" }).click();
  await expect(page).toHaveURL(/localhost:15433\/callback\?code=/);
  await page.goto("/");
  await page.getByRole("button", { name: "Agentes y conexiones" }).click();
  const card = page.locator(".agent-card").filter({
    has: page.getByRole("heading", { name: "Agente de Alex", exact: true }),
  });
  await card.getByRole("button", { name: "Revocar", exact: true }).click();
  await page.getByRole("button", { name: "Confirmar", exact: true }).click();
  await expect(card.getByText("REVOCADO", { exact: true })).toBeVisible();
  expect(
    (
      await fetch(base + "/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer " + tokenB },
      })
    ).status,
  ).toBe(401);
  await a.close();
  await b.close();
  await friendContext.close();
  expect(errors).toEqual([]);
});
