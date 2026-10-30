/** Local compatibility bridge. All authorization stays on the HTTP service. */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
const token = process.env.AGENT_CHANNELS_TOKEN,
  url = process.env.AGENT_CHANNELS_URL || "http://localhost:4310/mcp";
if (!token) {
  console.error(
    "Configura AGENT_CHANNELS_TOKEN en el entorno privado del cliente.",
  );
  process.exit(1);
}
const target = new URL(url);
if (
  target.protocol !== "https:" &&
  !(
    target.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
  )
) {
  console.error("Se requiere HTTPS para un servidor remoto.");
  process.exit(1);
}
const remote = new Client({
  name: "agentchannels-stdio-bridge",
  version: "0.1.0",
});
const local = new Server(
  { name: "agent-channels", version: "0.1.0" },
  { capabilities: { tools: {} } },
);
try {
  await remote.connect(
    new StreamableHTTPClientTransport(target, {
      requestInit: { headers: { Authorization: "Bearer " + token } },
    }),
  );
  local.setRequestHandler(ListToolsRequestSchema, () => remote.listTools());
  local.setRequestHandler(CallToolRequestSchema, (req) =>
    remote.callTool(req.params),
  );
  await local.connect(new StdioServerTransport());
} catch {
  console.error(
    "No se pudo conectar al canal MCP. Comprueba el servicio y la credencial.",
  );
  process.exit(1);
}
async function close() {
  await local.close();
  await remote.close();
  process.exit(0);
}
process.on("SIGINT", close);
process.on("SIGTERM", close);
process.stdin.on("end", close);
