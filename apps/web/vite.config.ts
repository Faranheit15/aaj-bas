import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    // Pinned away from the editorial timezone on purpose. Section 41 makes the
    // edition date a calendar day in Asia/Kolkata, so any code that reads the
    // host timezone instead must fail here rather than only for readers who
    // are not in the zone the tests happened to run in.
    env: { TZ: "America/Los_Angeles" },
  },
});
