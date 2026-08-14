/**
 * What may reach a reader, and in what order.
 *
 * Two things are being protected here. The first is that published mode never
 * stages content the validator refused, because this function is the last thing
 * standing between `content/` and a deployment. The second is that the index it
 * produces is a valid one: it is written to disk without further checking, so a
 * plan that emitted an out-of-order or self-contradicting pointer would ship,
 * and the reader would follow it. The last test parses the output against the
 * published contract for exactly that reason -- section 16 makes the schema
 * authoritative, so agreeing with it is a testable property rather than a
 * runtime check that would cost every build.
 */
import { editionIndexSchema } from "@aaj-bas/schemas";
import { describe, expect, it } from "vitest";
import type {
  EditionValidation,
  ValidationFinding,
  ValidationReport,
} from "../edition-validation";
import { planStaging } from "./plan";

const BLOCKING: ValidationFinding = {
  ruleId: "diversity/topic-cap",
  severity: "blocking",
  message: "4 core stories carry the topic india",
};

const SAMPLE_DATA: ValidationFinding = {
  ruleId: "url/sample-data-hosts",
  severity: "warning",
  message: "every source points at a reserved domain",
};

function edition(
  date: string | null,
  overrides: Partial<EditionValidation> = {},
): EditionValidation {
  return {
    file: `content/editions/${date ?? "broken"}.json`,
    editionDate: date,
    publishable: true,
    findings: [],
    ...overrides,
  };
}

/** Counts are taken from the findings, as `validateEditions` computes them. */
function report(editions: readonly EditionValidation[]): ValidationReport {
  const findings = editions.flatMap((each) => each.findings);
  return {
    reportVersion: 1,
    editions,
    blockingCount: findings.filter((f) => f.severity === "blocking").length,
    warningCount: findings.filter((f) => f.severity === "warning").length,
  };
}

/** The AB-102 sample: clean, invented, and refused by the publish profile. */
const SAMPLE = edition("2026-07-21", {
  publishable: false,
  findings: [SAMPLE_DATA],
});

describe("planStaging", () => {
  it("withholds a not-publishable edition from a published build", () => {
    const plan = planStaging(report([SAMPLE]), "published");

    expect(plan.staged).toEqual([]);
    expect(plan.skipped).toEqual([
      { file: "content/editions/2026-07-21.json", reason: "not publishable" },
    ]);
    expect(plan.index.latest).toBeNull();
    expect(plan.index.contentSet).toBe("published");
  });

  it("stages the same edition in sample mode", () => {
    // Otherwise the development server has nothing to render at all: invented
    // content is the only content the repository carries today.
    const plan = planStaging(report([SAMPLE]), "sample");

    expect(plan.staged).toEqual([
      { file: "content/editions/2026-07-21.json", date: "2026-07-21" },
    ]);
    expect(plan.skipped).toEqual([]);
    expect(plan.index).toEqual({
      schemaVersion: 1,
      contentSet: "sample",
      latest: "2026-07-21",
      editions: ["2026-07-21"],
    });
  });

  it("still withholds a broken edition in sample mode", () => {
    // Sample mode relaxes who may see invented content, never whether the
    // content is correct. A developer sees the absence a reader would see.
    const plan = planStaging(
      report([
        edition("2026-07-21", { publishable: false, findings: [BLOCKING] }),
      ]),
      "sample",
    );

    expect(plan.staged).toEqual([]);
    expect(plan.skipped).toEqual([
      {
        file: "content/editions/2026-07-21.json",
        reason: "1 blocking finding",
      },
    ]);
    expect(plan.index.latest).toBeNull();
  });

  it("plans an empty build from an empty report", () => {
    const plan = planStaging(report([]), "published");

    expect(plan.staged).toEqual([]);
    expect(plan.skipped).toEqual([]);
    expect(plan.index).toEqual({
      schemaVersion: 1,
      contentSet: "published",
      latest: null,
      editions: [],
    });
  });

  it("lists editions newest first whatever order they arrived in", () => {
    // `validateEditions` sorts by filename, which is oldest first for dated
    // names. The index contract is the opposite, and the reader navigates by
    // position, so getting this backwards would offer the wrong neighbour.
    const plan = planStaging(
      report([
        edition("2026-08-11"),
        edition("2026-08-12"),
        edition("2026-08-13"),
      ]),
      "published",
    );

    expect(plan.index.editions).toEqual([
      "2026-08-13",
      "2026-08-12",
      "2026-08-11",
    ]);
    expect(plan.index.latest).toBe("2026-08-13");
    expect(plan.staged.map((each) => each.file)).toEqual([
      "content/editions/2026-08-13.json",
      "content/editions/2026-08-12.json",
      "content/editions/2026-08-11.json",
    ]);
  });

  it("skips an edition that never parsed", () => {
    const broken = edition(null, {
      publishable: false,
      findings: [
        {
          ruleId: "edition/file-json",
          severity: "blocking",
          message: "the file is not valid JSON: Unexpected end of JSON input",
        },
      ],
    });

    for (const mode of ["published", "sample"] as const) {
      const plan = planStaging(report([broken]), mode);

      expect(plan.staged).toEqual([]);
      expect(plan.skipped).toEqual([
        {
          file: "content/editions/broken.json",
          reason: "the file did not parse, so it has no date",
        },
      ]);
    }
  });

  it("produces an index that satisfies the published contract", () => {
    const editions = report([
      edition("2026-08-11"),
      edition("2026-08-13"),
      edition("2026-08-12"),
      SAMPLE,
    ]);

    for (const mode of ["published", "sample"] as const) {
      const result = editionIndexSchema.safeParse(
        planStaging(editions, mode).index,
      );

      expect(result.error?.issues ?? []).toEqual([]);
      expect(result.success).toBe(true);
    }
  });

  it("returns the same plan for the same report", () => {
    const editions = report([edition("2026-08-13"), edition("2026-08-12")]);

    expect(planStaging(editions, "published")).toEqual(
      planStaging(editions, "published"),
    );
  });
});
