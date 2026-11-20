import { defineConfig, devices } from "@playwright/test";

// Real browser E2E: no page.route(), no request fulfillment, no API stubs.
// The frontend talks to the isolated QA API on 127.0.0.1:5001 and that API
// talks to the disposable schoolflow_test_qa MongoDB database.
process.env.VITE_API_URL ||= "http://127.0.0.1:5001/api/v1";

export default defineConfig({
  testDir: "./e2e-real",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: "list",
  expect: { timeout: 15_000 },
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:5174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"]
  },
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 5174 --strictPort",
    url: "http://127.0.0.1:5174",
    reuseExistingServer: true,
    timeout: 30_000
  }
});
