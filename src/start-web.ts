import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";
import { access } from "node:fs/promises";
import { createApp } from "./app.js";
const dev = process.argv.includes("--dev");
const port = Number(process.env.PORT || 4310);
const baseUrl = process.env.BASE_URL || `http://localhost:${port}`;
const host = process.env.HOST || "127.0.0.1";
if (
  !["127.0.0.1", "localhost", "::1"].includes(host) &&
  !baseUrl.startsWith("https://")
)
  throw new Error("El acceso remoto requiere HTTPS.");
const webDir = fileURLToPath(new URL("../web/", import.meta.url));
if (!dev) {
  try {
    await access(webDir + "/.next/BUILD_ID");
  } catch {
    throw new Error("Primero ejecuta npm run build para preparar la interfaz.");
  }
}
const requireWeb = createRequire(webDir + "/package.json");
const nextModule = requireWeb("next");
const next = (nextModule.default || nextModule)({
  dev,
  dir: webDir,
  hostname: new URL(baseUrl).hostname,
  port,
});
await next.prepare();
const instance = await createApp({
  baseUrl,
  dataDir: process.env.DATA_DIR || "./data",
  databaseUrl: process.env.DATABASE_URL,
});
const handler = next.getRequestHandler();
const frontend = createServer((req, res) => {
  const pathname = new URL(req.url || "/", baseUrl).pathname;
  const serviceRoute =
    /^\/(api(?:\/|$)|mcp(?:\/|$)|authorize$|token$|register$|revoke$|health$|\.well-known(?:\/|$))/.test(
      pathname,
    );
  if (serviceRoute) instance.app(req, res);
  else void handler(req, res);
});
frontend.listen(port, host, () =>
  console.log(
    `AgentChannels listo en ${baseUrl} (${dev ? "desarrollo" : "Next.js"})`,
  ),
);
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  frontend.closeAllConnections();
  await new Promise<void>((r) => frontend.close(() => r()));
  await next.close();
  await instance.db.close();
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
