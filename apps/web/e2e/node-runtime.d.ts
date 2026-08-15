/**
 * The Node runtime surface the end-to-end suite actually calls, and nothing
 * else.
 *
 * The same discipline, and the same reason, as `scripts/bun-runtime.d.ts`:
 * this repository installs no ambient runtime types, and `@types/node` has now
 * been refused twice in writing -- once in
 * `packages/test-fixtures/src/sample-edition.test.ts`, which reads a file
 * through an import rather than adding it, and once in that file's own header.
 * A suite that spawns two commands should not be the reason a whole ambient
 * ecosystem enters the repository, so the members it spawns them with are
 * declared instead.
 *
 * Playwright's own runner is Node, which is why these exist here and not in
 * the Bun declarations. The risk is the same -- a declaration that type-checks
 * and does not exist -- and so is the safety net: every member below is called
 * on every run of `bun run e2e`, so a wrong one fails immediately and loudly
 * rather than in a rarely taken branch. Declare only what is called.
 */

declare module "node:child_process" {
  /**
   * A child's output stream. Only `on("data")` is called: the suite reads
   * `serve-dist.ts`'s one line to learn the port it bound.
   */
  export interface ChildStream {
    on(event: "data", listener: (chunk: unknown) => void): void;
  }

  export interface ChildProcess {
    readonly stdout: ChildStream;
    readonly stderr: ChildStream;
    /**
     * `once`, not `on`: the listeners here resolve a promise, and a second
     * call would settle an already-settled one.
     */
    once(event: "exit", listener: () => void): void;
    /**
     * Emitted when the command could not be started at all, in which case
     * `"exit"` never is. Listened for so that a missing `bun` on the PATH
     * fails with a message rather than as a promise that never settles.
     */
    once(event: "error", listener: (failure: Error) => void): void;
    /**
     * Signals the child. The suite sends only `SIGTERM`, which
     * `serve-dist.ts` handles by destroying open connections before exiting --
     * the difference between a stop and a stop that leaves a keep-alive socket
     * able to answer one more request.
     */
    kill(signal: "SIGTERM"): boolean;
  }

  export function spawn(
    command: string,
    args: readonly string[],
    options: { cwd: string },
  ): ChildProcess;

  export interface SpawnSyncResult {
    /** Null when the child was killed by a signal rather than exiting. */
    readonly status: number | null;
    readonly stdout: string;
    readonly stderr: string;
    /** Present when the command could not be started at all. */
    readonly error?: Error;
  }

  export function spawnSync(
    command: string,
    args: readonly string[],
    options: { cwd: string; encoding: "utf8" },
  ): SpawnSyncResult;
}

interface ImportMeta {
  /**
   * Absolute directory of this module, so the paths below do not depend on the
   * working directory the runner happened to be invoked from. Node 20.11 and
   * later, under ESM, which `apps/web/package.json`'s `"type": "module"` makes
   * this.
   */
  readonly dirname: string;
}
