/**
 * How far through the edition the reader is, and the words shown at the end.
 *
 * Pure, and deliberately so. Nothing here reads the DOM, the clock, or the
 * device: given the stories on screen, the set of stories already expanded,
 * and how fresh the edition is, the same inputs always produce the same words.
 * That is what makes the copy table below reviewable as a table — the strings a
 * reader can ever see are enumerable in a test rather than reachable only
 * through a rendered component in some particular state.
 *
 * The product commitment this file exists to keep is constitution 1 and 3 with
 * PRD section 6.4: "Progress is descriptive, not judgmental." The counter
 * states a fact the reader could verify by counting the cards, the ending says
 * the edition is over, and neither congratulates, scores, nags, or offers
 * anything to read next. Section 3.2's list — streaks, badges, points, guilt
 * copy, countdown pressure — has no representative here, and a test sweeps
 * every string this module can produce for that vocabulary so that it stays
 * that way.
 */
import type { Story } from "@aaj-bas/schemas";
import type { EditionFreshness } from "../edition/edition-freshness";

export type EditionProgress = {
  readonly viewedCount: number;
  readonly total: number;
};

/**
 * How many of the stories on screen the reader has expanded, out of how many.
 *
 * `viewedCount` is the INTERSECTION of the rendered stories and the viewed set,
 * not `viewedStoryIds.size`. The stored set is keyed by edition date, not by
 * the stories actually rendered, and those two can legitimately differ: from
 * AB-204 a reader whose interests changed between visits has stored ids for
 * pool stories that this render no longer includes. `.size` would then print
 * "9 of 8 viewed", a number the reader cannot reconcile with anything in front
 * of them. Counting the intersection cannot exceed the denominator by
 * construction.
 *
 * `total` is `stories.length`, never a constant and never 10, even though PRD
 * section 5.1 specifies a ten-story edition. The denominator is a promise about
 * what is on screen: "3 of 10" over a list of eight asserts that two more
 * stories exist somewhere the reader cannot reach, which is both false and
 * exactly the kind of hidden backlog constitution 1 rules out. A short edition
 * — degraded generation, an archive edition from a different era of the
 * product — must count itself honestly.
 */
export function editionProgress(
  stories: readonly Story[],
  viewedStoryIds: ReadonlySet<string>,
): EditionProgress {
  let viewedCount = 0;
  for (const story of stories) {
    if (viewedStoryIds.has(story.id)) {
      viewedCount += 1;
    }
  }

  return { viewedCount, total: stories.length };
}

/** PRD section 6.4's header, verbatim: "6 of 10 viewed". */
export function progressText(progress: EditionProgress): string {
  return `${progress.viewedCount} of ${progress.total} viewed`;
}

/**
 * Whether the edition is over, by either of the two ways it can be.
 *
 * One definition, exported, because more than one thing has to agree about it:
 * `endingCopy` drops the end-edition control when it is true, and AB-204's
 * interest invitation appears on the same moment. Two copies of
 * `isComplete || hasEnded` would eventually disagree, and the reader would see
 * the disagreement as an invitation sitting under a control that is still
 * offering to end an edition already over.
 */
export function isEditionOver(
  progress: EditionProgress,
  hasEnded: boolean,
): boolean {
  return isEditionComplete(progress) || hasEnded;
}

/**
 * Every story on screen expanded.
 *
 * The `total > 0` guard is what stops an edition with no stories in it
 * announcing "That's today's edition." to a reader who was shown nothing. An
 * empty list is a failure to render an edition, not a completed one.
 */
function isEditionComplete(progress: EditionProgress): boolean {
  return progress.total > 0 && progress.viewedCount === progress.total;
}

/**
 * The words at the end of the edition.
 *
 * Three independent slots rather than one paragraph, because they appear and
 * disappear separately: the control is offered until the edition is over, the
 * message appears only once it is, and what comes next is a property of the
 * edition being read rather than of how much of it was read.
 */
