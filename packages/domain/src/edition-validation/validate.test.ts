/**
 * Validation as a whole: the three layers, the ordering guarantee, and the one
 * acceptance test that matters — the edition actually in `content/` must pass.
 *
 * Every input here is text built in the test. Nothing reads the filesystem, and
 * the editions that must fail exist only for the length of an assertion, so the
 * repository never carries a deliberately broken edition to prove the validator
 * works.
 */
import { validEdition } from "@aaj-bas/test-fixtures";
import { describe, expect, it } from "vitest";
import realEdition from "../../../../content/editions/2026-07-21.json";
import { validateEdition, validateEditions } from "./validate";

const REAL_EDITION_FILE = "content/editions/2026-07-21.json";

function sourceOf(edition: unknown, file = "content/editions/2026-08-13.json") {
  return { file, text: JSON.stringify(edition) };
}

describe("validateEdition", () => {
  it("reports a file that is not JSON once, and nothing else", () => {
    const result = validateEdition({
      file: "content/editions/2026-08-13.json",
      text: "{ not json",
    });

    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.ruleId).toBe("edition/file-json");
    expect(result.findings[0]?.severity).toBe("blocking");
    expect(result.editionDate).toBeNull();
    expect(result.publishable).toBe(false);
  });

  it("stops at the schema and does not run the editorial rules", () => {
    // Seven core stories: a contract failure, and one that would also make
    // several editorial rules produce findings whose real cause is this one.
    const edition = validEdition();
    const result = validateEdition(
      sourceOf({ ...edition, coreStoryIds: edition.coreStoryIds.slice(0, 7) }),
    );

    expect(result.findings.length).toBeGreaterThan(0);
    expect(
      result.findings.every((finding) => finding.ruleId === "edition/schema"),
    ).toBe(true);
    expect(
      result.findings.every((finding) => finding.severity === "blocking"),
    ).toBe(true);
    // The date survives a schema failure: it is how the report names the file.
    expect(result.editionDate).toBe("2026-08-13");
    expect(result.publishable).toBe(false);
  });

  it("locates a schema issue by path and recovers the story it belongs to", () => {
    const edition = validEdition();
    const result = validateEdition(
      sourceOf({
        ...edition,
        stories: edition.stories.map((story, index) =>
          index === 3 ? { ...story, headline: "short" } : story,
        ),
      }),
    );

    const finding = result.findings.find(
      (candidate) => candidate.path === "stories.3.headline",
    );
    expect(finding?.ruleId).toBe("edition/schema");
    expect(finding?.storyId).toBe("story-3");
  });

  it("reports the same findings for the same input, twice over", () => {
    const source = sourceOf(brokenInSeveralPlaces());
    expect(validateEdition(source)).toEqual(validateEdition(source));
  });

  it("orders findings by story, then by rule id", () => {
    const result = validateEdition(sourceOf(brokenInSeveralPlaces()));
    const storyIds = result.findings.map((finding) => finding.storyId);

    // Edition-level findings first: a problem with the whole edition is context
    // for everything under it.
    const firstStory = storyIds.findIndex((id) => id !== undefined);
    expect(firstStory).toBeGreaterThan(-1);
    expect(storyIds.slice(0, firstStory)).toEqual(
      storyIds.slice(0, firstStory).map(() => undefined),
    );

    // Then story order, never source or rule order.
    const ordered = storyIds
      .slice(firstStory)
      .map((id) => Number((id ?? "").replace("story-", "")));
    expect(ordered).toEqual([...ordered].sort((a, b) => a - b));

    // Within one story, by rule id.
    const forStoryOne = result.findings
      .filter((finding) => finding.storyId === "story-1")
      .map((finding) => finding.ruleId);
    expect(forStoryOne).toEqual([...forStoryOne].sort());
    expect(forStoryOne.length).toBeGreaterThan(1);
  });

  it("names the file mismatch when the filename and the date disagree", () => {
    const matching = validateEdition(sourceOf(validEdition()));
    expect(
      matching.findings.filter(
        (finding) => finding.ruleId === "structural/file-name-matches-date",
      ),
    ).toEqual([]);

    const mismatched = validateEdition(
      sourceOf(validEdition(), "content/editions/2026-08-12.json"),
    );
    const found = mismatched.findings.filter(
      (finding) => finding.ruleId === "structural/file-name-matches-date",
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.severity).toBe("blocking");
    expect(found[0]?.message).toContain("2026-08-13");
  });

  it("calls sample data unpublishable and clean real content publishable", () => {
    // The shared fixture is built on reserved domains, which is exactly what
    // `url/sample-data-hosts` exists to notice.
    const sample = validateEdition(sourceOf(validEdition()));
    expect(
      sample.findings.some(
        (finding) => finding.ruleId === "url/sample-data-hosts",
      ),
    ).toBe(true);
    expect(sample.publishable).toBe(false);

    const real = validateEdition(sourceOf(onRealHosts()));
    expect(real.findings.filter((f) => f.severity === "blocking")).toEqual([]);
    expect(real.publishable).toBe(true);
  });

  it("refuses to call an edition with a blocking finding publishable", () => {
    // The fixture's `estimatedMinutes` is a placeholder rather than its own
    // arithmetic, so this edition is on real hosts and still blocked. A
    // pipeline branching on `publishable` would otherwise deploy it.
    const blocked = validateEdition(
      sourceOf({ ...onRealHosts(), estimatedMinutes: 7 }),
    );
    expect(blocked.findings.map((finding) => finding.ruleId)).toContain(
      "length/estimated-minutes",
    );
    expect(blocked.publishable).toBe(false);
  });
});

