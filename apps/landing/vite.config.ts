import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Vite would otherwise read .env from this app directory; environment
  // files live at the repository root.
  envDir: "../..",
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    /*
      Vitest blanks every CSS import by default -- the module resolves to an
      empty string -- and it does so by matching the file extension, before the
      `?raw` query is considered. `styles.test.ts` reads the stylesheet as
      source text to assert what it does NOT declare: no motion, nothing pinned
      to the viewport, no removed outline. An empty string satisfies every one
      of those absences vacuously, so without this entry the suite would report
      success precisely when it had failed to run. The file's positive
      assertion is what catches that, and this is what keeps the positive
      assertion satisfiable.

      `palette.css` is here for the same reason and two more readers of it.
      `styles.test.ts` checks that every token this page spends is one the
      palette declares, and `index-html.test.ts` reads the palette's two
      `--surface` values to hold the document's `theme-color` metas to them --
      both of which a blanked import turns into a check of the empty string.
      The reader's `vite.config.ts` carries the same entry for the same file.

      Scoped to these two files rather than switched on globally, as in the
      reader: no test imports a stylesheet for its effect, and processing CSS
      everywhere would inject author styles into jsdom for no assertion's
      benefit.
    */
    css: { include: [/styles\.css/, /palette\.css/] },
  },
});
