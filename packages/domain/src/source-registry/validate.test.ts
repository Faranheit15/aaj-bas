/**
 * The three layers, the per-entry verdict they produce, and the exit code a
 * caller reads.
 *
 * Registries are written here as plain values, never as typed objects, because
 * a parsed YAML document is what the validator actually receives and because a
 * file that must fail can then be written in a test instead of committed to the
 * repository.
 */
import { describe, expect, it } from "vitest";
import { formatRegistryText } from "./format-text";
import { toRegistryReportJson } from "./format-json";
import { REGISTRY_EXIT_CODES, registryExitCodeFor } from "./report";
import { validateSourceRegistries, validateSourceRegistry } from "./validate";

const FILE = "content/sources/registry.json";

function realEntry(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "desk-daily",
    publisher: "Desk Daily",
    siteUrl: "https://desk-daily.co.in/",
    feedUrl: "https://desk-daily.co.in/feed.xml",
    sourceType: "publisher",
    region: "india",
    language: "en",
    active: true,
    sample: false,
    termsUrl: "https://desk-daily.co.in/terms",
    termsReviewedOn: "2026-07-21",
    termsReviewedBy: "faran",
    permittedUse:
      "Headlines and the supplied description may be reused with attribution and a link to the original article.",
    permittedUses: ["headline", "supplied-description"],
    attribution: "Desk Daily",
    ...overrides,
  };
}

function sampleEntry(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: "sample-wire",
    publisher: "Sample Wire",
    siteUrl: "https://sample-wire.example/",
    feedUrl: "https://sample-wire.example/feed.xml",
    sourceType: "publisher",
    region: "world",
    language: "en",
    active: false,
    sample: true,
    ...overrides,
  };
}

function fileOf(sources: readonly unknown[], file = FILE) {
  // Round-tripped through JSON so an `undefined` written in a fixture is an
  // absent key, exactly as it would be in a parsed file.
  return {
    file,
    value: JSON.parse(JSON.stringify({ schemaVersion: 1, sources })) as unknown,
  };
}

