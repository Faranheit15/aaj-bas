/**
 * The machine-readable report: flat, versioned, and free of anything that would
 * make the same registry produce different bytes on a different machine.
 */
import { describe, expect, it } from "vitest";
import { toRegistryReportJson } from "./format-json";
import type { RegistryReport, RegistryValidation } from "./report";

const FILE = "content/sources/registry.json";

function registry(
  overrides: Partial<RegistryValidation> = {},
): RegistryValidation {
  return {
    file: FILE,
    declaredSources: 1,
    sources: [{ sourceId: "desk-daily", fetchable: true }],
    findings: [],
    ...overrides,
  };
}

function report(registries: readonly RegistryValidation[]): RegistryReport {
  const findings = registries.flatMap((one) => one.findings);

  return {
    reportVersion: 1,
    registries,
    blockingCount: findings.filter((f) => f.severity === "blocking").length,
    warningCount: findings.filter((f) => f.severity === "warning").length,
  };
}

describe("toRegistryReportJson", () => {
  it("carries the whole report as two flat lists, each row naming its file", () => {
    const json = toRegistryReportJson(
      report([
        registry({
          sources: [
            { sourceId: "desk-daily", fetchable: true },
            { sourceId: "sample-wire", fetchable: false },
          ],
          findings: [
            {
              ruleId: "duplicate/near-feed-url",
              severity: "warning",
              path: "sources",
              message: "two feed URLs differ only by a trailing slash.",
            },
          ],
        }),
      ]),
    );

    expect(json).toEqual({
      reportVersion: 1,
      ok: true,
      blockingCount: 0,
      warningCount: 1,
      sources: [
        { file: FILE, sourceId: "desk-daily", fetchable: true },
        { file: FILE, sourceId: "sample-wire", fetchable: false },
      ],
      findings: [
        {
          file: FILE,
          ruleId: "duplicate/near-feed-url",
          severity: "warning",
          path: "sources",
          message: "two feed URLs differ only by a trailing slash.",
        },
      ],
    });
  });

  it("omits the source key entirely rather than writing null", () => {
    const [finding] = toRegistryReportJson(
      report([
        registry({
          findings: [
            {
              ruleId: "url/mixed-host-classes",
              severity: "blocking",
              message: "the registry mixes fixtures with real publishers.",
            },
          ],
        }),
      ]),
    ).findings;

    expect(finding).toBeDefined();
    expect(finding !== undefined && "sourceId" in finding).toBe(false);
    expect(finding !== undefined && "path" in finding).toBe(false);
  });

  it("derives ok from the exit code, so the two can never disagree", () => {
    const blocking = report([
      registry({
        findings: [
          {
            ruleId: "url/no-private-host",
            severity: "blocking",
            sourceId: "desk-daily",
            message: "source desk-daily points at wiki.internal.",
          },
        ],
      }),
    ]);
    expect(toRegistryReportJson(blocking).ok).toBe(false);

    // A run that checked nothing is not ok, however clean its counts look.
    const empty = report([
      registry({ declaredSources: 0, sources: [], findings: [] }),
    ]);
    expect(toRegistryReportJson(empty).ok).toBe(false);
    expect(toRegistryReportJson(report([])).ok).toBe(false);
  });

  it("writes no timestamp and no key beyond the ones it documents", () => {
    // A timestamp would make every run produce different bytes, which would
    // rule out committing a golden report or diffing two runs.
    expect(Object.keys(toRegistryReportJson(report([registry()])))).toEqual([
      "reportVersion",
      "ok",
      "blockingCount",
      "warningCount",
      "sources",
      "findings",
    ]);
  });
});
