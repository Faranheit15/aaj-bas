/**
 * Validating a source registry: contract, then rules.
 *
 * The input is a parsed value and never a path or a file's bytes. Section 10
 * keeps this package free of filesystem access, and ADR-0012 puts the parse in
 * the command for a second reason: the registry is YAML, `Bun.YAML.parse` is
 * the parser, and `Bun` is undefined under Vitest. So the command turns a file
 * into a value and this module decides what is wrong with it -- the same split
 * `stage-content.ts` and `planStaging` already use. It differs from
 * `edition-validation/validate.ts`, which takes JSON text, only in where the
 * parse happens; a registry that must fail validation is still written in a test
 * as a value rather than committed as a deliberately broken file.
 *
 * The layers short-circuit. A value that fails the schema has no parsed registry
 * for a rule to reason about, and running host classification over half-valid
 * entries would produce findings whose real cause is the schema failure already
 * reported.
 */
import { type SourceEntry, sourceRegistrySchema } from "./registry";
import type {
  RegistryFinding,
  RegistryReport,
  RegistryValidation,
  SourceStatus,
} from "./report";
import { SOURCE_REGISTRY_RULES } from "./rules";

export interface RegistrySource {
  /** Repository-relative, forward slashes, matching `RegistryValidation.file`. */
  readonly file: string;
  /**
   * The document as the command parsed it. Unknown, not a registry: everything
   * below exists because what a file contains is not what it claims to.
   */
  readonly value: unknown;
}

/** The document parsed, but it is not a registry. */
const SCHEMA_RULE = "registry/schema";

/**
 * The file is a registry that declares nothing.
 *
 * Reported here rather than left to the schema's `.min(1)`, and reported as a
 * warning, because the exit code has to be able to say "nothing was checked"
 * instead of "something is wrong" — see `registryExitCodeFor`. The finding
 * still appears in both reports, so an empty registry is never silent; what it
 * does not do is add to the blocking count that a pipeline reads as a broken
 * source.
 */
const NO_SOURCES_RULE = "registry/no-sources";

export function validateSourceRegistry(
  source: RegistrySource,
): RegistryValidation {
  const parsed: unknown = source.value;
  const declaredSources = countDeclaredSources(parsed);
  if (declaredSources === 0) {
    return {
      file: source.file,
      declaredSources,
      sources: [],
      findings: [
        {
          ruleId: NO_SOURCES_RULE,
          severity: "warning",
          message: "the registry declares no sources, so nothing was checked",
          path: "sources",
        },
      ],
    };
  }

  const result = sourceRegistrySchema.safeParse(parsed);
  if (!result.success) {
    const findings = result.error.issues.map((issue) => {
      const path = issue.path.join(".");
      return buildFinding(SCHEMA_RULE, "blocking", issue.message, {
        sourceId: sourceIdFromPath(parsed, issue.path),
        path: path === "" ? undefined : path,
      });
    });
    return {
      file: source.file,
      declaredSources,
      // No entry survived the schema, so none of them has a usable answer to
      // "may this be fetched". An empty list says that; a list of `false` would
      // claim the entries were judged.
      sources: [],
      findings: sortFindings(findings, sourceOrderFromPaths(findings)),
    };
  }

  const registry = result.data;
  const findings = sortFindings(
    SOURCE_REGISTRY_RULES.flatMap((rule) =>
      rule.evaluate(registry).map((violation) =>
        buildFinding(rule.id, rule.severity, violation.message, {
          sourceId: violation.sourceId,
          path: violation.path,
        }),
      ),
    ),
    new Map(registry.sources.map((entry, index) => [entry.id, index])),
  );

  return {
    file: source.file,
    declaredSources,
    sources: registry.sources.map((entry) => statusOf(entry, findings)),
    findings,
  };
}

export function validateSourceRegistries(
  sources: readonly RegistrySource[],
): RegistryReport {
  // Sorted by file so a run over several paths reports the same order whatever
  // order the caller happened to supply them in.
  const registries = [...sources]
    .sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0))
    .map(validateSourceRegistry);

  const counted = registries.flatMap((registry) => registry.findings);
  return {
    reportVersion: 1,
    registries,
    blockingCount: counted.filter((f) => f.severity === "blocking").length,
    warningCount: counted.filter((f) => f.severity === "warning").length,
  };
}

