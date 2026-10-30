import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  workers: 1,
  fullyParallel: false,
  timeout: 60000,
  reporter: "list",
  use: {
    baseURL: process.env.AGENT_CHANNELS_TEST_URL || "http://localhost:14319",
    viewport: { width: 1440, height: 1000 },
    headless: true,
  },
});
