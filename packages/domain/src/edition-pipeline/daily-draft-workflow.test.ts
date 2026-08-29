import { describe, expect, it } from "vitest";
import {
  composePrBody,
  formatPrBranchName,
  formatPrTitle,
  parseDailyDraftPrArgs,
} from "./daily-draft-pr";

describe("Daily draft PR workflow helpers (AB-702)", () => {
  it("formats branch and title conventions correctly", () => {
    expect(formatPrBranchName("2026-08-29")).toBe("draft/2026-08-29");
    expect(formatPrTitle("2026-08-29")).toBe("Draft edition: 2026-08-29");
  });

  it("parses CLI arguments accurately", () => {
    const options = parseDailyDraftPrArgs([
      "--date",
      "2026-08-30",
      "--dry-run",
      "--out-dir",
      "content/custom-drafts",
      "--summary",
    ]);

    expect(options.date).toBe("2026-08-30");
    expect(options.dryRun).toBe(true);
    expect(options.outDir).toBe("content/custom-drafts");
    expect(options.baseBranch).toBe("develop");
    expect(options.printSummary).toBe(true);
  });

  it("composes PR body with ready notice when no blocking issues exist", () => {
    const body = composePrBody("# Summary Content", false, "2026-08-29");
    expect(body).toContain("READY FOR EDITORIAL REVIEW");
    expect(body).toContain("# Summary Content");
    expect(body).toContain("### Publication Checklist for Maintainers");
  });

  it("composes PR body with blocking notice when blocking issues exist", () => {
    const body = composePrBody("# Summary Content", true, "2026-08-29");
    expect(body).toContain("BLOCKING FINDINGS");
    expect(body).toContain(
      "Human editorial review and correction are required",
    );
    expect(body).toContain("# Summary Content");
  });
});
