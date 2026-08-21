/**
 * The terminal report, pinned line for line.
 *
 * Reports are built here as values rather than validated from text, so a change
 * to a rule cannot quietly rewrite what this file claims the output looks like.
 */
import { describe, expect, it } from "vitest";
import { formatRegistryText } from "./format-text";
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

describe("formatRegistryText", () => {
  it("locates a finding in four fields, with no column that always reads -", () => {
    const text = formatRegistryText(
      report([
        registry({
          sources: [{ sourceId: "desk-daily", fetchable: false }],
          findings: [
            {
              ruleId: "url/no-address-literal",
              severity: "blocking",
              sourceId: "desk-daily",
              path: "sources[0].feedUrl",
              message:
                "source desk-daily has a feed URL pointing at 127.0.0.1.",
            },
          ],
        }),
      ]),
    );

    expect(text.split("\n").slice(0, 2)).toEqual([
      `FAIL: ${FILE} desk-daily [url/no-address-literal] blocking`,
      "  source desk-daily has a feed URL pointing at 127.0.0.1.",
    ]);
  });

  it("writes - for a finding that belongs to the file rather than an entry", () => {
    const text = formatRegistryText(
      report([
        registry({
          sources: [],
          findings: [
            {
              ruleId: "url/mixed-host-classes",
              severity: "blocking",
              path: "sources",
              message:
                "the registry mixes 1 reserved-name source with 1 real one.",
            },
          ],
        }),
      ]),
    );

    expect(text.split("\n")[0]).toBe(
      `FAIL: ${FILE} - [url/mixed-host-classes] blocking`,
    );
  });

  it("refuses to call a run that checked nothing a success", () => {
    expect(formatRegistryText(report([]))).toBe(
      [
        "FAIL: no source registry to validate.",
        "  Nothing matched, so nothing was checked.",
      ].join("\n"),
    );

    const empty = report([
      registry({
        declaredSources: 0,
        sources: [],
        findings: [
          {
            ruleId: "registry/no-sources",
            severity: "warning",
            path: "sources",
            message: "the registry declares no sources, so nothing was checked",
          },
        ],
      }),
    ]);
    // A warning-only report that still fails: the summary has to say so rather
    // than print the advisory line that follows an ordinary warning.
    expect(formatRegistryText(empty).split("\n").slice(2)).toEqual([
      "FAIL: no sources to validate.",
      "  Every registry declared none, so nothing was checked.",
    ]);
  });

  it("summarises a blocking run, a warning run, and a clean one differently", () => {
    const blocking = formatRegistryText(
      report([
        registry({
          sources: [{ sourceId: "desk-daily", fetchable: false }],
          findings: [
            {
              ruleId: "url/no-private-host",
              severity: "blocking",
              sourceId: "desk-daily",
              message: "source desk-daily points at wiki.internal.",
            },
          ],
        }),
      ]),
    );
    expect(blocking.split("\n").at(-1)).toBe(
      "FAIL: 1 source, 1 blocking, 0 warnings.",
    );

    const warning = formatRegistryText(
      report([
        registry({
          findings: [
            {
              ruleId: "duplicate/near-feed-url",
              severity: "warning",
              message: "two feed URLs differ only by a trailing slash.",
            },
          ],
        }),
      ]),
    );
    expect(warning.split("\n").slice(-2)).toEqual([
      "WARN: 1 source, 0 blocking, 1 warning.",
      "  Warnings are advisory and do not block a fetch.",
    ]);

    const clean = formatRegistryText(
      report([
        registry({
          declaredSources: 2,
          sources: [
            { sourceId: "desk-daily", fetchable: true },
            { sourceId: "sample-wire", fetchable: false },
          ],
        }),
      ]),
    );
    expect(clean.split("\n")).toEqual([
      `OK: 2 sources in ${FILE} passed with 0 blocking, 0 warnings.`,
      "  1 of 2 are fetchable.",
    ]);
  });
});
