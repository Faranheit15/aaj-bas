/**
 * The four things about offline reading that only a browser can answer.
 *
 * AB-206's acceptance criteria are properties of Cache Storage after a real
 * load, read back by a real fetch handler on a real navigation. Every pure
 * decision the worker makes is already tested as a value in
 * `src/service-worker/cache-plan.test.ts`; what is left is the part that a
 * mock would have to be written to satisfy, and ADR-0010 records why that
 * makes a mock worthless here.
 *
 * OFFLINE IS PRODUCED BY ENDING A SERVER PROCESS, NEVER BY `setOffline`.
 *
 * That is the single most important sentence in this file.
 * `browserContext.setOffline(true)` does not apply to requests a service
 * worker makes itself in Chromium (microsoft/playwright#2311, closed as low
 * priority, no fix). Under it the worker's own `fetch` still reaches the
 * network, so a spec that loads the page, goes "offline", reloads and finds
 * the edition PASSES WITH AN EMPTY CACHE AND A WORKER THAT STORES NOTHING.
 * Green by construction, proving the opposite of what it appears to prove.
 * `scripts/serve-dist.ts` exists so that a stop is a real stop.
 *
 * AND EVERY OFFLINE SPEC ASSERTS ITS OWN PRECONDITION, BOTH WAYS.
 *
 * A test that produces its own precondition can fail to produce it, and this
 * one produces it by killing another process. So `probeNetwork` is called
 * while the server is up and asserted reachable, and again after it is stopped
 * and asserted unreachable, before any positive claim is made about what the
 * reader can still see. That is the same guard `src/palette.test.ts` carries
 * when it asserts the stylesheet was actually read rather than blanked by the
 * bundler, and it is there for the same reason: a check that reports success
 * precisely when it failed to run is worse than no check.
 *
 * The fixture is built here rather than assumed, and it is pinned to the
 * historical sample as the latest entry even when the repository contains a
 * real edition. `test.afterAll` puts the published build back.
 */
import { readdir, unlink, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import { expect, type Page, test } from "@playwright/test";
import { CACHE_PREFIX, CONTENT_CACHE } from "../src/service-worker/cache-names";

/** `apps/web`, and the repository root above it, from this file's location. */
const WEB_ROOT = `${import.meta.dirname}/..`;
const REPOSITORY_ROOT = `${WEB_ROOT}/../..`;
const DIST = `${WEB_ROOT}/dist`;
const PUBLIC_CONTENT = `${WEB_ROOT}/public/content`;
const STAGED_EDITIONS = `${PUBLIC_CONTENT}/editions`;
const FIXTURE_EDITION_DATE = "2026-07-21";

/**
 * The notice `edition-notice.ts` owns for a saved copy of an edition that is
 * not today's, asserted as the string rather than as "a notice is shown".
 *
 * It is `stale` and not `current` because the fixture edition is dated in the
 * past and cannot become today again. If a future edition dated today is ever
 * published into `content/editions`, this assertion fails loudly and is meant
 * to be re-decided rather than loosened -- the other five cells of that copy
 * table are each a different sentence for a reason.
 */
const SAVED_COPY_NOTICE =
  "This is the most recent edition saved on this device. It is not today's edition.";

/**
 * Sentences `edition-notice.ts` names and forbids, plus the one claim of
 * currency the product must never make about a saved copy.
 *
 * Asserted absent from the whole rendered page, not just from the notice: the
 * failure this guards against is a well-meant addition somewhere else -- a
 * banner, a footer line, a status message -- and a check scoped to the notice
 * would not see it.
 */
const FORBIDDEN_WHILE_SHOWING_A_SAVED_COPY = [
  "You are offline",
  "You appear to be offline",
  "Check your connection",
  "Reconnect",
  "Offline mode",
  "Showing cached content",
  "Some content may be missing",
  "Last updated",
  "Update available",
  "This is today's edition",
] as const;

interface Served {
  readonly origin: string;
  /** The bound port, so a restart can rebind it. A new port is a new origin. */
  readonly port: number;
  stop(): Promise<void>;
}

/**
 * Servers a spec started, stopped after it whether it passed or not.
 *
 * Every `stop` here is idempotent, and that is not defensive tidiness: a spec
 * stops its server in the middle, on purpose, and the cleanup below then stops
 * it again. `kill` on a process that has already exited emits no `"exit"`, so
 * an unguarded second stop waits for an event that can never arrive and the
 * spec fails on a timeout in its own teardown.
 */
const running: (() => Promise<void>)[] = [];

function run(command: string, args: readonly string[], cwd: string): void {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });

  if (result.error !== undefined || result.status !== 0) {
    throw new Error(
      [
        `${command} ${args.join(" ")} failed in ${cwd}`,
        `status ${String(result.status)}`,
        result.stdout,
        result.stderr,
      ].join("\n"),
    );
  }
}

