import { defineConfig, devices } from "@playwright/test";
const hosted = !!process.env.E2E_BASE_URL;
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [
    ["list"],
    [
      "html",
      {
        open: "never",
        outputFolder: hosted
          ? "docs/evidence/hosted-browser-report"
          : "docs/evidence/browser-report",
      },
    ],
    [
      "json",
      {
        outputFile: hosted
          ? "docs/evidence/playwright-hosted-results.json"
          : "docs/evidence/playwright-results.json",
      },
    ],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1080 },
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1440, height: 1080 },
      },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1440, height: 1080 },
      },
    },
  ],
  webServer: hosted
    ? undefined
    : {
        command: process.env.E2E_SERVER_COMMAND ?? "npm run dev",
        url: "http://localhost:3000/login",
        reuseExistingServer: true,
        timeout: 120_000,
      },
});
