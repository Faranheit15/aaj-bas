/**
 * `bun run build`'s last step -- the one that turns `sw.ts` into the `/sw.js` a
 * reader's browser registers -- and `--verify`, which reads a built one back.
 *
 * It is the filesystem half of AB-206 and holds no judgement of its own, the
 * same split `scripts/stage-content.ts` makes. Which built files a worker may
 * install is answered by `planPrecache`, and what to call the build they came
 * from by `buildIdFor`; both live in `@aaj-bas/domain`, are pure, and are
 * tested as values. This file discovers files, bundles, writes one artifact,
 * prints, and exits.
 *
 * It runs after `vite build` because it reads that build's output: the shell a
 * worker installs is a list of content-hashed names that do not exist until
 * Vite has emitted them. On a reader's first visit the worker is not yet
 * controlling the page, so nothing that load fetched passed through its fetch
 * handler -- which is why the list has to be known at install time and cannot
 * be discovered at runtime.
 *
 * Two choices here are load-bearing rather than incidental.
 *
 * THE OUTPUT IS A CLASSIC SCRIPT, not a module. Module service workers reached
 * Firefox only very recently, and a `type: "module"` registration fails
 * silently there -- degrading offline support to nothing, with no error a
 * reader could see and nothing in any log.
 *
 * AND THE BUILD ID COMES FROM THE FILE LIST, never from a commit. A deploy that
 * published only an edition then produces a byte-identical `sw.js` and no
 * worker update at all, while any asset change produces different bytes, which
 * is the only thing that makes a browser install a new worker.
 *
 * `--verify <dist>` checks a directory that is about to be uploaded, and exists
 * because two invariants arrived with this slice that no other check covers:
 * every deployment must contain a valid `/sw.js`, and the shell a worker
 * installs must be the shell that was built. It writes nothing.
 *
 * `--tombstone` builds the kill switch in place of the worker. Deleting
 * `sw.js` from the build is NOT the way to retire a worker on this host --
 * `apps/web/src/service-worker/tombstone.ts` explains at length why that leaves
 * the broken worker installed permanently -- so the removal ships as a build
 * variant, reviewed and deployed like any other change.
 */

import {
  buildIdFor,
  planPrecache,
  VALIDATION_EXIT_CODES,
} from "@aaj-bas/domain";

const USAGE = [
  "Usage:",
  "  bun ../../scripts/build-service-worker.ts            build the worker",
  "  bun scripts/build-service-worker.ts --verify <dist>  check a built one",
  "",
  "Options:",
  "  --tombstone   build the worker that removes this product's worker,",
  "                deletes its caches, and unregisters itself",
].join("\n");

/**
 * The repository root, from this file's own location rather than from the
 * working directory, so the command builds the same worker whether it is run
 * from the root or from `apps/web`, where `bun run build` runs it.
 */
const REPOSITORY_ROOT = collapse(`${import.meta.dir}/..`);
const DIST_DIRECTORY = `${REPOSITORY_ROOT}/apps/web/dist`;
const WORKER_DIRECTORY = `${REPOSITORY_ROOT}/apps/web/src/service-worker`;

/**
 * The registered script's name and location, and both are fixed. A worker's
 * scope is the directory its script is served from, so anything below the root
 * could not control the whole reader; and the path is what a browser already
 * has registered on devices in the field, so it can never move.
 */
const OUTPUT_NAME = "sw.js";

/**
 * The document every navigation is answered with.
 *
 * Spelled here as well as in `cache-plan.ts` because a script must not import
 * application source to read one literal. It is checked rather than assumed:
 * a worker whose shell list somehow lacked it would install successfully and
 * then answer every offline navigation with nothing.
 */
const SHELL_ENTRY = "/index.html";

type Command =
  | { readonly kind: "build"; readonly variant: "worker" | "tombstone" }
  | { readonly kind: "verify"; readonly dist: string };

type ParsedArguments =
  | { readonly ok: true; readonly command: Command }
  | { readonly ok: false; readonly message: string };

function parseArguments(argv: readonly string[]): ParsedArguments {
  if (argv[0] === "--verify") {
    const dist = argv[1];

    // Exactly one path and nothing else: verification has no relationship to
    // `--tombstone`, and accepting a combination it ignores would answer a
    // question nobody asked.
    if (dist === undefined || argv.length > 2) {
      return { ok: false, message: "--verify takes exactly one directory" };
    }

    return { ok: true, command: { kind: "verify", dist } };
  }

  let variant: "worker" | "tombstone" = "worker";

  for (const argument of argv) {
    if (argument === "--tombstone") {
      variant = "tombstone";
    } else {
      // Rejected rather than ignored: silently dropping an argument here would
      // build the ordinary worker while the operator believed they had built
      // the kill switch, which is the one moment that mistake is expensive.
      return { ok: false, message: `unknown option: ${argument}` };
    }
  }

  return { ok: true, command: { kind: "build", variant } };
}