/**
 * Build `apps/web/dist`.
 *
 * The repository's own three steps, in the repository's own order, rather than
 * a bespoke bundle: `vite build` emits the content-hashed names, and
 * `build-service-worker.ts` reads that output to compute the precache list and
 * the build id from it. A fixture that skipped the third step would serve a
 * `sw.js` describing a build that no longer exists.
 */
async function pinSampleAsLatest(): Promise<void> {
  for (const name of await readdir(STAGED_EDITIONS)) {
    if (name !== `${FIXTURE_EDITION_DATE}.json`) {
      await unlink(`${STAGED_EDITIONS}/${name}`);
    }
  }
  await writeFile(
    `${PUBLIC_CONTENT}/latest.json`,
    `${JSON.stringify(
      {
        schemaVersion: 1,
        contentSet: "sample",
        latest: FIXTURE_EDITION_DATE,
        editions: [FIXTURE_EDITION_DATE],
      },
      null,
      2,
    )}\n`,
  );
}

async function buildSampleFixture(): Promise<void> {
  run(
    "bun",
    [`${REPOSITORY_ROOT}/scripts/stage-content.ts`, "--include-sample-data"],
    REPOSITORY_ROOT,
  );
  await pinSampleAsLatest();
  run("bunx", ["vite", "build"], WEB_ROOT);
  run(
    "bun",
    [`${REPOSITORY_ROOT}/scripts/build-service-worker.ts`],
    REPOSITORY_ROOT,
  );
}

function build(options: {
  readonly sample: boolean;
  readonly vary: boolean;
}): void {
  run(
    "bun",
    [
      `${REPOSITORY_ROOT}/scripts/stage-content.ts`,
      ...(options.sample ? ["--include-sample-data"] : []),
    ],
    REPOSITORY_ROOT,
  );

  /*
    `--minify false` is how the second build differs from the first, and the
    difference is real rather than cosmetic: Vite names assets by a hash of
    their contents, so unminified output lands at different `/assets/` URLs,
    which changes the precache list, which changes the build id, which changes
    `sw.js` -- exactly the chain any source change would set off.

    It is used in place of editing a source file, which is what a reader might
    expect. A spec that rewrote tracked source to make a build differ would
    leave the repository modified if it failed midway, and would be editing the
    application under test from inside the test.
  */
  run(
    "bunx",
    ["vite", "build", ...(options.vary ? ["--minify", "false"] : [])],
    WEB_ROOT,
  );
  run(
    "bun",
    [`${REPOSITORY_ROOT}/scripts/build-service-worker.ts`],
    REPOSITORY_ROOT,
  );
}

