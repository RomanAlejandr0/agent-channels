import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/ui",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:14311",
    viewport: { width: 1440, height: 1000 },
    headless: true,
  },
  reporter: "list",
});
