/**
 * Deciding which built files a service worker installs, and what to call the
 * build they came from.
 *
 * `planStaging` answers what a build carries and `planRemoval` what it must
 * stop carrying. This answers the third question of the same kind -- what a
 * build must survive losing the network -- and it is here rather than in
 * `scripts/build-service-worker.ts` for the reason section 10 gives: the script
 * that owns the filesystem should have no judgement left to make, and the two
 * properties that matter can then be asserted as values:
 *
 * - published content is never installed with the shell;
 * - the build id is a function of the file list and of nothing else.
 *
 * The first is the whole of ADR-0006's caching sentence. Editions are rewritten
 * in place when a correction is published, so an edition installed alongside
 * the shell -- under a cache name that only changes when the shell changes --
 * would be served to a returning reader after the correction shipped. Section
 * 46 forbids exactly that, and the exclusion is enforced here rather than
 * trusted of the caller, because `dist/` genuinely contains both.
 *
 * The second is what makes the worker updatable at all. A service worker is
 * replaced when its script's BYTES change, so the id has to change whenever an
 * asset does and must not change when nothing did. Derived from the entry list
 * it is both: a content-only deploy produces a byte-identical `sw.js` and no
 * worker update, and any asset change produces a different one. A git SHA would
 * satisfy neither -- every commit would replace the worker for every reader,
 * including the commits that only publish an edition.
 */

/** The files a build never installs, and why each is not part of the shell. */
const EXCLUDED_PREFIXES = [
  // Published content, cached at runtime under its own unversioned name so a
  // deploy cannot delete the editions a reader already has (ADR-0006).
  "content/",
] as const;

const EXCLUDED_NAMES = [
  // Cloudflare Pages configuration. Served to no reader, and a worker holding
  // its own routing rules in a cache would be one deploy behind the host's.
  "_redirects",
  "_headers",
  // The worker's own script. A worker that can answer for its own script can
  // never be replaced, so it is not installed and -- separately, in the
  // worker's routing -- never intercepted.
  "sw.js",
] as const;

export interface PrecachePlan {
  /** Root-relative paths to install, sorted, each safe to request. */
  readonly entries: readonly string[];
  /** Eight hex characters naming this exact set of entries. */
  readonly buildId: string;
  /**
   * Names that could not be turned into a path.
   *
   * Reported rather than dropped, as `planRemoval` reports what it declines to
   * delete: a built file that is silently not installed is a file the reader
   * cannot load offline, and the run that decided to leave it out is the only
   * place a human can find out (section 37).
   */
  readonly refused: readonly string[];
}

/**
 * @param distFileNames - every file in the built output, named relative to it
 *   with forward slashes.
 */
export function planPrecache(distFileNames: readonly string[]): PrecachePlan {
  const entries = new Set<string>();
  const refused = new Set<string>();

  for (const name of distFileNames) {
    if (!isSafeRelativeName(name)) {
      refused.add(name);
      continue;
    }

    if (isExcluded(name)) {
      continue;
    }

    entries.add(`/${name}`);
  }

  // Sorted so two builds of the same output produce the same list and so the
  // id below is a function of the set rather than of the directory walk's
  // order. The default comparison is by UTF-16 code unit and is the same
  // everywhere; `localeCompare` would depend on the machine that built.
  const sorted = [...entries].sort();

  return {
    entries: sorted,
    buildId: buildIdFor(sorted),
    refused: [...refused].sort(),
  };
}

/**
 * Names a list of entries in eight hex characters.
 *
 * FNV-1a over the joined list, which is a checksum and not a security
 * primitive: what it has to do is change when the list changes. Collisions
 * would matter if an attacker chose the file names, and nobody does -- Vite
 * does, from content hashes that are themselves the real integrity mechanism.
 * `crypto.subtle.digest` would be the stronger hash and is asynchronous, which
 * would make every caller of this async for a value nothing verifies.
 */
export function buildIdFor(entries: readonly string[]): string {
  // Newline-joined rather than concatenated, so that ["/ab", "/c"] and
  // ["/a", "/bc"] cannot hash the same.
  const text = [...entries].sort().join("\n");

  let hash = 0x811c9dc5;

  for (let index = 0; index < text.length; index += 1) {
    // Code units rather than bytes: paths are ASCII in practice, and for
    // anything else this stays deterministic, which is all that is asked.
    hash ^= text.charCodeAt(index);

    // The 32-bit FNV prime, as shifts and adds. `hash * 16777619` exceeds the
    // 53 bits a double holds exactly and would silently lose the low bits,
    // which is the one way this function could stop noticing a change.
    hash =
      (hash +
        (hash << 1) +
        (hash << 4) +
        (hash << 7) +
        (hash << 8) +
        (hash << 24)) >>>
      0;
  }

  return hash.toString(16).padStart(8, "0");
}

function isExcluded(name: string): boolean {
  return (
    EXCLUDED_NAMES.some((excluded) => name === excluded) ||
    EXCLUDED_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

/**
 * Whether this name becomes a path by prefixing a slash.
 *
 * The same check `planRemoval` makes, for the mirrored reason: there it stops a
 * deletion escaping the staging directory, here it stops the worker requesting
 * something the build never produced. A directory scan does not produce such
 * names today; this refuses them anyway, because "the scanner would not do
 * that" is an assumption a future caller cannot see.
 */
function isSafeRelativeName(name: string): boolean {
  if (name === "" || name.includes("\\") || /^(\/|[A-Za-z]:\/)/.test(name)) {
    return false;
  }

  return name
    .split("/")
    .every((segment) => segment !== "" && segment !== "." && segment !== "..");
}