async function startServer(
  port: number,
  failing: readonly string[] = [],
): Promise<Served> {
  const child = spawn(
    "bun",
    [
      `${REPOSITORY_ROOT}/scripts/serve-dist.ts`,
      DIST,
      "--port",
      String(port),
      ...failing.flatMap((prefix) => ["--fail", prefix]),
    ],
    { cwd: REPOSITORY_ROOT },
  );

  let exited = false;

  child.once("exit", () => {
    exited = true;
  });

  let stopping: Promise<void> | null = null;

  const stop = (): Promise<void> => {
    if (exited) {
      return Promise.resolve();
    }

    stopping ??= new Promise<void>((resolve) => {
      // Registered before the signal is sent, so the event cannot be missed.
      child.once("exit", () => {
        resolve();
      });
      child.kill("SIGTERM");
    });

    return stopping;
  };

  running.push(stop);

  const bound = await new Promise<number>((resolve, reject) => {
    let printed = "";
    let failure = "";

    child.stderr.on("data", (chunk) => {
      failure += String(chunk);
    });

    child.stdout.on("data", (chunk) => {
      printed += String(chunk);

      const announced = /serve-dist listening on port (\d+)/.exec(printed);
      if (announced?.[1] !== undefined) {
        resolve(Number(announced[1]));
      }
    });

    // Exiting before it announces a port is the failure worth naming: it means
    // the port could not be bound, and every assertion after this would
    // otherwise be made against an origin nothing is serving.
    child.once("exit", () => {
      reject(new Error(`serve-dist exited without binding a port\n${failure}`));
    });

    // `"exit"` is never emitted when the command could not be started, so
    // without this a missing `bun` would leave this promise pending until the
    // test timed out with nothing to say about why.
    child.once("error", (unstartable) => {
      reject(unstartable);
    });
  });

  return {
    origin: `http://127.0.0.1:${String(bound)}`,
    port: bound,
    // Awaited by every caller, never fired and forgotten. The assertion that
    // follows a stop is that the network is gone, and a spec that raced the
    // process's death would report a flake where the product is fine.
    stop,
  };
}

/** Load `/` and wait for an active, controlling worker. */
async function openEdition(page: Page, origin: string): Promise<void> {
  await page.goto(`${origin}/`);

  // `ready` resolves only once a worker is ACTIVE, and `install()` warms the
  // pointer and today's edition inside `event.waitUntil`, so activation
  // implies the content cache has been written. Waiting on `controller` alone
  // would resolve before that.
  await page.evaluate(() =>
    navigator.serviceWorker.ready.then(() => undefined),
  );
}

/**
 * Whether a request that nothing could have cached reaches anything.
 *
 * The path is unique per call and matches no precached name, so a "reachable"
 * answer can only have come from a live server. `planRequest` ignores it --
 * it is not `/content/`, not `/assets/`, and not a navigation -- so the
 * browser makes it exactly as it would with no worker installed.
 */
async function probeNetwork(page: Page): Promise<"reachable" | "unreachable"> {
  return page.evaluate(() =>
    fetch(`/__never-cached-${String(Date.now())}`).then(
      () => "reachable" as const,
      () => "unreachable" as const,
    ),
  );
}

/** Paths the worker has written into the content cache. */
async function cachedContentPaths(
  page: Page,
): Promise<{ readonly cacheNames: string[]; readonly paths: string[] }> {
  return page.evaluate(async (contentCache) => {
    const cacheNames = await caches.keys();

    if (!cacheNames.includes(contentCache)) {
      return { cacheNames, paths: [] };
    }

    const held = await (await caches.open(contentCache)).keys();

    return {
      cacheNames,
      paths: held.map((request) => new URL(request.url).pathname),
    };
  }, CONTENT_CACHE);
}

async function shellCacheNames(page: Page): Promise<string[]> {
  return page.evaluate(
    async (prefix) =>
      (await caches.keys()).filter((name) =>
        name.startsWith(`${prefix}shell-`),
      ),
    CACHE_PREFIX,
  );
}

/** The hashed application bundle this document loads. */
async function servedScript(page: Page): Promise<string> {
  const src = await page.evaluate(
    () => document.querySelector("script[src]")?.getAttribute("src") ?? null,
  );

  expect(
    src,
    "the shell should load one hashed application bundle",
  ).not.toBeNull();

  return src ?? "";
}

function editionHeading(page: Page) {
  return page.getByRole("heading", { level: 1 });
}

/** The rendered edition's story list. Ten, which is what the product promises. */
function storyList(page: Page) {
  return page.locator("ol.edition-stories > li.edition-story");
}

test.beforeAll(async () => {
  test.setTimeout(300_000);
  await buildSampleFixture();
});

test.afterEach(async () => {
  while (running.length > 0) {
    const stop = running.pop();

    if (stop !== undefined) {
      await stop();
    }
  }
});

test.afterAll(() => {
  test.setTimeout(300_000);

  // The published build, which is what `bun run build` leaves behind and what
  // every other check in this repository expects to find in `dist`.
  build({ sample: false, vary: false });
});

