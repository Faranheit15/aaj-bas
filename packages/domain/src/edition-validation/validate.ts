/**
 * Validating an edition file: parse, then contract, then editorial rules.
 *
 * The input is text and never a path. Section 10 keeps this package free of
 * filesystem access, and the practical benefit is larger than the rule: a file
 * that must fail validation can be written in a test as a string, so the
 * repository never has to carry a deliberately broken edition in `content/` to
 * prove the validator works.
 *
 * The three layers short-circuit. A file that is not JSON has no fields to
 * check; a file that fails the schema has no `Edition` for a rule to reason
 * about, and running the editorial rules over a half-valid object would produce
 * findings whose real cause is the schema failure already reported. So each
 * layer reports and stops, and every layer that does run reports everything it
 * finds rather than the first thing.
 */
import { type Edition, editionSchema } from "@aaj-bas/schemas";
import type {
  EditionValidation,
  ValidationFinding,
  ValidationReport,
} from "./report";
import { EDITION_RULES } from "./rules";

export interface EditionSource {
  /** Repository-relative, forward slashes, matching `EditionValidation.file`. */
  readonly file: string;
  readonly text: string;
}

/** The file is not JSON at all. */
const FILE_JSON_RULE = "edition/file-json";

/** The file is JSON but not an edition. */
const SCHEMA_RULE = "edition/schema";

/**
 * The filename must match the edition date.
 *
 * This lives here rather than in `rules.ts` because it is the one check that
 * needs something outside the edition — the name of the file carrying it — and
 * rules are pure functions of an `Edition` and never see it. A mismatch means
 * two different answers to "which day is this", and the archive is addressed by
 * date.
 */
const FILE_NAME_RULE = "structural/file-name-matches-date";

export function validateEdition(source: EditionSource): EditionValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source.text);
  } catch (error) {
    return {
      file: source.file,
      editionDate: null,
      publishable: false,
      findings: [
        {
          ruleId: FILE_JSON_RULE,
          severity: "blocking",
          message: `the file is not valid JSON: ${describeError(error)}`,
        },
      ],
    };
  }

  const result = editionSchema.safeParse(parsed);
  if (!result.success) {
    const findings = result.error.issues.map((issue) => {
      const path = issue.path.join(".");
      return buildFinding(SCHEMA_RULE, "blocking", issue.message, {
        storyId: storyIdFromPath(parsed, issue.path),
        path: path === "" ? undefined : path,
      });
    });
    return {
      file: source.file,
      editionDate: readDate(parsed),
      publishable: false,
      findings: sortFindings(findings, storyOrderFromPaths(findings)),
    };
  }

  const edition = result.data;
  const findings = [
    ...fileNameFindings(source.file, edition),
    ...EDITION_RULES.flatMap((rule) =>
      rule.evaluate(edition).map((violation) =>
        buildFinding(rule.id, rule.severity, violation.message, {
          storyId: violation.storyId,
          path: violation.path,
        }),
      ),
    ),
  ];

  return {
    file: source.file,
    editionDate: edition.date,
    // Blocking findings and sample data both, and neither alone is enough. A
    // pipeline branching on this field would otherwise deploy an edition that
    // failed a blocking rule; and sample data with invented sources may not go
    // in front of a reader however clean the rest of the file is.
    publishable: !findings.some(
      (finding) =>
        finding.severity === "blocking" ||
        finding.ruleId === "url/sample-data-hosts",
    ),
    findings: sortFindings(
      findings,
      new Map(edition.stories.map((story, index) => [story.id, index])),
    ),
  };
}

export function validateEditions(
  sources: readonly EditionSource[],
): ValidationReport {
  // Sorted by file so a run over a glob reports the same order whatever the
  // directory listing happened to give the caller.
  const editions = [...sources]
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .map(validateEdition);

  const counted = editions.flatMap((edition) => edition.findings);
  return {
    reportVersion: 1,
    editions,
    blockingCount: counted.filter((f) => f.severity === "blocking").length,
    warningCount: counted.filter((f) => f.severity === "warning").length,
  };
}

