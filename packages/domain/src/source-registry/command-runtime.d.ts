/**
 * The Node runtime surface `command.test.ts` actually calls, and nothing else.
 *
 * The same discipline, and the same reason, as `scripts/bun-runtime.d.ts` and
 * `apps/web/e2e/node-runtime.d.ts`: this repository installs no ambient runtime
 * types, and `@types/node` has been refused in writing more than once. One test
 * file that spawns a command should not be the reason a whole ambient ecosystem
 * enters the repository, so the members it spawns with are declared instead.
 *
 * These are Node's names because Vitest's runner is Node. The risk is the same
 * -- a declaration that type-checks and does not exist -- and so is the safety
 * net: every member below is called on every run of `bun run test`, so a wrong
 * one fails immediately and loudly rather than in a rarely taken branch.
 *
 * Nothing in `src` outside a test may import these modules. The package is
 * required to stay free of filesystem and process access (section 10); what is
 * being tested here is the command that owns both, and a test that spawns a
 * real process is the only thing that can observe an exit code.
 */

declare module "node:child_process" {
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

declare module "node:fs" {
  /** Creates `${prefix}XXXXXX` and returns the created path. */
  export function mkdtempSync(prefix: string): string;
  export function writeFileSync(path: string, data: string): void;
  export function rmSync(
    path: string,
    options: { recursive: boolean; force: boolean },
  ): void;
}

declare module "node:os" {
  /** The system temporary directory, so a fixture never lands in the repository
   *  where `check:pm` would sweep it up as an untracked file. */
  export function tmpdir(): string;
}

interface ImportMeta {
  /**
   * Absolute directory of this module, so the paths below do not depend on the
   * working directory the runner happened to be invoked from. Node 20.11 and
   * later, under ESM, which `packages/domain/package.json`'s `"type": "module"`
   * makes this.
   */
  readonly dirname: string;
}
