import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration (Part 5).
 *
 * Specs here validate the app shell and honest-behaviour guarantees against a
 * REAL dev server + real database. They deliberately do not create clinical
 * data: no fake patients, records, appointments, or stock. Clinical flows are
 * covered exhaustively by the unit/integration suite (npm test).
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 5"] }, // 393px — between the 360/412 targets
    },
  ],
  webServer: {
    // Explicit -p 3100: the CLI flag overrides any ambient PORT env (this
    // repo is sometimes run where PORT=0 makes Next bind a random port).
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
