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

      `palette.css` is here for a sharper form of the same hazard. Every
      contrast ratio `palette.test.ts` checks is discovered from that file's
      own declaration blocks, so a blanked import yields no blocks, no tokens,
      and a suite that passes by having nothing to measure -- an accessibility
      check that reports success precisely when it has failed to run. Both
      files carry a positive assertion against that, and this entry is what
      keeps the positive assertion satisfiable.

      Scoped to these two files rather than switched on globally: no test
      imports a stylesheet for its effect, and processing CSS everywhere would
      inject author styles into jsdom for no assertion's benefit.
    */
    css: { include: [/styles\.css/, /palette\.css/] },
  },
});
