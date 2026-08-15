/**
 * A static server over a built directory, for the end-to-end suite, and the
 * only thing in this repository whose most important feature is that it can be
 * killed.
 *
 * ADR-0010 records why. `browserContext.setOffline(true)` does not apply to
 * requests a service worker makes itself in Chromium, so a spec that goes
 * "offline" that way and then finds the edition passes with an empty cache and
 * a worker that stores nothing -- green by construction. Offline is therefore
 * produced by ending a real server process, and this file is that process.
 *
 * Everything else here exists so that the fixture is not more forgiving than
 * the host the product actually deploys to, because a fixture that answers
 * more requests than production proves less than it appears to:
 *
 * - UNMATCHED NAVIGATIONS GET `index.html`, which is Cloudflare Pages' own
 *   behaviour and the reason `apps/web/public/_redirects` exists. Notably that
 *   includes `/sw.js` if it were ever missing from a build: this fixture then
 *   answers it with 200 and HTML exactly as Pages would, which is the fact
 *   `docs/runbooks/cloudflare-pages-deployment.md` warns makes deleting the
 *   worker unrecoverable.
 * - UNMATCHED `/content/*` AND `/assets/*` GET A REAL 404. Pages would return
 *   the shell with status 200 here too, and the reader and the worker both
 *   already have a content-type guard for that case. Serving HTML for a
 *   missing edition would exercise that guard and nothing else; serving 404
 *   makes "there is no such file" distinguishable in a spec from "the file is
 *   HTML", which is what the offline specs need to be able to tell apart.
 * - `cache-control: public, max-age=0, must-revalidate` ON EVERYTHING, which
 *   is what Pages sends today, including on `/sw.js`. It is what bounds a
 *   worker update to one navigation, so a fixture that sent something longer
 *   would make the update spec pass or fail for reasons the deployment does
 *   not share.
 * - `application/manifest+json` for `.webmanifest`, the one media type
 *   `apps/web/public/_headers` states rather than infers.
 *
 * `--fail <prefix>` answers a path prefix with 500 while still serving
 * everything else, which is how a spec produces a failed content update
 * without producing an offline device: the two are different failures and the
 * worker treats them differently on purpose.
 *
 * The port is chosen by the operating system and printed, because a spec that
 * restarts this server has to rebind the SAME port -- a service worker
 * registration, its caches and its scope all belong to an origin, and a new
 * port is a new origin with none of them.
 */

const USAGE = [
  "Usage:",
  "  bun scripts/serve-dist.ts <directory> [options]",
  "",
  "Options:",
  "  --port <n>        bind this port; 0, the default, lets the OS choose",
  "  --fail <prefix>   answer any path starting with <prefix> with 500",
].join("\n");

/** Pages answers everything with this today, `/sw.js` included. */
const CACHE_CONTROL = "public, max-age=0, must-revalidate";

/** The document an unmatched navigation is answered with. */
const SHELL_ENTRY = "index.html";

/** The two prefixes that get a real 404 rather than the shell. */
const FILE_ONLY_PREFIXES = ["/content/", "/assets/"] as const;

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  css: "text/css; charset=utf-8",
  html: "text/html; charset=utf-8",
  ico: "image/vnd.microsoft.icon",
  js: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  svg: "image/svg+xml",
  txt: "text/plain; charset=utf-8",
  // Stated rather than inferred, matching the one rule in `public/_headers`.
  webmanifest: "application/manifest+json",
};

interface Options {
  readonly directory: string;
  readonly port: number;
  readonly failing: readonly string[];
}

type ParsedArguments =
  | { readonly ok: true; readonly options: Options }
  | { readonly ok: false; readonly message: string };

function parseArguments(argv: readonly string[]): ParsedArguments {
  let directory: string | null = null;
  let port = 0;
  const failing: string[] = [];

  for (let at = 0; at < argv.length; at += 1) {
    const argument = argv[at];

    if (argument === "--fail" || argument === "--port") {
      const value = argv[at + 1];
      at += 1;

      if (value === undefined) {
        return { ok: false, message: `${argument} takes a value` };
      }

      if (argument === "--fail") {
        failing.push(value);
      } else {
        const parsed = Number(value);

        // Rejected rather than coerced: `NaN` would be passed to `Bun.serve`,
        // which chooses a port for it, and the spec would then be talking to a
        // different origin than the one it asked to rebind.
        if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65535) {
          return { ok: false, message: `not a port: ${value}` };
        }

        port = parsed;
      }

      continue;
    }

    if (argument === undefined || argument.startsWith("--")) {
      return { ok: false, message: `unknown option: ${String(argument)}` };
    }

    if (directory !== null) {
      return { ok: false, message: "exactly one directory may be served" };
    }

    directory = argument;
  }

  if (directory === null) {
    return { ok: false, message: "a directory to serve is required" };
  }

  return {
    ok: true,
    options: { directory: directory.replace(/\/+$/, ""), port, failing },
  };
}

