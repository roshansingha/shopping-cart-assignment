import { defineConfig, devices } from "@playwright/test";

const APP_PORT = 3100;
const API_PORT = 4010;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: `http://localhost:${APP_PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Servers start in order: the mock API must be up before the production build prerenders.
  webServer: [
    {
      command: "node e2e/mock-api.ts",
      url: `http://localhost:${API_PORT}/products`,
      env: { MOCK_API_PORT: String(API_PORT) },
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `corepack pnpm build && corepack pnpm start -p ${APP_PORT}`,
      url: `http://localhost:${APP_PORT}`,
      timeout: 240_000,
      reuseExistingServer: !process.env.CI,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        PRODUCTS_API_URL: `http://localhost:${API_PORT}/products`,
      },
    },
  ],
});