function fileNameFindings(file: string, edition: Edition): ValidationFinding[] {
  const base = file.split("/").at(-1) ?? file;
  const name = base.endsWith(".json") ? base.slice(0, -".json".length) : base;
  if (name === edition.date) {
    return [];
  }
  return [
    buildFinding(
      FILE_NAME_RULE,
      "blocking",
      `the file is named ${base} but the edition is dated ${edition.date}`,
      { path: "date" },
    ),
  ];
}

/**
 * Builds a finding with `exactOptionalPropertyTypes` in force: an absent
 * `storyId` is an omitted key, never a key holding `undefined`. The two are the
 * same when read back and different when a consumer serialises the report.
 */
function buildFinding(
  ruleId: string,
  severity: ValidationFinding["severity"],
  message: string,
  location: { storyId?: string | undefined; path?: string | undefined },
): ValidationFinding {
  return {
    ruleId,
    severity,
    message,
    ...(location.storyId === undefined ? {} : { storyId: location.storyId }),
    ...(location.path === undefined ? {} : { path: location.path }),
  };
}

/**
 * Findings in a fixed order: the story they belong to, then the rule id.
 *
 * Edition-level findings sort first, because a problem with the edition as a
 * whole is context for everything under it. Sorting is stable, so several
 * findings from one rule about one story stay in the order the rule produced
 * them, which is itself deterministic.
 */
function sortFindings(
  findings: readonly ValidationFinding[],
  storyOrder: ReadonlyMap<string, number>,
): ValidationFinding[] {
  const rank = (finding: ValidationFinding): number =>
    finding.storyId === undefined
      ? -1
      : (storyOrder.get(finding.storyId) ?? Number.MAX_SAFE_INTEGER);

  return [...findings].sort((a, b) => {
    const byStory = rank(a) - rank(b);
    if (byStory !== 0) {
      return byStory;
    }
    return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0;
  });
}

/**
 * Story order for schema findings, which have no parsed edition to read it
 * from. The index in `stories[n]` is the order, which is why it is recovered
 * from the path rather than from the data.
 */
function storyOrderFromPaths(
  findings: readonly ValidationFinding[],
): ReadonlyMap<string, number> {
  const order = new Map<string, number>();
  for (const finding of findings) {
    const index = storyIndexFromPath(finding.path);
    if (finding.storyId !== undefined && index !== undefined) {
      order.set(finding.storyId, index);
    }
  }
  return order;
}

function storyIndexFromPath(path: string | undefined): number | undefined {
  const matched = /^stories\.(\d+)/.exec(path ?? "");
  const digits = matched?.[1];
  return digits === undefined ? undefined : Number(digits);
}

/**
 * The id of the story a Zod issue sits under, when the raw value still has one.
 *
 * Read from the unvalidated object on purpose: the issue may be about another
 * field entirely, and an id that is itself malformed is better reported as the
 * text it holds than dropped.
 */
function storyIdFromPath(
  parsed: unknown,
  path: ReadonlyArray<PropertyKey>,
): string | undefined {
  const [root, index] = path;
  if (root !== "stories" || typeof index !== "number") {
    return undefined;
  }
  if (!isRecord(parsed)) {
    return undefined;
  }
  const stories = parsed.stories;
  if (!Array.isArray(stories)) {
    return undefined;
  }
  const story: unknown = stories[index];
  if (!isRecord(story)) {
    return undefined;
  }
  const id = story.id;
  return typeof id === "string" ? id : undefined;
}

/** The edition date from an object that failed the schema, when it has one. */
function readDate(parsed: unknown): string | null {
  if (!isRecord(parsed)) {
    return null;
  }
  const date = parsed.date;
  return typeof date === "string" ? date : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `useUnknownInCatchVariables` is on, so a thrown value proves nothing. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