function contentTypeOf(path: string): string {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();

  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

/**
 * The headers every response carries.
 *
 * `date` is set explicitly rather than left to the server. The reader reads it
 * off a cached response to say when that copy was downloaded (ADR-0007,
 * ADR-0010) -- it is the one timestamp this product displays and never mints
 * -- so a fixture that omitted it would silently delete the sentence a spec is
 * there to check, and the spec would pass for having nothing to find.
 */
function headersFor(contentType: string): Record<string, string> {
  return {
    "content-type": contentType,
    "cache-control": CACHE_CONTROL,
    date: new Date().toUTCString(),
  };
}

async function readFile(path: string): Promise<ArrayBuffer | null> {
  try {
    // `stat` rather than `exists`, because a directory resolves for both and
    // reading one back as a file would answer a navigation with nothing.
    if ((await Bun.file(path).stat()).isDirectory()) {
      return null;
    }

    return await Bun.file(path).arrayBuffer();
  } catch {
    return null;
  }
}

function isFileOnly(path: string): boolean {
  return FILE_ONLY_PREFIXES.some((prefix) => path.startsWith(prefix));
}

async function respond(options: Options, request: Request): Promise<Response> {
  const path = new URL(request.url).pathname;

  // Refused before the path is joined to anything. An encoded traversal would
  // otherwise read files outside the built directory, and this server runs
  // against a repository checkout.
  if (path.includes("..") || path.includes("%2e%2e")) {
    return new Response("Bad request\n", {
      status: 400,
      headers: headersFor(CONTENT_TYPES.txt ?? "text/plain"),
    });
  }

  if (options.failing.some((prefix) => path.startsWith(prefix))) {
    return new Response("Injected failure\n", {
      status: 500,
      headers: headersFor(CONTENT_TYPES.txt ?? "text/plain"),
    });
  }

  const relative = path.endsWith("/") ? `${path}${SHELL_ENTRY}` : path;
  const file = await readFile(`${options.directory}${relative}`);

  if (file !== null) {
    return new Response(file, { headers: headersFor(contentTypeOf(relative)) });
  }

  if (isFileOnly(path)) {
    return new Response("Not found\n", {
      status: 404,
      headers: headersFor(CONTENT_TYPES.txt ?? "text/plain"),
    });
  }

  const shell = await readFile(`${options.directory}/${SHELL_ENTRY}`);

  if (shell === null) {
    return new Response("No shell in this build\n", {
      status: 404,
      headers: headersFor(CONTENT_TYPES.txt ?? "text/plain"),
    });
  }

  // The single-page fallback, and deliberately status 200 with HTML, which is
  // what Cloudflare Pages answers an unmatched path with.
  return new Response(shell, {
    headers: headersFor(CONTENT_TYPES.html ?? "text/html"),
  });
}

/*
  This file imports nothing -- it needs neither `@aaj-bas/domain` nor any other
  workspace package -- and a TypeScript file with no import and no export is a
  script rather than a module, where top-level `await` is not allowed. The
  awaits below are not optional: they are what writes the port announcement out
  immediately rather than into a buffer. So the file is declared a module.
*/
export {};

const parsed = parseArguments(process.argv.slice(2));

if (!parsed.ok) {
  await Bun.write(Bun.stderr, `ERROR: ${parsed.message}\n\n${USAGE}\n`);
  process.exit(2);
}

const options = parsed.options;

const server = Bun.serve({
  // Loopback only. It is also what makes the origin a secure context, without
  // which Chromium registers no service worker at all and every spec below
  // would be measuring an application with no worker in it.
  hostname: "127.0.0.1",
  port: options.port,
  fetch: (request) => respond(options, request),
});

/**
 * Ending the process is the whole mechanism, so it ends completely.
 *
 * `stop(true)` closes connections that are still open rather than waiting for
 * them to finish. A browser holds keep-alive sockets to an origin it has just
 * loaded, and a stop that let them drain would leave the page able to make one
 * more successful request -- which is exactly the "offline" that is not
 * offline that ADR-0010 rejected `setOffline` for.
 */
function shutdown(): void {
  void server.stop(true);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

/*
  The line the spec parses. Printed last, so a spec that has read it knows the
  listener is up rather than about to be.

  `Bun.write` rather than `console.log`, and this is load-bearing rather than
  a preference. Bun block-buffers `console.log` when stdout is a pipe and
  flushes it when the process exits -- and this process is a server that does
  not exit until it is killed. The announcement would therefore be written into
  a buffer nobody ever reads, and the caller waiting for a port would wait for
  as long as its own timeout allowed. `Bun.write` writes now.
*/
await Bun.write(Bun.stdout, `serve-dist listening on port ${server.port}\n`);