/**
 * Whether one entry may be fetched.
 *
 * Three conditions, and none of them alone is enough: the entry says it is
 * active, it is not a fixture, and nothing blocking was found about it. A
 * registry-level blocking finding counts against every entry, because a file
 * that mixes fabricated sources with real ones is not a file any entry in it
 * can be trusted from.
 */
function statusOf(
  entry: SourceEntry,
  findings: readonly RegistryFinding[],
): SourceStatus {
  const blocked = findings.some(
    (finding) =>
      finding.severity === "blocking" &&
      (finding.sourceId === undefined || finding.sourceId === entry.id),
  );

  return {
    sourceId: entry.id,
    fetchable: entry.active && !entry.sample && !blocked,
  };
}

/**
 * How many entries the file claims, read from the unvalidated value.
 *
 * Read before the schema on purpose: `sources: []` fails `.min(1)`, and by the
 * time that issue exists the count is buried in an error message rather than
 * available as a fact about the file.
 */
function countDeclaredSources(parsed: unknown): number | null {
  if (!isRecord(parsed)) {
    return null;
  }
  const sources = parsed.sources;
  return Array.isArray(sources) ? sources.length : null;
}

/**
 * Builds a finding with `exactOptionalPropertyTypes` in force: an absent
 * `sourceId` is an omitted key, never a key holding `undefined`. The two are the
 * same when read back and different when a consumer serialises the report.
 */
function buildFinding(
  ruleId: string,
  severity: RegistryFinding["severity"],
  message: string,
  location: { sourceId?: string | undefined; path?: string | undefined },
): RegistryFinding {
  return {
    ruleId,
    severity,
    message,
    ...(location.sourceId === undefined ? {} : { sourceId: location.sourceId }),
    ...(location.path === undefined ? {} : { path: location.path }),
  };
}

/**
 * Findings in a fixed order: the entry they belong to, then the rule id.
 *
 * Registry-level findings sort first, because a problem with the file as a
 * whole is context for everything under it. Sorting is stable, so several
 * findings from one rule about one entry stay in the order the rule produced
 * them, which is itself deterministic.
 */
function sortFindings(
  findings: readonly RegistryFinding[],
  sourceOrder: ReadonlyMap<string, number>,
): RegistryFinding[] {
  const rank = (finding: RegistryFinding): number =>
    finding.sourceId === undefined
      ? -1
      : (sourceOrder.get(finding.sourceId) ?? Number.MAX_SAFE_INTEGER);

  return [...findings].sort((a, b) => {
    const bySource = rank(a) - rank(b);
    if (bySource !== 0) {
      return bySource;
    }
    return a.ruleId < b.ruleId ? -1 : a.ruleId > b.ruleId ? 1 : 0;
  });
}

/**
 * Entry order for schema findings, which have no parsed registry to read it
 * from. The index in `sources[n]` is the order, which is why it is recovered
 * from the path rather than from the data.
 */
function sourceOrderFromPaths(
  findings: readonly RegistryFinding[],
): ReadonlyMap<string, number> {
  const order = new Map<string, number>();
  for (const finding of findings) {
    const index = sourceIndexFromPath(finding.path);
    if (finding.sourceId !== undefined && index !== undefined) {
      order.set(finding.sourceId, index);
    }
  }
  return order;
}

function sourceIndexFromPath(path: string | undefined): number | undefined {
  const matched = /^sources\.(\d+)/.exec(path ?? "");
  const digits = matched?.[1];
  return digits === undefined ? undefined : Number(digits);
}

/**
 * The id of the entry a Zod issue sits under, when the raw value still has one.
 *
 * Read from the unvalidated object on purpose: the issue may be about another
 * field entirely, and an id that is itself malformed is better reported as the
 * text it holds than dropped.
 */
function sourceIdFromPath(
  parsed: unknown,
  path: ReadonlyArray<PropertyKey>,
): string | undefined {
  const [root, index] = path;
  if (root !== "sources" || typeof index !== "number") {
    return undefined;
  }
  if (!isRecord(parsed)) {
    return undefined;
  }
  const sources = parsed.sources;
  if (!Array.isArray(sources)) {
    return undefined;
  }
  const entry: unknown = sources[index];
  if (!isRecord(entry)) {
    return undefined;
  }
  const id = entry.id;
  return typeof id === "string" ? id : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
