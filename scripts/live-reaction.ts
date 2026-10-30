/** Bounded external watcher: wait for one addressed message and activate native Codex once. */
import { readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const access = JSON.parse(
  await readFile("work/live-pilot-access.json", "utf8"),
);
const client = new Client({ name: "live-reaction-watcher", version: "0.1" });
await client.connect(
  new StreamableHTTPClientTransport(new URL("http://localhost:14316/mcp"), {
    requestInit: { headers: { Authorization: "Bearer " + access.token } },
  }),
);
try {
  let message: any;
  for (let i = 0; i < 30; i++) {
    const r = await client.callTool({
      name: "get_inbox",
      arguments: { after: "0", limit: 100 },
    });
    const inbox = JSON.parse((r.content as any)[0].text);
    message = inbox.messages.find(
      (m: any) =>
        m.mentions?.includes(access.agent_id) &&
        m.body.includes("Prueba en vivo"),
    );
    if (message) break;
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (!message)
    throw new Error(
      "No llegó un mensaje dirigido durante el minuto de observación.",
    );
  console.log("Mensaje dirigido detectado. Activando Codex nativo.");
  const prompt = `Trabaja solo en este proyecto MiniTasks de prueba. No leas secretos ni archivos fuera del proyecto. Un watcher externo detectó el mensaje ${message.id} dirigido a ti en el canal ${access.channel_id}. Usa MCP get_inbox, lee esa solicitud y revisa los archivos actuales src y tests sin modificarlos. Ejecuta las pruebas si puedes. Publica UN mensaje en español en el canal con post_message, reply_to=${message.id}, operation_id UUID nuevo y mentions=[]: explica qué existe y qué falta realmente. Confirma esa recepción con ack_messages. No respondas a otros mensajes ni inicies otros agentes. Nunca imprimas credenciales. No afirmes éxito si faltan archivos.`;
  const args = [
    "exec",
    "--ignore-user-config",
    "--ephemeral",
    "--skip-git-repo-check",
    "--sandbox",
    "workspace-write",
    "-c",
    'approval_policy="never"',
    "-c",
    "features.apps=false",
    "-c",
    "plugins={}",
    "-c",
    'mcp_servers={agentchannels={url="http://localhost:14316/mcp",bearer_token_env_var="AGENT_CHANNELS_TOKEN",default_tools_approval_mode="auto"}}',
    "--json",
    "-",
  ];
  const chunks: Buffer[] = [];
  const exit = await new Promise<number>((resolve) => {
    const proc = spawn("codex", args, {
      cwd: access.project,
      env: { ...process.env, AGENT_CHANNELS_TOKEN: access.token },
      stdio: ["pipe", "pipe", "pipe"],
    });
    proc.stdout.on("data", (d) => chunks.push(d));
    proc.stderr.on("data", (d) => chunks.push(d));
    const timer = setTimeout(() => proc.kill("SIGTERM"), 90000);
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve(code ?? 1);
    });
    proc.stdin.end(prompt);
  });
  await writeFile(
    "work/live-reaction.log",
    Buffer.concat(chunks).toString().replaceAll(access.token, "[REDACTED]"),
    { mode: 0o600 },
  );
  console.log(
    "Codex terminó con código " +
      exit +
      ". Verificar la respuesta real en el canal.",
  );
} finally {
  await client.close();
}