export type EndingCopy = {
  /** The end-edition control's label; null once ended or fully read. */
  readonly endLabel: string | null;
  /** The completion message; null while the reader is still in progress. */
  readonly message: string | null;
  /** What follows this edition; null when there is no next edition to speak of. */
  readonly nextEdition: string | null;
};

/**
 * The complete copy table, as a pure function of freshness and progress.
 *
 * | freshness | endLabel                | fully read                  | ended early                                  | nextEdition                                            |
 * | --------- | ----------------------- | --------------------------- | -------------------------------------------- | ------------------------------------------------------ |
 * | current   | "End today's edition"   | "That's today's edition."   | "You read N of M. That can be enough for today." | "See you tomorrow."                                  |
 * | stale     | "End this edition"      | "That's the whole edition." | same                                          | "The next edition will appear here when it is published." |
 * | archived  | "End this edition"      | "That's the whole edition." | same                                          | null                                                   |
 *
 * Four rules hold the table together, and each one is a decision rather than a
 * formatting preference:
 *
 * - "today's" appears only for `current`. On a stale or archived edition it
 *   would be a false statement about which day the reader is looking at, which
 *   is the same failure section 26 forbids for presenting stale content as
 *   current.
 * - There is no clock, no time of day, and no countdown anywhere in this file.
 *   Publication in this repository is a human merge, not a scheduled job, so a
 *   stated hour would be a promise the pipeline does not keep; and a named hour
 *   to return is an appointment, which is the artificial urgency constitution 2
 *   and section 3.2 rule out. "See you tomorrow." commits to nothing and
 *   pressures nobody.
 * - Zero viewed is NOT special-cased: a reader who expanded nothing and ended
 *   reads "You read 0 of 8. That can be enough for today." A distinct message
 *   for a reader who read little would be the product commenting on how little
 *   they read, and PRD section 5.1 is explicit that a reader "may end early
 *   without being told they failed".
 * - The early message keeps PRD section 6.4's hedge verbatim. Both obvious
 *   "improvements" are worse: a bare "You read 3 of 8." is a naked score line
 *   whose only available reading is comparison against the whole, and "That is
 *   enough for today." asserts a fact about the reader's day that a news
 *   application has no standing to assert. "That can be enough" leaves the
 *   judgement where it belongs, with the reader.
 *
 * `nextEdition` depends on freshness alone; it is the caller's job to show it
 * beside `message`, which is the slot that marks the edition as over.
 */
export function endingCopy(
  freshness: EditionFreshness,
  progress: EditionProgress,
  hasEnded: boolean,
): EndingCopy {
  const isToday = freshness === "current";

  // Completion is still needed on its own below: it selects the message, and
  // `isOver` cannot, because a reader who ended early is over but not complete.
  const isComplete = isEditionComplete(progress);
  const isOver = isEditionOver(progress, hasEnded);

  return {
    endLabel: isOver
      ? null
      : isToday
        ? "End today's edition"
        : "End this edition",

    // Completion wins over ending early: a reader who expanded every story and
    // then pressed the control read the whole edition, and telling them "You
    // read 8 of 8" instead would be a strictly less accurate sentence.
    message: isComplete
      ? isToday
        ? "That's today's edition."
        : "That's the whole edition."
      : hasEnded
        ? `You read ${progress.viewedCount} of ${progress.total}. That can be enough for today.`
        : null,

    nextEdition: nextEditionText(freshness),
  };
}

function nextEditionText(freshness: EditionFreshness): string | null {
  switch (freshness) {
    case "current":
      return "See you tomorrow.";

    case "stale":
      // Deliberately unscheduled. The reader is told where it will appear, not
      // when, because nothing in this repository can honestly say when.
      return "The next edition will appear here when it is published.";

    case "archived":
      // Silence, not a line about tomorrow. The reader chose a past date from
      // the archive; "See you tomorrow." there reads as an invitation to come
      // back rather than as the end of what they asked for.
      return null;

    default: {
      const unreachable: never = freshness;
      return unreachable;
    }
  }
}