/**
 * Every file in a built directory, relative to it, sorted.
 *
 * Every file, not every asset. `planPrecache` decides what is excluded, and it
 * can only exclude what it is shown -- a scan that pre-filtered would move that
 * decision here, where it is untested.
 *
 * `dot: true` for the same reason the staging sweep uses it: a hidden file in a
 * build is still uploaded, and would otherwise be invisible to this command.
 */
async function discoverBuilt(directory: string): Promise<readonly string[]> {
  const names: string[] = [];

  for await (const name of new Bun.Glob("**/*").scan({
    cwd: directory,
    onlyFiles: true,
    dot: true,
  })) {
    names.push(name.replace(/\\/g, "/"));
  }

  // `Glob.scan` promises no order, and `planPrecache` sorts anyway; sorted here
  // too so the lines this command prints are the same on every machine.
  names.sort();

  return names;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await Bun.file(path).stat()).isDirectory();
  } catch {
    return false;
  }
}

/** Resolve `.` and `..` and normalise separators, keeping any root prefix. */
function collapse(path: string): string {
  const normalised = path.replace(/\\/g, "/");
  const root = /^(\/|[A-Za-z]:\/)/.exec(normalised)?.[0] ?? "";
  const segments: string[] = [];

  for (const segment of normalised.slice(root.length).split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === ".." && segments.length > 0) {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  return root + segments.join("/");
}

function toRepositoryRelative(absolute: string): string {
  const prefix = `${REPOSITORY_ROOT}/`;

  return absolute.startsWith(prefix) ? absolute.slice(prefix.length) : absolute;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

async function buildWorker(variant: "worker" | "tombstone"): Promise<number> {
  const distName = toRepositoryRelative(DIST_DIRECTORY);

  if (!(await isDirectory(DIST_DIRECTORY))) {
    console.error(`FAIL: ${distName} does not exist; run vite build first.`);
    return VALIDATION_EXIT_CODES.blocking;
  }

  const plan = planPrecache(await discoverBuilt(DIST_DIRECTORY));

  for (const name of plan.refused) {
    // Never seen from a directory scan, which produces plain relative names.
    // Reported rather than dropped anyway: a built file left out of the shell
    // is a file the reader cannot load offline, and this run is the only place
    // a human could find out.
    console.error(`WARN: ${name} was not installable and is not in the shell.`);
  }

  if (!plan.entries.includes(SHELL_ENTRY)) {
    // A worker with no shell installs cleanly and then answers every offline
    // navigation with nothing. Section 37: a failure must not become an empty
    // success, and this one would be entirely silent.
    console.error(
      `FAIL: ${distName} has no ${SHELL_ENTRY}; there is no shell to install.`,
    );
    return VALIDATION_EXIT_CODES.blocking;
  }

  const entry = `${WORKER_DIRECTORY}/${variant === "tombstone" ? "tombstone.ts" : "sw.ts"}`;

  let bundled: string;
  try {
    bundled = await bundle(entry, plan.entries, plan.buildId);
  } catch (error) {
    console.error(`FAIL: cannot bundle ${toRepositoryRelative(entry)}.`);
    console.error(`  ${describe(error)}`);
    return VALIDATION_EXIT_CODES.blocking;
  }

  try {
    await Bun.write(`${DIST_DIRECTORY}/${OUTPUT_NAME}`, bundled);
  } catch (error) {
    console.error(
      `INTERNAL: cannot write ${distName}/${OUTPUT_NAME}: ${describe(error)}`,
    );
    return VALIDATION_EXIT_CODES.internal;
  }

  console.log(
    reportLines(variant, plan.entries, plan.buildId, distName).join("\n"),
  );

  return VALIDATION_EXIT_CODES.ok;
}

/**
 * Bundles one worker with its two constants inlined.
 *
 * `define` rather than a generated source file: the alternative writes a module
 * into the source tree on every build, which is then a file that can be stale,
 * committed by accident, or edited by hand.
 */
async function bundle(
  entry: string,
  entries: readonly string[],
  buildId: string,
): Promise<string> {
  const built = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    format: "iife",
    minify: true,
    define: {
      __PRECACHE__: JSON.stringify(entries),
      __BUILD_ID__: JSON.stringify(buildId),
    },
  });

  // `Bun.build` reports a failed bundle rather than rejecting, so an unchecked
  // call would write an empty worker over a working one and report success.
  if (!built.success || built.outputs[0] === undefined) {
    throw new Error(built.logs.map(String).join("\n") || "no output produced");
  }

  return built.outputs[0].text();
}

function reportLines(
  variant: "worker" | "tombstone",
  entries: readonly string[],
  buildId: string,
  distName: string,
): readonly string[] {
  if (variant === "tombstone") {
    return [
      `OK: ${distName}/${OUTPUT_NAME} is the TOMBSTONE worker, build ${buildId}.`,
      "  Deploying it removes this product's service worker and every cache it",
      "  created from each reader's device, on their next navigation.",
    ];
  }

  return [
    ...entries.map((entry) => `  installs ${entry}`),
    `OK: ${distName}/${OUTPUT_NAME} written; ${plural(entries.length, "file")}, build ${buildId}.`,
  ];
}

