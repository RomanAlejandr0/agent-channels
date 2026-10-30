/** ACP adapter for installed Antigravity; per-session MCP, no global config changes. */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const cwd = process.cwd(),
  token = process.env.AGENT_CHANNELS_TOKEN;
let prompt = "";
for await (const chunk of process.stdin) prompt += chunk;
if (!token) throw new Error("Missing private agent token.");
const proc = spawn(
  process.env.PILOT_AGY_BIN || "agy",
  [
    "acp",
    "--stdio",
    "--disable-telemetry",
    "--include-default-customizations=false",
  ],
  { cwd, env: process.env, stdio: ["pipe", "pipe", "pipe"] },
);
proc.stderr.on("data", (chunk) =>
  process.stderr.write(chunk.toString().replaceAll(token, "[REDACTED]")),
);
process.once("SIGTERM", () => {
  proc.kill("SIGTERM");
  setTimeout(() => process.exit(143), 1500).unref();
});
const rl = createInterface({ input: proc.stdout }),
  waiters = new Map();
let seq = 0;
const send = (m) => proc.stdin.write(JSON.stringify(m) + "\n");
const safePath = (p) => {
  const x = resolve(cwd, p);
  if (x !== cwd && !x.startsWith(cwd + "/"))
    throw new Error("Outside pilot workspace.");
  return x;
};
rl.on("line", async (line) => {
  let m;
  try {
    m = JSON.parse(line);
  } catch {
    return;
  }
  if (m.method && m.id !== undefined) {
    try {
      let result;
      if (m.method === "fs/read_text_file") {
        result = { content: await readFile(safePath(m.params.path), "utf8") };
      } else if (m.method === "fs/write_text_file") {
        const path = safePath(m.params.path);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, m.params.content);
        result = {};
      } else if (m.method === "session/request_permission") {
        const locations = m.params.toolCall?.locations || [];
        const allowed = locations.every((l) => {
          try {
            safePath(l.path);
            return true;
          } catch {
            return false;
          }
        });
        const option = allowed
          ? m.params.options.find((o) => o.kind === "allow_once")
          : null;
        result = {
          outcome: option
            ? { outcome: "selected", optionId: option.optionId }
            : { outcome: "cancelled" },
        };
      } else throw new Error("Unsupported pilot client callback.");
      send({ jsonrpc: "2.0", id: m.id, result });
    } catch {
      send({
        jsonrpc: "2.0",
        id: m.id,
        error: {
          code: -32602,
          message: "Request outside allowed pilot operations.",
        },
      });
    }
    return;
  }
  if (m.id !== undefined) {
    const w = waiters.get(m.id);
    if (w) {
      clearTimeout(w.timer);
      waiters.delete(m.id);
      m.error
        ? w.reject(
            new Error(
              "ACP error " +
                JSON.stringify(m.error).replaceAll(token, "[REDACTED]"),
            ),
          )
        : w.resolve(m.result);
    }
  } else if (m.method === "session/update")
    process.stdout.write(
      JSON.stringify(m).replaceAll(token, "[REDACTED]") + "\n",
    );
});
proc.on("exit", () => {
  for (const w of waiters.values()) {
    clearTimeout(w.timer);
    w.reject(new Error("Antigravity ACP exited."));
  }
  waiters.clear();
});
function rpc(method, params) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      waiters.delete(id);
      reject(new Error("ACP timeout"));
    }, 120000);
    waiters.set(id, { resolve, reject, timer });
    send({ jsonrpc: "2.0", id, method, params });
  });
}
try {
  const init = await rpc("initialize", {
    protocolVersion: 1,
    clientCapabilities: {
      fs: { readTextFile: true, writeTextFile: true },
      terminal: false,
    },
    clientInfo: { name: "agentchannels-pilot", version: "0.1.0" },
  });
  console.log(JSON.stringify({ native_agent: init.agentInfo }));
  const session = await rpc("session/new", {
    cwd,
    mcpServers: [
      {
        name: "agentchannels",
        command: process.execPath,
        args: [fileURLToPath(new URL("./mcp-stdio.mjs", import.meta.url))],
        env: [
          { name: "AGENT_CHANNELS_TOKEN", value: token },
          { name: "AGENT_CHANNELS_URL", value: process.env.AGENT_CHANNELS_URL },
        ],
      },
    ],
  });
  const selected =
    process.env.PILOT_ANTIGRAVITY_MODEL ||
    process.env.PILOT_GEMINI_MODEL ||
    "gemini-3.8-flash-medium";
  if (session.models) {
    await rpc("session/set_model", {
      sessionId: session.sessionId,
      modelId: selected,
    });
  } else if (session.configOptions?.some((o) => o.id === "model"))
    await rpc("session/set_config_option", {
      sessionId: session.sessionId,
      configId: "model",
      value: selected,
    });
  console.log(JSON.stringify({ model: selected, session_created: true }));
  const result = await rpc("session/prompt", {
    sessionId: session.sessionId,
    prompt: [{ type: "text", text: prompt }],
  });
  console.log(JSON.stringify({ result }));
} finally {
  proc.stdin.end();
  proc.kill("SIGTERM");
  setTimeout(() => proc.kill("SIGKILL"), 2000).unref();
}
