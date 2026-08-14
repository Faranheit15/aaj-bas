/**
 * Deciding which validated editions a build may carry, and what pointer to
 * write for them.
 *
 * This is the half of `bun run content:stage` that has no filesystem in it. It
 * takes a `ValidationReport` -- already the answer to "what is wrong with this
 * content" -- and answers a narrower question: given that, what goes into the
 * build. Copying bytes and deleting stale files belongs to
 * `scripts/stage-content.ts`, for the same reason validation was split that way
 * in AB-103: section 10 keeps this package free of filesystem access, and the
 * practical benefit is that every staging decision is testable as a value.
 *
 * There is no clock here, and there must not be one. Section 41 puts "what day
 * is it" in the editorial timezone, which is a question the reader's browser
 * asks at read time; a build that asked it would stage a different set of files
 * depending on which side of Asia/Kolkata midnight the CI runner started on,
 * and the same commit would produce two different deployments. So this function
 * is a pure function of the report: same report in, same plan out.
 */
import type { EditionIndex } from "@aaj-bas/schemas";
import type {
  EditionValidation,
  ValidationReport,
} from "../edition-validation";

/**
 * Which set of editions a build is being made from.
 *
 * `published` is what a deploy runs. `sample` is what `bun run dev` runs, and
 * it exists because the only edition in the repository today is deliberately
 * invented content that must never reach a reader -- without a second mode the
 * development server would have nothing at all to render.
 */
export type StagingMode = "published" | "sample";

export interface StagedEdition {
  /** Repository-relative, forward slashes, as `EditionValidation.file` is. */
  readonly file: string;
  /** The edition's own date, which is also its filename in the build. */
  readonly date: string;
}

export interface SkippedEdition {
  readonly file: string;
  /** Short enough for one log line; says why, not what the rule was. */
  readonly reason: string;
}

export interface StagingPlan {
  readonly mode: StagingMode;
  readonly staged: readonly StagedEdition[];
  readonly skipped: readonly SkippedEdition[];
  /** Satisfies `editionIndexSchema`; see `plan.test.ts`, which asserts it. */
  readonly index: EditionIndex;
}

export function planStaging(
  report: ValidationReport,
  mode: StagingMode,
): StagingPlan {
  const staged: StagedEdition[] = [];
  const skipped: SkippedEdition[] = [];

  for (const edition of report.editions) {
    const decision = decide(edition, mode);
    if (decision.stage) {
      staged.push({ file: edition.file, date: decision.date });
    } else {
      skipped.push({ file: edition.file, reason: decision.reason });
    }
  }

  // Newest first, which is the order the index contract requires. ISO dates
  // sort correctly as strings, and the comparison is the default code-unit one
  // rather than `localeCompare`, which would order by the runner's locale.
  //
  // The file tie-break never fires in practice -- a file whose name disagrees
  // with its date carries a blocking finding and is skipped in both modes, so
  // two staged editions cannot share a date -- but leaving the comparator total
  // means the plan cannot depend on the order the report happened to arrive in.
  staged.sort((a, b) =>
    a.date === b.date ? compare(a.file, b.file) : compare(b.date, a.date),
  );

  const editions = staged.map((edition) => edition.date);

  return {
    mode,
    staged,
    skipped,
    index: {
      schemaVersion: 1,
      contentSet: mode === "published" ? "published" : "sample",
      // Null when nothing was stageable, which is an ordinary state and not an
      // error: the reader renders its no-edition state from it.
      latest: editions[0] ?? null,
      editions,
    },
  };
}

type StagingDecision =
  | { readonly stage: true; readonly date: string }
  | { readonly stage: false; readonly reason: string };

/**
 * Whether this edition goes into the build, and why not when it does not.
 *
 * The published branch reads `publishable` and never recomputes it. Section 45
 * requires one definition of what may be deployed, and that definition lives in
 * `validateEdition`: it is already false for a blocking finding, for sample
 * data, and for a file that did not parse. Re-deriving it here from the
 * findings would be a second, quieter answer to the same question, and the two
 * would eventually disagree -- with this one winning, silently, at deploy time.
 */
function decide(
  edition: EditionValidation,
  mode: StagingMode,
): StagingDecision {
  // An edition that did not parse far enough to have a date can never be
  // staged: the build addresses editions by date, so there is no filename to
  // write it under and no entry to put in the index.
  const date = edition.editionDate;
  if (date === null) {
    return {
      stage: false,
      reason: "the file did not parse, so it has no date",
    };
  }

  if (mode === "published") {
    return edition.publishable
      ? { stage: true, date }
      : { stage: false, reason: "not publishable" };
  }

  // Sample mode relaxes exactly one thing: content flagged as invented may be
  // staged, because in development that is the only content there is. It
  // relaxes nothing about correctness, so a genuinely broken edition is still
  // withheld and a developer sees the same absence a reader would.
  const blocking = edition.findings.filter(
    (finding) => finding.severity === "blocking",
  ).length;

  return blocking === 0
    ? { stage: true, date }
    : {
        stage: false,
        reason: `${blocking} blocking finding${blocking === 1 ? "" : "s"}`,
      };
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