/**
 * Reads a built directory and reports whether it is deployable.
 *
 * Everything here is `blocking` rather than `internal`, whatever went wrong,
 * because the caller is a deploy gate and the answer it needs is the same: this
 * build must not ship.
 */
async function verify(dist: string): Promise<number> {
  if (!(await isDirectory(dist))) {
    console.error(`FAIL: ${dist} is not a directory.`);
    return VALIDATION_EXIT_CODES.blocking;
  }

  let worker: string;
  try {
    worker = await Bun.file(`${dist}/${OUTPUT_NAME}`).text();
  } catch (error) {
    // The one failure with no recovery on this host: a deployment missing
    // `/sw.js` does not unregister the worker readers already have, because
    // Cloudflare Pages answers the missing path with 200 and HTML and the
    // update fails on the media type instead. The broken worker stays.
    console.error(
      `FAIL: ${dist}/${OUTPUT_NAME} cannot be read: ${describe(error)}`,
    );
    console.error(
      "  Never deploy without it: readers keep the worker they already have.",
    );
    return VALIDATION_EXIT_CODES.blocking;
  }

  if (worker.trim() === "") {
    console.error(`FAIL: ${dist}/${OUTPUT_NAME} is empty.`);
    return VALIDATION_EXIT_CODES.blocking;
  }

  const plan = planPrecache(await discoverBuilt(dist));
  const problems = [
    ...missingShell(plan.entries),
    ...staleBuildId(worker, plan.entries, plan.buildId),
    ...unreferencedScripts(
      plan.entries,
      await Bun.file(`${dist}/index.html`).text(),
    ),
  ];

  if (problems.length > 0) {
    console.error(`FAIL: ${dist} is not deployable.`);
    for (const problem of problems) {
      console.error(`  ${problem}`);
    }
    return VALIDATION_EXIT_CODES.blocking;
  }

  console.log(
    `OK: ${dist}/${OUTPUT_NAME} installs ${plural(plan.entries.length, "file")}, build ${plan.buildId}.`,
  );

  return VALIDATION_EXIT_CODES.ok;
}

function missingShell(entries: readonly string[]): readonly string[] {
  return entries.includes(SHELL_ENTRY)
    ? []
    : [`there is no ${SHELL_ENTRY} to install, so no navigation works offline`];
}

/**
 * Whether the worker about to ship installs the files that are about to ship.
 *
 * Recomputed from the directory rather than trusted from the build that wrote
 * it, so anything that changed `dist/` afterwards -- a second build, a copied
 * asset, a partially uploaded directory -- fails here rather than becoming a
 * shell of files that no longer exist. Both variants embed the id, so this
 * reads the same for the tombstone.
 */
function staleBuildId(
  worker: string,
  entries: readonly string[],
  buildId: string,
): readonly string[] {
  return worker.includes(buildIdFor(entries))
    ? []
    : [
        `${OUTPUT_NAME} does not name build ${buildId}; it was built from other files`,
      ];
}

/**
 * Whether any built script is reachable only through another script.
 *
 * This application emits one JavaScript file, referenced by `index.html`, and
 * the worker takes over pages the previous build loaded (`skipWaiting` and
 * `clients.claim`). Those two facts are safe together only while there is no
 * code splitting: a lazily imported chunk belonging to the old build would be
 * requested by a page the new worker now controls, and the new shell cache does
 * not have it.
 *
 * So the moment a chunk appears that `index.html` does not name, this fails and
 * the question of whether to keep claiming pages is reopened deliberately --
 * rather than becoming an intermittent blank screen after a deploy.
 */
function unreferencedScripts(
  entries: readonly string[],
  html: string,
): readonly string[] {
  return entries
    .filter((entry) => entry.startsWith("/assets/") && entry.endsWith(".js"))
    .filter((entry) => !html.includes(entry))
    .map(
      (entry) =>
        `${entry} is not referenced by index.html; code splitting reopens the skipWaiting question`,
    );
}

async function run(): Promise<number> {
  const parsed = parseArguments(process.argv.slice(2));

  if (!parsed.ok) {
    console.error(parsed.message);
    console.error(USAGE);
    return VALIDATION_EXIT_CODES.usage;
  }

  return parsed.command.kind === "verify"
    ? verify(parsed.command.dist)
    : buildWorker(parsed.command.variant);
}

/**
 * The exit code is taken only after the run resolves. Setting it earlier would
 * end the process while the bundle was still being written and report a partial
 * run as a whole one.
 */
let code: number = VALIDATION_EXIT_CODES.internal;
try {
  code = await run();
} catch (error) {
  console.error(`INTERNAL: ${describe(error)}`);
}
process.exit(code);
