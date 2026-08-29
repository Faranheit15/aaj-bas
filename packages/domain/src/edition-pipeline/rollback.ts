/**
 * Pure domain functions for planning and validating edition rollbacks (AB-703, AB-803).
 */

import type { EditionStatus } from "@aaj-bas/schemas";

export interface RollbackEditionSummary {
  readonly date: string;
  readonly status: EditionStatus;
  readonly editionVersion: number;
  readonly hasCorrections: boolean;
  readonly filePath: string;
}

export interface RollbackPlanOptions {
  readonly targetDate?: string | undefined;
  readonly toPrevious?: boolean | undefined;
  readonly withdrawCurrent?: boolean | undefined;
}

export interface RollbackPlan {
  readonly currentLatest: string;
  readonly targetDate: string;
  readonly targetEdition: RollbackEditionSummary;
  readonly editionsToWithdraw: readonly RollbackEditionSummary[];
  readonly remainingPublishedDates: readonly string[];
}

export type RollbackPlanResult =
  | { readonly ok: true; readonly plan: RollbackPlan }
  | { readonly ok: false; readonly error: string };

/**
 * Computes an immutable rollback plan given available edition summaries.
 */
export function planRollback(
  availableEditions: readonly RollbackEditionSummary[],
  options: RollbackPlanOptions,
): RollbackPlanResult {
  const eligible = availableEditions
    .filter((e) => e.status === "published" || e.status === "corrected")
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  if (eligible.length === 0) {
    return {
      ok: false,
      error: "No published or corrected editions exist to rollback.",
    };
  }

  const currentLatestEdition = eligible[eligible.length - 1]!;
  const currentLatest = currentLatestEdition.date;

  let targetDate: string;

  if (options.toPrevious) {
    if (eligible.length < 2) {
      return {
        ok: false,
        error:
          "Cannot rollback to previous edition: only 1 published edition exists.",
      };
    }
    targetDate = eligible[eligible.length - 2]!.date;
  } else if (options.targetDate) {
    targetDate = options.targetDate;
  } else {
    return {
      ok: false,
      error:
        "Please specify either --target-date <YYYY-MM-DD> or --to-previous.",
    };
  }

  const targetEdition = eligible.find((e) => e.date === targetDate);
  if (!targetEdition) {
    return {
      ok: false,
      error: `Selected rollback date '${targetDate}' is not a published or corrected edition.`,
    };
  }

  if (targetDate === currentLatest) {
    return {
      ok: false,
      error: `Target date '${targetDate}' is already the current latest edition.`,
    };
  }

  if (targetDate > currentLatest) {
    return {
      ok: false,
      error: `Target date '${targetDate}' is newer than current latest edition '${currentLatest}'.`,
    };
  }

  const editionsToWithdraw = options.withdrawCurrent
    ? eligible
        .filter((e) => e.date > targetDate)
        .sort((a, b) => (a.date > b.date ? -1 : a.date < b.date ? 1 : 0))
    : [];

  const remainingPublishedDates = eligible
    .filter((e) => !editionsToWithdraw.some((w) => w.date === e.date))
    .map((e) => e.date);

  return {
    ok: true,
    plan: {
      currentLatest,
      targetDate,
      targetEdition,
      editionsToWithdraw,
      remainingPublishedDates,
    },
  };
}
