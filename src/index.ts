import { createApp } from "./app.js";
const port = Number(process.env.PORT || 4310),
  host = process.env.HOST || "127.0.0.1";
if (
  !["127.0.0.1", "localhost", "::1"].includes(host) &&
  !process.env.BASE_URL?.startsWith("https://")
)
  throw new Error(
    "El acceso de otros equipos requiere BASE_URL HTTPS y un proxy TLS.",
  );
const instance = await createApp({
  dataDir: process.env.DATA_DIR || "./data",
  baseUrl: process.env.BASE_URL || `http://localhost:${port}`,
  databaseUrl: process.env.DATABASE_URL,
});
const server = instance.app.listen(port, host, () =>
  console.log(
    `AgentChannels listo en ${process.env.BASE_URL || `http://localhost:${port}`}`,
  ),
);
async function stop() {
  server.close(async () => {
    await instance.db.close();
    process.exit(0);
  });
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
