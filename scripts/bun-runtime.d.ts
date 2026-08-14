/**
 * The Bun runtime surface `validate-edition.ts` actually calls, and nothing else.
 *
 * This repository installs no ambient runtime types. `bun-types` would pull in a
 * large ambient surface for one small script, and `@types/node` was already
 * refused once on the same grounds -- `packages/test-fixtures/src/sample-edition.test.ts`
 * documents reading a file through an import rather than adding it, under
 * section 11. Adding either here to type five members would contradict that
 * precedent for no gain, so the five members are declared.
 *
 * The risk this carries is a declaration that type-checks but does not exist,
 * and the safety net is that `bun run content:validate` runs in the blocking
 * check suite: a wrong declaration fails on the next run, loudly, rather than in
 * production. Declare only what is called, so there is less to be wrong about.
 */

declare namespace Bun {
  /**
   * Lazy file handle. `text()` rejects when the path is missing or unreadable,
   * which is the failure the CLI turns into an `INTERNAL:` exit rather than a
   * silent empty edition.
   */
  function file(path: string): {
    text(): Promise<string>;
    /**
     * Rejects when the path does not exist, and resolves for a directory, which
     * `exists()` does not distinguish -- the CLI needs both apart to tell an
     * operator which mistake was made.
     */
    stat(): Promise<{ isDirectory(): boolean }>;
  };

  class Glob {
    constructor(pattern: string);
    /**
     * Yields paths relative to `cwd`, in no promised order -- the caller sorts.
     * Async because the walk is streamed, which is why the entry point is async.
     */
    scan(options: { cwd: string; onlyFiles: boolean }): AsyncIterable<string>;
  }
}

declare const process: {
  exit(code: number): never;
  /** `[bun, script, ...args]`, so the CLI's own arguments start at index 2. */
  argv: string[];
  /** Only for resolving a user-supplied relative path back to a repo-relative one. */
  cwd(): string;
};

interface ImportMeta {
  /** Absolute directory of this module, so behaviour does not depend on cwd. */
  readonly dir: string;
}
