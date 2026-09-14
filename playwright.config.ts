import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Frozen v1/v2 matrix semantics remain historical; v3 is the active contract.
  testIgnore: ["**/release-matrix.contract.spec.ts", "**/release-matrix-v2.contract.spec.ts", "**/release-matrix-v2.sources.spec.ts"],
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
