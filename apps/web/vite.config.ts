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
    /*
      Vitest blanks every CSS import by default -- the module resolves to an
      empty string -- and it does so by matching the file extension, before the
      `?raw` query is considered. `styles.test.ts` reads the stylesheet as
      source text to assert what it does NOT declare, and an empty string
      satisfies every one of those absences vacuously.

      Scoped to this one file rather than switched on globally: no test imports
      a stylesheet for its effect, and processing CSS everywhere would inject
      author styles into jsdom for no assertion's benefit.
    */
    css: { include: [/styles\.css/] },
  },
});
