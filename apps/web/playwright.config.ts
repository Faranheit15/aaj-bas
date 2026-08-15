/**
 * The end-to-end runner, configured for one browser and four specs.
 *
 * ADR-0010 records why this suite exists at all: "the edition opens in
 * airplane mode" is not a property of any source text but of Cache Storage
 * after a real load, read back by a real fetch handler on a real navigation,
 * and jsdom has none of those things. It also records why the suite is
 * merge-blocking and yet deliberately outside `bun run check` -- `check` is
 * every slice's inner loop and must not need a browser download and a second
 * language runtime.
 *
 * Chromium only, because Playwright supports service workers on Chromium
 * alone. What is therefore NOT verified anywhere is stated in ADR-0010's
 * consequences rather than implied by this list: iOS Safari above all, which
 * evicts stored data after roughly seven days of non-use and is where this
 * product's offline behaviour will diverge most.
 *
 * No `webServer`. That option starts a server before the run and stops it
 * after, and the entire mechanism here is a server being stopped IN THE MIDDLE
 * of a spec -- so each spec owns its server's lifetime, and
 * `scripts/serve-dist.ts` is spawned and killed by the spec itself.
 */
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",

  /*
    Serial, single worker, no retries, and each of the three is load-bearing.

    Every spec binds a port, installs a service worker at an origin, and then
    ends the process holding that port. Two of those running at once would
    share neither the port nor a coherent notion of "the network is gone".

    `retries: 0` is the important one. A flaky offline test that passes on the
    second attempt is worse than no test: it reports that the edition opens
    offline while telling nobody that it did not the first time, which is the
    same class of false green ADR-0009 refused axe over and ADR-0010 refused
    `setOffline` over. A failure here should be read, not re-run.
  */
  fullyParallel: false,
  workers: 1,
  retries: 0,

  // Generous because the specs build the application they test: a fixture
  // build, and in the update spec a second one, happen inside the run.
  timeout: 180_000,

  reporter: "list",

  // Playwright creates this directory the moment a spec fails, and this
  // repository's `.gitignore` does not cover the default `test-results/`.
  // Pointed inside `node_modules`, which it does cover, so a failing run
  // leaves no untracked directory behind for someone to commit by accident.
  outputDir: "node_modules/.playwright-results",

  use: {
    /*
      SET EXPLICITLY THOUGH IT IS ALREADY THE DEFAULT.

      `'block'` would stop every service worker from registering, and not one
      assertion below would fail as a result -- the edition renders perfectly
      well online with no worker, the shell is served by the fixture, and the
      only specs that would break are the offline ones, which would then break
      loudly. But the same setting arriving with a future Playwright default
      change, or copied in from an unrelated recipe, is a one-word edit that
      makes this suite measure an application with no worker in it. Written
      down, it has to be deleted deliberately.
    */
    serviceWorkers: "allow",

    // Artefact capture belongs to AB-901, which owns the end-to-end journeys.
    // This slice's four specs assert values and read no screenshots.
    screenshot: "off",
    trace: "off",
    video: "off",
  },

  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        // The binary CI installs with `playwright install chromium
        // --only-shell`. Without naming the channel, Playwright launches the
        // full Chromium build, which that install deliberately does not fetch.
        channel: "chromium-headless-shell",
      },
    },
  ],
});
