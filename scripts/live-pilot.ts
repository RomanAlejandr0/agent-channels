/** Open the isolated real-agent pilot in Next; never changes production accounts. */
import { readFile, writeFile } from "node:fs/promises";
import { Service } from "../src/service.js";
import { MessageCipher } from "../src/encryption.js";
import { OAuthProvider } from "../src/oauth.js";
import { resolve, join } from "node:path";
import { Database } from "../src/db.js";
import { passwordHash, id } from "../src/security.js";
const evidence = JSON.parse(
  await readFile("docs/evidence/pilot-real-agents.json", "utf8"),
);
const directory = resolve(evidence.run_directory),
  allowed = resolve("work/real-pilot") + "/";
if (!directory.startsWith(allowed))
  throw new Error("La vista en vivo solo admite una base aislada del piloto.");
const db = await Database.open(join(directory, "data"));
try {
  const email = "viewer@pilot.example.test";
  let viewer = (await db.query("SELECT id FROM users WHERE email=$1", [email]))
    .rows[0];
  if (!viewer) {
    const demoPassword = process.env.AGENT_CHANNELS_DEMO_PASSWORD;
    if (!demoPassword || demoPassword.length < 12)
      throw new Error(
        "Define AGENT_CHANNELS_DEMO_PASSWORD (mínimo 12 caracteres) para crear la cuenta aislada de demostración.",
      );
    const uid = id();
    await db.query(
      "INSERT INTO users(id,email,name,password,role) VALUES($1,$2,'Vista del piloto',$3,'member')",
      [uid, email, await passwordHash(demoPassword)],
    );
    viewer = { id: uid };
  }
  await db.query(
    "INSERT INTO human_members(channel_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [evidence.channel_id, viewer.id],
  );
  const service = new Service(
    db,
    "http://localhost:14316",
    await MessageCipher.load(join(directory, "data"), true),
  );
  const oauth = new OAuthProvider(service);
  const agent = (
    await db.query(
      "SELECT * FROM agents WHERE name='Codex' AND revoked=false LIMIT 1",
    )
  ).rows[0];
  const owner = (
    await db.query("SELECT id,email,name,role FROM users WHERE id=$1", [
      agent.owner_id,
    ])
  ).rows[0];
  const grant = await oauth.personalToken(owner, agent.id);
  await writeFile(
    "work/live-pilot-access.json",
    JSON.stringify({
      token: grant.access_token,
      agent_id: agent.id,
      project: evidence.project_directory,
      channel_id: evidence.channel_id,
    }),
    { mode: 0o600 },
  );
} finally {
  await db.close();
}
process.env.PORT = "14316";
process.env.BACKEND_PORT = "14318";
process.env.BASE_URL = "http://localhost:14316";
process.env.DATA_DIR = join(directory, "data");
await import("../src/start-web.js");