test("the edition opens after the network is gone", async ({ page }) => {
  const server = await startServer(0);

  await openEdition(page, server.origin);

  await expect(editionHeading(page)).toHaveText(/^Edition of /);
  await expect(storyList(page)).toHaveCount(10);

  /*
    BEFORE ANYTHING IS STOPPED, AND BEFORE ANY OFFLINE CLAIM IS MADE.

    An empty cache is the exact state in which the rest of this spec would pass
    for the wrong reason under `setOffline`, so what the worker actually stored
    is asserted first: at least one cache, and an edition inside the content
    cache. If this fails, nothing below it means anything.
  */
  const stored = await cachedContentPaths(page);

  expect(
    stored.cacheNames.length,
    "the worker should have opened caches",
  ).toBeGreaterThan(0);
  expect(
    stored.paths.filter((path) => path.startsWith("/content/editions/")),
    "the content cache should hold the edition the pointer named",
  ).not.toHaveLength(0);

  // The probe is meaningful only if it can say "reachable", so it is made to
  // say it while the server is still up.
  expect(await probeNetwork(page)).toBe("reachable");

  await server.stop();

  expect(
    await probeNetwork(page),
    "the server must actually be gone; this spec proves nothing otherwise",
  ).toBe("unreachable");

  await page.reload();

  await expect(editionHeading(page)).toHaveText(/^Edition of /);
  await expect(storyList(page)).toHaveCount(10);
});

test("a failed update leaves the last good edition", async ({ page }) => {
  const good = await startServer(0);

  await openEdition(page, good.origin);
  await expect(editionHeading(page)).toHaveText(/^Edition of /);

  const before = await cachedContentPaths(page);
  const editions = before.paths.filter((path) =>
    path.startsWith("/content/editions/"),
  );

  expect(editions).not.toHaveLength(0);

  await good.stop();

  // The same origin, so the same registration and the same caches. A new port
  // would be a new origin holding neither.
  const failing = await startServer(good.port, ["/content/"]);

  await page.reload();

  /*
    THE READER IS TOLD, AND THIS IS THE DELIBERATE BEHAVIOUR RATHER THAN THE
    REGRETTABLE ONE.

    The worker is network-first for content and returns a response that
    ARRIVED whatever it says, so a 500 is passed through to the reader instead
    of being papered over with yesterday's text. `cache-plan.ts` argues it at
    length: substituting a saved copy for a response the host actually sent
    would hide a withdrawn or corrected edition behind a stale one, which
    section 46 forbids and section 26 calls presenting stale content as
    current.

    So the criterion is not "the reader never notices a failed update". It is
    that the failure does not COST them the copy they already had -- which is
    what the rest of this spec goes on to prove.
  */
  await expect(editionHeading(page)).toHaveText(
    "The edition could not be loaded.",
  );

  const during = await cachedContentPaths(page);

  expect(
    during.paths.filter((path) => path.startsWith("/content/editions/")),
    "a 500 must not be written over a good saved edition",
  ).toEqual(editions);

  expect(await probeNetwork(page)).toBe("reachable");

  await failing.stop();

  expect(
    await probeNetwork(page),
    "the server must actually be gone; this spec proves nothing otherwise",
  ).toBe("unreachable");

  await page.reload();

  // The last good edition, still there, after a failed update and then a lost
  // network. This is acceptance criterion 2.
  await expect(editionHeading(page)).toHaveText(/^Edition of /);
  await expect(storyList(page)).toHaveCount(10);
  await expect(page.locator("p.edition-notice")).toContainText(
    SAVED_COPY_NOTICE,
  );
});

