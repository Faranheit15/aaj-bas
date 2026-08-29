import { describe, expect, it } from "vitest";
import { type RollbackEditionSummary, planRollback } from "./rollback";

describe("Rollback planning domain logic (AB-703)", () => {
  const editions: readonly RollbackEditionSummary[] = [
    {
      date: "2026-07-20",
      status: "published",
      editionVersion: 1,
      hasCorrections: false,
      filePath: "content/editions/2026-07-20.json",
    },
    {
      date: "2026-07-21",
      status: "corrected",
      editionVersion: 2,
      hasCorrections: true,
      filePath: "content/editions/2026-07-21.json",
    },
    {
      date: "2026-07-22",
      status: "published",
      editionVersion: 1,
      hasCorrections: false,
      filePath: "content/editions/2026-07-22.json",
    },
  ];

  it("plans rollback to immediate previous edition using --to-previous", () => {
    const result = planRollback(editions, { toPrevious: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.currentLatest).toBe("2026-07-22");
    expect(result.plan.targetDate).toBe("2026-07-21");
    expect(result.plan.targetEdition.status).toBe("corrected");
    expect(result.plan.editionsToWithdraw).toHaveLength(0);
    expect(result.plan.remainingPublishedDates).toEqual([
      "2026-07-20",
      "2026-07-21",
      "2026-07-22",
    ]);
  });

  it("plans rollback with edition withdrawal (--withdraw-current)", () => {
    const result = planRollback(editions, {
      toPrevious: true,
      withdrawCurrent: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.targetDate).toBe("2026-07-21");
    expect(result.plan.editionsToWithdraw).toHaveLength(1);
    expect(result.plan.editionsToWithdraw[0]?.date).toBe("2026-07-22");
    expect(result.plan.remainingPublishedDates).toEqual([
      "2026-07-20",
      "2026-07-21",
    ]);
  });

  it("plans rollback to non-adjacent older target date and withdraws multiple newer editions", () => {
    const result = planRollback(editions, {
      targetDate: "2026-07-20",
      withdrawCurrent: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.targetDate).toBe("2026-07-20");
    expect(result.plan.editionsToWithdraw.map((e) => e.date)).toEqual([
      "2026-07-22",
      "2026-07-21",
    ]);
    expect(result.plan.remainingPublishedDates).toEqual(["2026-07-20"]);
  });

  it("rejects rollback when only 1 edition exists and toPrevious is requested", () => {
    const singleEdition = editions.slice(0, 1);
    const result = planRollback(singleEdition, { toPrevious: true });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("only 1 published edition exists");
  });

  it("rejects rollback when target date equals current latest", () => {
    const result = planRollback(editions, { targetDate: "2026-07-22" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("already the current latest edition");
  });

  it("rejects rollback when target date is newer than latest or does not exist", () => {
    const result = planRollback(editions, { targetDate: "2026-07-25" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("not a published or corrected edition");
  });

  it("ignores draft editions when discovering eligible rollback targets", () => {
    const mixedEditions: readonly RollbackEditionSummary[] = [
      ...editions,
      {
        date: "2026-07-23",
        status: "draft",
        editionVersion: 1,
        hasCorrections: false,
        filePath: "content/drafts/2026-07-23.json",
      },
    ];

    const result = planRollback(mixedEditions, { toPrevious: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.currentLatest).toBe("2026-07-22");
    expect(result.plan.targetDate).toBe("2026-07-21");
  });
});
