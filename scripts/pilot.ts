/** Reproducible protocol pilot. These are SDK clients, not autonomous AI agents. */
import { createApp } from "../src/app.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const dir = await mkdtemp(join(tmpdir(), "agentchannels-pilot-")),
  base = "http://localhost:14312";
const instance = await createApp({ dataDir: dir, baseUrl: base });
const server = await new Promise<ReturnType<typeof instance.app.listen>>(
  (resolve) => {
    const s = instance.app.listen(14312, "127.0.0.1", () => resolve(s));
  },
);
const clients: Client[] = [];
try {
  const password = randomUUID() + randomUUID();
  await instance.service.setup({
    email: "owner@example.test",
    name: "Owner",
    password,
  });
  const owner = (await instance.service.login("owner@example.test", password))
    .user;
  const channel = await instance.service.createChannel(owner, {
    name: "Piloto MCP",
  });
  const invite = await instance.service.invite(owner, {
    email: "friend@example.test",
    channel_id: channel.id,
  });
  await instance.service.acceptInvite({
    email: "friend@example.test",
    name: "Friend",
    password,
    invite: new URL(invite.url).searchParams.get("invite"),
  });
  const friend = (await instance.service.login("friend@example.test", password))
    .user;
  const a = await instance.service.createAgent(owner, { name: "Cliente A" }),
    b = await instance.service.createAgent(friend, { name: "Cliente B" });
  for (const agent of [a, b])
    await instance.service.membership(owner, channel.id, {
      agent_id: agent.id,
      permission: "write",
    });
  async function connect(user: typeof owner, aid: string, name: string) {
    const token = await instance.oauth.personalToken(user, aid);
    const c = new Client({ name, version: "1" });
    await c.connect(
      new StreamableHTTPClientTransport(new URL(base + "/mcp"), {
        requestInit: {
          headers: { Authorization: "Bearer " + token.access_token },
        },
      }),
    );
    clients.push(c);
    return c;
  }
  const ca = await connect(owner, a.id, "sdk-pilot-a");
  async function call(
    c: Client,
    name: string,
    args: Record<string, unknown> = {},
  ) {
    const r = await c.callTool({ name, arguments: args });
    assert.ok(!r.isError);
    return JSON.parse((r.content as any)[0].text);
  }
  const input = {
    channel_id: channel.id,
    body: "¿Puedes revisar el contraste?",
    operation_id: randomUUID(),
    mentions: [b.id],
  };
  const sent = await call(ca, "post_message", input);
  assert.equal((await call(ca, "post_message", input)).id, sent.id);
  await ca.close();
  console.log(
    "✓ Cliente A publicó y se desconectó; reintentar no duplicó el mensaje.",
  );
  const cb = await connect(friend, b.id, "sdk-pilot-b");
  const inbox = await call(cb, "get_inbox");
  assert.equal(inbox.messages.length, 1);
  await call(cb, "post_message", {
    channel_id: channel.id,
    body: "Revisado: el contraste es suficiente.",
    operation_id: randomUUID(),
    reply_to: sent.id,
  });
  await call(cb, "ack_messages", { message_ids: [sent.id] });
  await cb.close();
  console.log(
    "✓ Cliente B recibió, respondió y confirmó la recepción después.",
  );
  const returned = await connect(owner, a.id, "sdk-pilot-a-return");
  assert.equal((await call(returned, "get_inbox")).messages.length, 1);
  assert.equal(
    (await call(returned, "get_thread", { message_id: sent.id })).messages
      .length,
    2,
  );
  await instance.service.revokeAgent(owner, a.id);
  await assert.rejects(() => returned.listTools());
  console.log(
    "✓ Cliente A recuperó la respuesta; la revocación bloqueó la conexión existente.",
  );
  console.log(
    "Piloto de protocolo completado. Falta validar aplicaciones de IA y sus ejecuciones programadas reales.",
  );
} finally {
  for (const c of clients) await c.close();
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await instance.db.close();
  await rm(dir, { recursive: true, force: true });
}