/**
 * The shared fixture moved onto real hosts, with the estimate its own visible
 * word count implies — the smallest edition that is genuinely publishable.
 */
function onRealHosts() {
  const edition = validEdition();
  return {
    ...edition,
    estimatedMinutes: 2,
    sources: edition.sources.map((source, index) => ({
      ...source,
      url: `https://news-publisher-${index}.org/article`,
    })),
  };
}

describe("validateEditions", () => {
  it("sorts editions by file and sums the counts", () => {
    const report = validateEditions([
      { file: "content/editions/2026-08-14.json", text: "{ not json" },
      sourceOf(validEdition(), "content/editions/2026-08-13.json"),
    ]);

    expect(report.reportVersion).toBe(1);
    expect(report.editions.map((edition) => edition.file)).toEqual([
      "content/editions/2026-08-13.json",
      "content/editions/2026-08-14.json",
    ]);
    expect(report.blockingCount).toBe(
      report.editions.reduce(
        (total, edition) =>
          total +
          edition.findings.filter((finding) => finding.severity === "blocking")
            .length,
        0,
      ),
    );
    expect(report.warningCount).toBe(
      report.editions.reduce(
        (total, edition) =>
          total +
          edition.findings.filter((finding) => finding.severity === "warning")
            .length,
        0,
      ),
    );
    expect(report.blockingCount).toBeGreaterThan(0);
    expect(report.warningCount).toBeGreaterThan(0);
  });

  it("does not mutate the caller's array while sorting it", () => {
    const sources = [
      sourceOf(validEdition(), "content/editions/2026-08-14.json"),
      sourceOf(validEdition(), "content/editions/2026-08-13.json"),
    ];
    validateEditions(sources);
    expect(sources.map((source) => source.file)).toEqual([
      "content/editions/2026-08-14.json",
      "content/editions/2026-08-13.json",
    ]);
  });
});

describe("the published edition in content/", () => {
  it("has no blocking finding", () => {
    const result = validateEdition({
      file: REAL_EDITION_FILE,
      text: JSON.stringify(realEdition),
    });

    const blocking = result.findings.filter(
      (finding) => finding.severity === "blocking",
    );
    // Named in the failure message: a blocking finding here means either the
    // edition or the rule is wrong, and the reviewer needs to know which rule.
    expect(blocking.map((finding) => finding.ruleId)).toEqual([]);
    expect(result.editionDate).toBe("2026-07-21");
  });

  it("warns only that it runs on reserved domains", () => {
    const result = validateEdition({
      file: REAL_EDITION_FILE,
      text: JSON.stringify(realEdition),
    });

    // Its sources are invented publishers on `.invalid`, so it is sample data
    // however finished it reads, and `publishable` says so.
    expect(result.findings.map((finding) => finding.ruleId)).toEqual([
      "diversity/publisher-concentration",
      "diversity/publisher-concentration",
      "url/sample-data-hosts",
    ]);
    expect(result.publishable).toBe(false);
  });
});

/**
 * A schema-valid edition broken in several editorial ways at once, for the
 * ordering and determinism tests. Story 1 carries two problems so that the
 * within-story tiebreak on rule id has something to order.
 */
function brokenInSeveralPlaces(): unknown {
  const edition = validEdition();
  return {
    ...edition,
    estimatedMinutes: 59,
    stories: edition.stories.map((story, index) => {
      if (index === 1) {
        return {
          ...story,
          slug: edition.stories[0]?.slug ?? story.slug,
          confidence: "disputed",
          sourceIds: ["src-0", "src-1"],
          sourceCount: 2,
        };
      }
      if (index === 5) {
        return { ...story, reviewed: false };
      }
      return story;
    }),
    status: "corrected",
    editionVersion: 2,
    correctionNotes: [],
  };
}