describe("validateSourceRegistry", () => {
  it("reports a document that is not a registry without pretending to know its entries", () => {
    for (const value of ["sources", 42, null, [], { schemaVersion: 1 }]) {
      const where = JSON.stringify(value) ?? "undefined";
      const validation = validateSourceRegistry({ file: FILE, value });

      expect(validation.declaredSources, where).toBeNull();
      expect(validation.sources, where).toEqual([]);
      expect(
        validation.findings.map((finding) => finding.ruleId),
        where,
      ).toContain("registry/schema");
      expect(validation.findings[0]?.severity, where).toBe("blocking");
    }
  });

  it("treats a registry declaring nothing as nothing checked, not as something wrong", () => {
    const validation = validateSourceRegistry(fileOf([]));

    expect(validation.declaredSources).toBe(0);
    expect(validation.findings.map((finding) => finding.ruleId)).toEqual([
      "registry/no-sources",
    ]);
    // A warning, so the blocking count stays an answer to "is a registered
    // source broken"; the exit code below is what fails the run.
    expect(validation.findings[0]?.severity).toBe("warning");
    expect(registryExitCodeFor(validateSourceRegistries([fileOf([])]))).toBe(
      REGISTRY_EXIT_CODES.nothingValidated,
    );
  });

  it("does not report a run that checked something as having checked nothing", () => {
    /*
      `registryExitCodeFor` asks whether EVERY registry declared nothing, and
      the distinction only becomes visible with more than one file — which is
      why every test before this one passed a single registry and the `every`
      could be weakened to `some` with the whole suite green.

      The two cases below are the ones that weakening breaks. A run that
      validated one full registry and one empty file did check something: if
      the full one is clean the answer is success, and if it is broken the
      answer is that it is broken. Neither is "nothing was checked", and
      section 37 keeps those apart.
    */
    const good = fileOf([realEntry()]);
    const broken = fileOf([
      realEntry({ feedUrl: "https://127.0.0.1/feed.xml" }),
    ]);
    const empty = fileOf([]);

    expect(registryExitCodeFor(validateSourceRegistries([good, empty]))).toBe(
      REGISTRY_EXIT_CODES.ok,
    );
    expect(registryExitCodeFor(validateSourceRegistries([broken, empty]))).toBe(
      REGISTRY_EXIT_CODES.blocking,
    );
    // And the guarantee that still holds: every file empty really is nothing.
    expect(registryExitCodeFor(validateSourceRegistries([empty, empty]))).toBe(
      REGISTRY_EXIT_CODES.nothingValidated,
    );
  });

  it("stops at the schema and attributes each issue to the entry that carries it", () => {
    const validation = validateSourceRegistry(
      fileOf([realEntry({ termsReviewedOn: "2026-02-30" })]),
    );

    expect(validation.findings.map((finding) => finding.ruleId)).toEqual([
      "registry/schema",
    ]);
    expect(validation.findings[0]?.sourceId).toBe("desk-daily");
    expect(validation.findings[0]?.path).toContain("sources.0.termsReviewedOn");
    // Nothing was judged, so no entry gets a verdict. A list of `false` would
    // claim they were checked and refused.
    expect(validation.sources).toEqual([]);
  });

  it("orders schema findings by the entry they came from, with the document first", () => {
    // Zod reports the entries in file order and the document's own unrecognised
    // key last, so this ordering is the sort's work rather than the parser's: a
    // problem with the file as a whole is context for everything under it.
    const validation = validateSourceRegistry({
      file: FILE,
      value: JSON.parse(
        JSON.stringify({
          schemaVersion: 1,
          reviewedBy: "faran",
          sources: [
            realEntry({ id: "zephyr-post", region: "europe" }),
            realEntry({
              id: "alder-gazette",
              feedUrl: "https://alder-gazette.co.in/rss",
            }),
            realEntry({
              id: "meridian-wire",
              feedUrl: "https://meridian-wire.co.in/rss",
              termsReviewedOn: "2026-02-30",
            }),
          ],
        }),
      ) as unknown,
    });

    expect(
      validation.findings.map((finding) => [finding.sourceId, finding.path]),
    ).toEqual([
      [undefined, undefined],
      ["zephyr-post", "sources.0.region"],
      ["meridian-wire", "sources.2.termsReviewedOn"],
    ]);
    expect(validation.declaredSources).toBe(3);
  });

  it("computes fetchable from all three conditions, not from `active` alone", () => {
    const validation = validateSourceRegistry(
      fileOf([
        realEntry(),
        realEntry({
          id: "valley-record",
          publisher: "Valley Record",
          siteUrl: "https://valley-record.co.in/",
          feedUrl: "https://valley-record.co.in/rss",
          active: false,
          permittedUse: undefined,
        }),
      ]),
    );

    expect(validation.findings).toEqual([]);
    expect(validation.sources).toEqual([
      { sourceId: "desk-daily", fetchable: true },
      { sourceId: "valley-record", fetchable: false },
    ]);
  });

  it("refuses to call an entry fetchable when a blocking rule named it", () => {
    const validation = validateSourceRegistry(
      fileOf([
        realEntry(),
        realEntry({
          id: "valley-record",
          publisher: "Valley Record",
          siteUrl: "https://valley-record.co.in/",
          feedUrl: "https://127.0.0.1/rss",
        }),
      ]),
    );

    expect(validation.sources).toEqual([
      { sourceId: "desk-daily", fetchable: true },
      { sourceId: "valley-record", fetchable: false },
    ]);
  });

  it("refuses every entry in a file that mixes fixtures with real publishers", () => {
    // The finding belongs to no single entry, and that is exactly why it counts
    // against all of them: a file this confused is not one any entry is
    // trustworthy from.
    const validation = validateSourceRegistry(
      fileOf([realEntry(), sampleEntry()]),
    );

    expect(validation.findings.map((finding) => finding.ruleId)).toEqual([
      "url/mixed-host-classes",
    ]);
    expect(validation.sources.every((entry) => !entry.fetchable)).toBe(true);
  });

  it("sorts two findings about one entry by rule id, not by which rule ran first", () => {
    // A sample on a private name breaks two rules at once, and the rule table
    // produces them in the opposite order to the one the report must use:
    // `url/no-private-host` is evaluated second in the table and sorts last by
    // id. Without the tiebreak the report would follow the table, so reordering
    // the table would silently reorder every report.
    const validation = validateSourceRegistry(
      fileOf([sampleEntry({ feedUrl: "https://cache.localhost/feed.xml" })]),
    );

    expect(validation.findings.map((finding) => finding.ruleId)).toEqual([
      "sample/reserved-host-required",
      "url/no-private-host",
    ]);
    expect(
      validation.findings.every(
        (finding) => finding.sourceId === "sample-wire",
      ),
    ).toBe(true);
  });

  it("sorts registry-level findings ahead of the entries they are context for", () => {
    const validation = validateSourceRegistry(
      fileOf([
        realEntry({ feedUrl: "https://127.0.0.1/feed.xml" }),
        sampleEntry(),
      ]),
    );

    expect(
      validation.findings.map((finding) => [finding.ruleId, finding.sourceId]),
    ).toEqual([
      ["url/mixed-host-classes", undefined],
      ["url/no-address-literal", "desk-daily"],
    ]);
  });
});

