/**
 * Deciding which already-staged files a build must delete before it writes.
 *
 * `planStaging` answers what a build carries. This answers the other half of
 * the same question -- what a build must stop carrying -- and it is the step
 * that keeps a development build out of a production one. `bun run dev` stages
 * sample data into `apps/web/public/content`, and that directory is an ordinary
 * part of the source tree: `vite build` empties `dist/`, but `public/` is not
 * `dist/`, so nothing else ever clears it. Without this, the next `bun run
 * build` would copy yesterday's sample edition into the deployment alongside
 * the published ones -- invented content in front of a reader, with every check
 * green, which is exactly the silent failure section 18 exists to prevent.
 *
 * It is here rather than in `scripts/stage-content.ts` for the reason section 10
 * gives: a decision about what gets deleted should be answerable as a value. The
 * script that owns the filesystem then has no judgement left to make, and the
 * two properties that matter can be asserted without a directory existing:
 *
 * - a file this run is about to write is never deleted first and left missing;
 * - nothing outside the staging directory is ever named for deletion.
 *
 * The second is enforced here, on the names, rather than trusted of the caller.
 * Every name is joined onto the staging directory by the script, so a name that
 * escapes -- absolute, or climbing through `..` -- would delete a file the
 * command was never asked to touch. A directory scan does not produce such
 * names today; this refuses them anyway, because "the scanner would not do
 * that" is an assumption a future caller cannot see.
 */

export interface StagingRemoval {
  /** Staging-relative names to delete, sorted, each safe to join. */
  readonly remove: readonly string[];
  /**
   * Names that were not deletable as given.
   *
   * Reported rather than dropped: a file that should have been cleared and was
   * not is residue that will be deployed, so it has to be visible in the run
   * that decided to leave it (section 37).
   */
  readonly refused: readonly string[];
}

/**
 * @param present - every file currently under the staging directory, named
 *   relative to it with forward slashes.
 * @param keep - the names this run is about to write, in the same form.
 */
export function planRemoval(
  present: Iterable<string>,
  keep: ReadonlySet<string>,
): StagingRemoval {
  const remove = new Set<string>();
  const refused = new Set<string>();

  for (const name of present) {
    if (!isSafeRelativeName(name)) {
      refused.add(name);
      continue;
    }

    // Extensions are deliberately not consulted. The guarantee is that the
    // staging directory holds what this run wrote and nothing else, so a
    // `.json.bak`, an editor swap file, or a stray note is residue in exactly
    // the way a stale edition is: `public/` is copied into the build verbatim,
    // so anything left here is published.
    if (!keep.has(name)) {
      remove.add(name);
    }
  }

  return {
    // Sorted so two runs over the same directory delete in the same order and
    // report the same lines. The default comparison is by UTF-16 code unit and
    // is the same everywhere; `localeCompare` would depend on the runner.
    remove: [...remove].sort(),
    refused: [...refused].sort(),
  };
}

/**
 * Whether joining this name onto the staging directory stays inside it.
 *
 * Rejects the absolute forms, any traversal segment, and the empty segments a
 * name like `editions//a.json` or a trailing slash would produce -- none of
 * which name a file this command wrote.
 */
function isSafeRelativeName(name: string): boolean {
  if (name === "" || name.includes("\\") || /^(\/|[A-Za-z]:\/)/.test(name)) {
    return false;
  }

  return name
    .split("/")
    .every((segment) => segment !== "" && segment !== "." && segment !== "..");
}
