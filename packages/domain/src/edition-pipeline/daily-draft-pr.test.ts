import { describe, expect, it } from "vitest";
import {
  composePrBody,
  formatPrBranchName,
  formatPrTitle,
  parseDailyDraftPrArgs,
  validateEditionDateInput,
} from "./daily-draft-pr";

describe("Daily draft PR domain helpers (AB-702)", () => {
  it("formats branch name and title predictably", () => {
    expect(formatPrBranchName("2026-08-29")).toBe("draft/2026-08-29");
    expect(formatPrTitle("2026-08-29")).toBe("Draft edition: 2026-08-29");
  });

  it("validates strict calendar YYYY-MM-DD format", () => {
    expect(validateEditionDateInput("2026-08-29")).toBe("2026-08-29");
    expect(() => validateEditionDateInput("2026-13-45")).toThrow(
      /Invalid edition date/,
    );
    expect(() => validateEditionDateInput("not-a-date")).toThrow(
      /Invalid edition date/,
    );
    expect(() => validateEditionDateInput("2026/08/29")).toThrow(
      /Invalid edition date/,
    );
  });

  it("parses CLI arguments correctly", () => {
    const args = [
      "--date",
      "2026-08-29",
      "--out-dir",
      "custom/drafts",
      "--dry-run",
      "--fixture",
      "--use-ai",
    ];
    const options = parseDailyDraftPrArgs(args);

    expect(options.date).toBe("2026-08-29");
    expect(options.outDir).toBe("custom/drafts");
    expect(options.dryRun).toBe(true);
    expect(options.useFixture).toBe(true);
    expect(options.useAi).toBe(true);
  });

  it("composes PR body with blocking notice when issues exist", () => {
    const body = composePrBody("## Summary\nFindings", true, "2026-08-29");
    expect(body).toContain("⚠️ **BLOCKING FINDINGS**");
    expect(body).toContain("2026-08-29");
    expect(body).toContain("Publication Checklist for Maintainers");
  });

  it("composes PR body with ready notice when clean", () => {
    const body = composePrBody("## Summary\nAll clean", false, "2026-08-29");
    expect(body).toContain("✅ **READY FOR EDITORIAL REVIEW**");
    expect(body).toContain("Publication Checklist for Maintainers");
  });
});