describe("validateSourceRegistries", () => {
  it("exits 3 when nothing matched at all", () => {
    const report = validateSourceRegistries([]);

    expect(report.registries).toEqual([]);
    expect(registryExitCodeFor(report)).toBe(
      REGISTRY_EXIT_CODES.nothingValidated,
    );
  });

  it("exits 1 on a blocking finding and 0 on a clean registry", () => {
    expect(
      registryExitCodeFor(
        validateSourceRegistries([fileOf([realEntry(), sampleEntry()])]),
      ),
    ).toBe(REGISTRY_EXIT_CODES.blocking);

    expect(
      registryExitCodeFor(validateSourceRegistries([fileOf([realEntry()])])),
    ).toBe(REGISTRY_EXIT_CODES.ok);
  });

  it("counts warnings as warnings, and passes the run", () => {
    // The ADR's central promise -- blocking fails the suite, a warning does not
    // -- asserted where the counts are actually computed. Both report formats
    // build their own fixtures with counts written by hand, so nothing else
    // exercises this.
    const report = validateSourceRegistries([
      fileOf([
        realEntry(),
        realEntry({
          id: "desk-daily-copy",
          feedUrl: "https://desk-daily.co.in/feed.xml/",
        }),
      ]),
    ]);

    // Two: the near-duplicate feed URLs, and the review note copied with them.
    expect(report.warningCount).toBe(2);
    expect(report.blockingCount).toBe(0);
    expect(registryExitCodeFor(report)).toBe(REGISTRY_EXIT_CODES.ok);
    expect(toRegistryReportJson(report).ok).toBe(true);
  });

  it("counts blocking and warning findings separately in one run", () => {
    const report = validateSourceRegistries([
      fileOf([
        realEntry(),
        realEntry({
          id: "desk-daily-copy",
          feedUrl: "https://desk-daily.co.in/feed.xml/",
        }),
        realEntry({
          id: "valley-record",
          publisher: "Valley Record",
          siteUrl: "https://valley-record.co.in/",
          feedUrl: "https://127.0.0.1/rss",
          termsUrl: "https://valley-record.co.in/terms",
          permittedUse:
            "Valley Record allows headline reuse and the description it supplies, with a link back to each story.",
        }),
      ]),
    ]);

    expect(report.blockingCount).toBe(1);
    expect(report.warningCount).toBe(2);
    expect(registryExitCodeFor(report)).toBe(REGISTRY_EXIT_CODES.blocking);
    expect(toRegistryReportJson(report).ok).toBe(false);
  });

  it("judges a run over several files by what any of them found", () => {
    // An empty file alongside a real registry is a run that did check
    // something, so the empty file must not turn the verdict into "nothing was
    // checked" -- in either direction.
    const empty = fileOf([], "content/sources/empty.json");

    expect(
      registryExitCodeFor(
        validateSourceRegistries([
          fileOf([realEntry(), sampleEntry()], "content/sources/a.json"),
          empty,
        ]),
      ),
    ).toBe(REGISTRY_EXIT_CODES.blocking);

    expect(
      registryExitCodeFor(
        validateSourceRegistries([
          fileOf([realEntry()], "content/sources/a.json"),
          empty,
        ]),
      ),
    ).toBe(REGISTRY_EXIT_CODES.ok);

    // Every file empty is still a run that checked nothing.
    expect(
      registryExitCodeFor(
        validateSourceRegistries([fileOf([], "content/sources/a.json"), empty]),
      ),
    ).toBe(REGISTRY_EXIT_CODES.nothingValidated);
  });

  it("reads files in a fixed order whatever order the caller supplied", () => {
    const first = fileOf([realEntry()], "content/sources/a.json");
    const second = fileOf([sampleEntry()], "content/sources/b.json");

    expect(
      validateSourceRegistries([second, first]).registries.map(
        (one) => one.file,
      ),
    ).toEqual(["content/sources/a.json", "content/sources/b.json"]);
  });

  it("reports the same bytes when the entries are reordered", () => {
    // Every finding here is registry-level, so nothing in the report depends on
    // where in the file an entry happened to sit. Per-entry findings do carry
    // their entry's index, which is the point of a path.
    const forwards = validateSourceRegistries([
      fileOf([realEntry(), sampleEntry()]),
    ]);
    const backwards = validateSourceRegistries([
      fileOf([sampleEntry(), realEntry()]),
    ]);

    expect(formatRegistryText(forwards)).toBe(formatRegistryText(backwards));
    expect(toRegistryReportJson(forwards).findings).toEqual(
      toRegistryReportJson(backwards).findings,
    );
  });
});
