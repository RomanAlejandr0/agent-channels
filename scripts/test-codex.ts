/** Native Codex MCP discovery probe. No thread, turn, model call or global configuration write. */
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtemp, rm, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createApp } from "../src/app.js";
const bin = process.env.AGENT_CHANNELS_CODEX_BIN || "codex";
const dir = await mkdtemp(join(tmpdir(), "agentchannels-codex-"));
const base = "http://localhost:14315";
const instance = await createApp({ dataDir: dir, baseUrl: base });
const server = await new Promise<ReturnType<typeof instance.app.listen>>(
  (resolve) => {
    const s = instance.app.listen(14315, "127.0.0.1", () => resolve(s));
  },
);
const overrides = [
  "-c",
  `mcp_servers={agentchannels_probe={url="${base}/mcp",bearer_token_env_var="AGENT_CHANNELS_TOKEN",startup_timeout_sec=15}}`,
  "-c",
  "plugins={}",
  "-c",
  "features.apps=false",
  "-c",
  "analytics.enabled=false",
];
let child: ReturnType<typeof spawn> | undefined;
const configPath = join(homedir(), ".codex", "config.toml");
async function configurationHash() {
  try {
    return createHash("sha256")
      .update(await readFile(configPath))
      .digest("hex");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
const configBefore = await configurationHash();
try {
  const version = spawnSync(bin, ["--version"], { encoding: "utf8" });
  assert.equal(
    version.status,
    0,
    "Codex CLI is required for this optional native-client probe.",
  );
  const configured = spawnSync(bin, [...overrides, "mcp", "list", "--json"], {
    encoding: "utf8",
    cwd: dir,
  });
  assert.equal(
    configured.status,
    0,
    "Temporary Codex configuration could not be loaded.",
  );
  const inventory = JSON.parse(configured.stdout);
  for (const entry of inventory)
    if (entry.name !== "agentchannels_probe") {
      assert.match(
        entry.name,
        /^[A-Za-z0-9_-]+$/,
        "Cannot isolate an unusual MCP server name.",
      );
      overrides.push(
        "-c",
        `mcp_servers.${entry.name}={command="false",enabled=false}`,
      );
    }
  const isolated = spawnSync(bin, [...overrides, "mcp", "list", "--json"], {
    encoding: "utf8",
    cwd: dir,
  });
  assert.equal(isolated.status, 0, "Cannot verify isolated configuration.");
  assert.ok(
    JSON.parse(isolated.stdout)
      .filter((r: any) => r.enabled)
      .every((r: any) => r.name === "agentchannels_probe"),
    "Abort if another enabled server could be discovered.",
  );
  const password = randomUUID() + randomUUID();
  await instance.service.setup({
    email: "native-probe@example.test",
    name: "Native Codex probe",
    password,
  });
  const user = (
    await instance.service.login("native-probe@example.test", password)
  ).user;
  const channel = await instance.service.createChannel(user, {
    name: "Native client compatibility",
  });
  const agent = await instance.service.createAgent(user, {
    name: "Codex MCP probe",
  });
  await instance.service.membership(user, channel.id, {
    agent_id: agent.id,
    permission: "write",
  });
  const { access_token } = await instance.oauth.personalToken(user, agent.id);
  child = spawn(bin, [...overrides, "app-server", "--listen", "stdio://"], {
    cwd: dir,
    env: { ...process.env, AGENT_CHANNELS_TOKEN: access_token },
    stdio: ["pipe", "pipe", "pipe"],
  });
  // Native stderr can contain environment details: do not print or persist it.
  child.stderr!.resume();
  const lines = createInterface({ input: child.stdout! });
  const pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  let seq = 0;
  lines.on("line", (line) => {
    let message: any;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    const waiter = pending.get(message.id);
    if (waiter) {
      clearTimeout(waiter.timer);
      pending.delete(message.id);
      message.error
        ? waiter.reject(
            new Error("Codex RPC failed: " + String(message.error.code)),
          )
        : waiter.resolve(message.result);
    }
  });
  child.on("error", () => {
    for (const wait of pending.values()) {
      clearTimeout(wait.timer);
      wait.reject(new Error("Codex process failed."));
    }
    pending.clear();
  });
  child.on("exit", () => {
    for (const wait of pending.values()) {
      clearTimeout(wait.timer);
      wait.reject(new Error("Codex exited before discovery completed."));
    }
    pending.clear();
  });
  const send = (message: unknown) =>
    child!.stdin!.write(JSON.stringify(message) + "\n");
  function rpc(method: string, params: unknown) {
    const id = ++seq;
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("Codex native-client discovery timed out."));
      }, 25000);
      pending.set(id, { resolve, reject, timer });
      send({ id, method, params });
    });
  }
  await rpc("initialize", {
    clientInfo: { name: "agentchannels_compatibility_probe", version: "0.1.0" },
    capabilities: {
      experimentalApi: true,
      requestAttestation: false,
      explicitGatewayOauth: true,
    },
  });
  send({ method: "initialized", params: {} });
  const response = await rpc("mcpServerStatus/list", {
    serverName: "agentchannels_probe",
    detail: "toolsAndAuthOnly",
  });
  const status = response.data.find(
    (r: any) => r.name === "agentchannels_probe",
  );
  assert.ok(status, "Codex did not return the configured MCP server.");
  assert.equal(status.toolsError, null, "Native tool discovery failed.");
  const tools = Object.values(status.tools as Record<string, { name: string }>)
    .map((t) => t.name)
    .sort();
  assert.deepEqual(tools, [
    "ack_messages",
    "get_inbox",
    "get_thread",
    "list_channels",
    "post_message",
  ]);
  const events = (
    await instance.db.query(
      "SELECT count(*)::int AS n FROM audit WHERE actor=$1 AND action='connection.used'",
      [agent.id],
    )
  ).rows[0].n;
  assert.ok(
    events >= 1,
    "Native discovery did not authenticate against the fixture server.",
  );
  assert.equal(
    await configurationHash(),
    configBefore,
    "Global Codex configuration changed unexpectedly.",
  );
  const evidence = {
    recorded_at: new Date().toISOString(),
    client: version.stdout.trim(),
    transport: "streamable-http",
    authentication: "per-agent-bearer",
    result: "native-discovery-passed",
    tools,
    threads_created: 0,
    turns_started: 0,
    global_configuration_changed: false,
    scope:
      "Authenticated native MCP tool discovery only; no model calls, autonomous-agent exchange or schedules tested.",
  };
  await mkdir(new URL("../docs/evidence/", import.meta.url), {
    recursive: true,
  });
  await writeFile(
    new URL("../docs/evidence/codex-native-discovery.json", import.meta.url),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence, null, 2));
  console.log(
    "Esta evidencia verifica el descubrimiento MCP nativo. No verifica llamadas de un modelo ni ejecuciones programadas.",
  );
} finally {
  if (child) {
    child.stdin?.end();
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child!.kill("SIGKILL");
          resolve();
        }, 3000);
        child!.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await instance.db.close();
  await rm(dir, { recursive: true, force: true });
}