test("a cached edition is not presented as live", async ({ page }) => {
  const server = await startServer(0);

  await openEdition(page, server.origin);

  // Online, this edition carries the network notice for its freshness, and
  // never the saved-copy sentence. Asserted so that the sentence below is
  // known to be caused by the cache rather than always present.
  await expect(page.locator("p.edition-notice")).not.toContainText(
    SAVED_COPY_NOTICE,
  );

  expect(await probeNetwork(page)).toBe("reachable");

  await server.stop();

  expect(
    await probeNetwork(page),
    "the server must actually be gone; this spec proves nothing otherwise",
  ).toBe("unreachable");

  await page.reload();

  const notice = page.locator("p.edition-notice");

  // The string the component owns, not "a notice exists". Which of the six
  // cells of that copy table is rendered is the whole of the behaviour.
  await expect(notice).toHaveText(
    new RegExp(`^${escapeForRegExp(SAVED_COPY_NOTICE)}`),
  );

  // Read from a response header the copy already carried, never minted on this
  // device. Its absence would be the silent way this becomes a reading
  // timestamp (ADR-0007).
  await expect(notice).toContainText("Downloaded");

  const rendered = (await page.locator("body").innerText()).replace(
    /\s+/g,
    " ",
  );

  for (const forbidden of FORBIDDEN_WHILE_SHOWING_A_SAVED_COPY) {
    expect(
      rendered,
      `a saved copy must not be described as "${forbidden}"`,
    ).not.toContain(forbidden);
  }
});

test("a new build reaches a reader who already has a worker", async ({
  page,
  request,
}) => {
  const first = await startServer(0);

  await openEdition(page, first.origin);

  const buildA = await servedScript(page);
  const shellA = await shellCacheNames(page);

  expect(shellA, "one build, one shell cache").toHaveLength(1);

  await first.stop();

  // A different build of the same source, at the same origin.
  build({ sample: true, vary: true });

  const second = await startServer(first.port);

  // Read straight from the server rather than through the browser, so this is
  // what the host is publishing rather than what the worker chose to answer.
  const published = await (
    await request.get(`${second.origin}/index.html`)
  ).text();
  const buildB = /<script[^>]+src="([^"]+\.js)"/.exec(published)?.[1] ?? "";

  expect(buildB, "the second build should emit a bundle").not.toBe("");
  expect(
    buildB,
    "the two builds must differ, or this spec proves nothing",
  ).not.toBe(buildA);

  /*
    RELOAD ONCE TO TRIGGER THE UPDATE, ONCE FOR THE NEW WORKER TO ANSWER.

    The first navigation is still answered out of the old build's shell cache;
    what it also does is start the update check. Everything the update needs
    has to work for the second navigation to serve the new bundle: a build id
    that actually changed, an install that precached the new shell, a
    `skipWaiting` and a `clients.claim` that let it take over without a reader
    doing anything, and an activation that removed only the shell it replaced.

    ONE THING THIS SPEC DOES NOT PROVE, stated because the obvious reading is
    that it does. ADR-0010 names a worker caching its own script as the one
    unrecoverable failure in this slice, and `planRequest` refuses `/sw.js` for
    exactly that reason. This spec cannot fail on it: a worker patched to
    precache `/sw.js` AND to answer for it still updates cleanly here, because
    Chromium fetches a worker's own script with the fetch handler bypassed, so
    a worker cannot answer for itself in the first place. That was verified by
    making both changes and watching this spec go on passing.

    So the `/sw.js` rule stays a decision tested as a value in
    `cache-plan.test.ts`, and what this spec adds is the rest of the update
    path, which nothing else covers. Removing `skipWaiting` fails it here.
  */
  await page.reload();

  await expect
    .poll(async () => (await shellCacheNames(page))[0], {
      message: "the new build's worker should install and claim",
      timeout: 60_000,
    })
    .not.toBe(shellA[0]);

  await page.reload();

  expect(
    await servedScript(page),
    "the reader should be on the new build",
  ).toBe(buildB);

  // The shell is versioned by build and the content cache is not, so a
  // successful update must replace the first and leave the second alone.
  // Keying editions by build would make every routine deploy delete what a
  // reader saved (`cache-names.ts`).
  const after = await cachedContentPaths(page);

  expect(
    after.cacheNames.filter((name) => name.startsWith(`${CACHE_PREFIX}shell-`)),
  ).toHaveLength(1);
  expect(
    after.paths.filter((path) => path.startsWith("/content/editions/")),
    "a deploy must not delete the editions a reader saved",
  ).not.toHaveLength(0);

  await expect(editionHeading(page)).toHaveText(/^Edition of /);
});

function escapeForRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
