/**
 * What the source-registry command was asked to do, decided as a value.
 *
 * Argument parsing lives here rather than in `scripts/` for one reason that is
 * not tidiness: `scripts/` is not a workspace package, so `bun run test` --
 * which is `bun run --filter @aaj-bas/* test` -- never reaches a file there.
 * An adversarial review demonstrated the cost of that: a `--force` flag that
 * stripped every blocking finding was added to the command, and the entire
 * merge-blocking suite still exited 0. Nothing objected, because nothing was
 * looking.
 *
 * So the judgement moves to the package the test runner does reach, and the
 * command keeps only the filesystem and the exit. That is the same split
 * `stage-content.ts` and `planStaging` already use, applied to the one part of
 * this command that can be wrong without anybody noticing.
 */

/** What the command should do, or why it cannot. */
export type SourcesCommand =
  | {
      readonly ok: true;
      /** Write the machine-readable report instead of the text one. */
      readonly json: boolean;
      /** Registries named on the command line; empty means the default. */
      readonly paths: readonly string[];
    }
  | { readonly ok: false; readonly message: string };

/**
 * Every option this command accepts, which is one.
 *
 * There is deliberately no `--force`, no `--ignore-rule`, and no per-rule
 * mute, and an unrecognised flag is REFUSED rather than ignored. Both halves
 * matter. A silenced finding in a file that records terms reviews is a
 * validation failure converted into a success, which sections 37 and 45 both
 * forbid -- and once such a flag is in a workflow file it is invisible to
 * everyone afterwards. Refusing the unknown flag is what stops one arriving by
 * a misspelling of a real one, and it is why this function reports a message
 * rather than dropping what it did not understand.
 */
export function parseSourcesCommand(argv: readonly string[]): SourcesCommand {
  let json = false;
  const paths: string[] = [];

  for (const argument of argv) {
    if (argument === "--json") {
      json = true;
    } else if (argument.startsWith("-")) {
      return { ok: false, message: `unknown option: ${argument}` };
    } else {
      paths.push(argument);
    }
  }

  return { ok: true, json, paths };
}
