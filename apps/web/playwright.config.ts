/**
 * The end-to-end runner, configured for desktop and mobile Chromium projects.
 *
 * ADR-0010 & AB-901:
 * Real browser verification of critical journeys, offline resilience, and error fallback.
 */
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: "list",
  outputDir: "node_modules/.playwright-results",

  use: {
    serviceWorkers: "allow",
    screenshot: "only-on-failure",
    trace: "off",
    video: "off",
  },

  projects: [
    {
      name: "Desktop Chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chromium-headless-shell",
      },
    },
    {
      name: "Mobile Chrome",
      use: {
        ...devices["Pixel 5"],
        channel: "chromium-headless-shell",
      },
    },
  ],
});
