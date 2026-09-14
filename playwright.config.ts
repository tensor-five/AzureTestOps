import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Frozen v1 suite-root expectations are historical; v2 is the active matrix contract.
  testIgnore: "**/release-matrix.contract.spec.ts",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:8081",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"]
  }
});
