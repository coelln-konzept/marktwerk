import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke tests against a running, seeded app (`pnpm --filter @marktwerk/web test:e2e`).
 * The app is not started here: run `pnpm dev` (or `next start` after a build) first, or point
 * E2E_BASE_URL at a deployed instance. See docs/development/testing.md.
 *
 * Env: E2E_BASE_URL (default http://localhost:3000), E2E_EMAIL / E2E_PASSWORD (default: the seeded
 * owner), E2E_CHROMIUM_PATH (use an already installed Chromium instead of Playwright's own).
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const executablePath = process.env.E2E_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    locale: "de-DE",
    timezoneId: "Europe/Berlin",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: { executablePath },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: "e2e/.auth/owner.json",
      },
      dependencies: ["setup"],
      testIgnore: /auth\.setup\.ts/,
    },
  ],
});
