/**
 * The Bun runtime surface the scripts in this directory actually call, and
 * nothing else.
 *
 * This repository installs no ambient runtime types. `bun-types` would pull in a
 * large ambient surface for one small script, and `@types/node` was already
 * refused once on the same grounds -- `packages/test-fixtures/src/sample-edition.test.ts`
 * documents reading a file through an import rather than adding it, under
 * section 11. Adding either here to type five members would contradict that
 * precedent for no gain, so the five members are declared.
 *
 * The risk this carries is a declaration that type-checks but does not exist,
 * and the safety net is that `bun run content:validate` and `bun run build` --
 * which stages content -- both run in the blocking check suite: a wrong
 * declaration fails on the next run, loudly, rather than in production. Declare
 * only what is called, so there is less to be wrong about, and verify each
 * member exists at runtime before declaring it.
 */

declare namespace Bun {
  /**
   * Lazy file handle. `text()` rejects when the path is missing or unreadable,
   * which is the failure the CLI turns into an `INTERNAL:` exit rather than a
   * silent empty edition.
   */
  interface BunFile {
    text(): Promise<string>;
    /**
     * Rejects when the path does not exist, and resolves for a directory, which
     * `exists()` does not distinguish -- the CLI needs both apart to tell an
     * operator which mistake was made.
     */
    stat(): Promise<{ isDirectory(): boolean }>;
    /** Removes the file. Rejects when it is missing, so callers list first. */
    delete(): Promise<void>;
  }

  function file(path: string): BunFile;

  /**
   * Writes `input` to `destination`, creating parent directories, and resolves
   * with the number of bytes written. Passing a `BunFile` copies it verbatim,
   * which is how a staged edition stays byte-identical to the reviewed one.
   */
  function write(destination: string, input: string | BunFile): Promise<number>;

  class Glob {
    constructor(pattern: string);
    /**
     * Yields paths relative to `cwd`, in no promised order -- the caller sorts.
     * Async because the walk is streamed, which is why the entry point is async.
     */
    scan(options: {
      cwd: string;
      onlyFiles: boolean;
      /**
       * Whether a leading dot may be matched by a wildcard. False by default,
       * which would walk past exactly the residue a staging sweep is looking
       * for: editor swap and lock files are hidden. Optional, so a scan that
       * has no reason to care reads as it did before.
       */
      dot?: boolean;
    }): AsyncIterable<string>;
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
