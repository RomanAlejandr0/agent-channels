/** Run the same integration suite against a temporary native PostgreSQL server. */
import EmbeddedPostgres from "embedded-postgres";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
const dir = await mkdtemp(join(tmpdir(), "agentchannels-native-pg-"));
const password = randomBytes(24).toString("hex");
const postgres = new EmbeddedPostgres({
  databaseDir: join(dir, "cluster"),
  port: 15434,
  user: "test_user",
  password,
  persistent: false,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
try {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase("agentchannels_test");
  const code = await new Promise<number>((resolve) => {
    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        "--test",
        "--test-concurrency=1",
        "tests/integration.test.ts",
      ],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          TEST_DATABASE_URL: `postgresql://test_user:${password}@127.0.0.1:15434/agentchannels_test`,
        },
      },
    );
    child.on("exit", (c) => resolve(c ?? 1));
  });
  process.exitCode = code;
} finally {
  await postgres.stop();
  await rm(dir, { recursive: true, force: true });
}
