/**
 * Argument parsing for source-fetching and source-health command lines.
 */

export interface FetchSourcesCommand {
  readonly ok: true;
  readonly json: boolean;
  readonly markdown: boolean;
  readonly summaryPath: string | null;
  readonly paths: readonly string[];
}

export interface FetchSourcesCommandError {
  readonly ok: false;
  readonly message: string;
}

export type FetchSourcesCommandResult =
  | FetchSourcesCommand
  | FetchSourcesCommandError;

export function parseFetchSourcesCommand(
  argv: readonly string[],
): FetchSourcesCommandResult {
  let json = false;
  let markdown = false;
  let summaryPath: string | null = null;
  const paths: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) {
      continue;
    }

    if (argument === "--json") {
      json = true;
    } else if (argument === "--markdown") {
      markdown = true;
    } else if (argument === "--summary") {
      const next = argv[index + 1];
      if (next !== undefined && !next.startsWith("-")) {
        summaryPath = next;
        index += 1;
      } else {
        summaryPath = ""; // Indicates summary requested without explicit file (falls back to $GITHUB_STEP_SUMMARY)
      }
    } else if (argument.startsWith("--summary=")) {
      summaryPath = argument.slice("--summary=".length);
    } else if (argument.startsWith("-")) {
      return {
        ok: false,
        message: `unknown option: ${argument}`,
      };
    } else {
      paths.push(argument);
    }
  }

  return {
    ok: true,
    json,
    markdown,
    summaryPath,
    paths,
  };
}
