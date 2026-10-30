/** Verify the production Next UI against isolated data; never the user's account. */
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const dir = await mkdtemp(join(tmpdir(), "agentchannels-next-ui-"));
const base = "http://localhost:14319";
const child = spawn(process.execPath, ["--import", "tsx", "src/start-web.ts"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: "14319", DATA_DIR: dir, BASE_URL: base },
  stdio: ["ignore", "pipe", "pipe"],
});
let startup = "";
child.stdout.on("data", (chunk) => (startup += chunk.toString()));
child.stderr.on("data", (chunk) => (startup += chunk.toString()));
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null)
      throw new Error("No se pudo iniciar la interfaz de prueba.");
    try {
      const response = await fetch(base + "/api/status");
      if (response.ok) {
        const state = (await response.json()) as { needs_setup: boolean };
        if (!state.needs_setup)
          throw new Error(
            "El puerto de pruebas está ocupado por un espacio configurado. Detén la instancia de prueba anterior.",
          );
        ready = true;
        break;
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes("ocupado")) throw e;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  if (!ready) throw new Error("La interfaz de prueba no quedó disponible.");
  const exit = await new Promise<number>((resolve) => {
    const test = spawn(
      process.execPath,
      [
        "node_modules/@playwright/test/cli.js",
        "test",
        "--config",
        "web/playwright.config.ts",
      ],
      {
        stdio: "inherit",
        env: { ...process.env, AGENT_CHANNELS_TEST_URL: base },
      },
    );
    test.on("exit", (c) => resolve(c ?? 1));
  });
  process.exitCode = exit;
} finally {
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    if (child.exitCode !== null) return resolve();
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
  await rm(dir, { recursive: true, force: true });
}
