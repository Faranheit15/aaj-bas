import type { Story } from "@aaj-bas/schemas";
import { validEdition } from "@aaj-bas/test-fixtures";
import { describe, expect, it } from "vitest";
import type { EditionFreshness } from "../edition/edition-freshness";
import {
  type EditionProgress,
  type EndingCopy,
  editionProgress,
  endingCopy,
  isEditionOver,
  progressText,
} from "./edition-progress";

const FRESHNESS_VALUES = [
  "current",
  "stale",
  "archived",
] as const satisfies readonly EditionFreshness[];

/** The first `count` stories of the fixture edition, ids `story-0` upward. */
function stories(count: number): readonly Story[] {
  return validEdition().stories.slice(0, count);
}

function progress(viewedCount: number, total: number): EditionProgress {
  return { viewedCount, total };
}

describe("editionProgress", () => {
  it("counts only the stories that are both on the page and viewed", () => {
    /*
      The AB-204 guard. The stored viewed set is keyed by edition date, not by
      what this render put on screen, so a reader who changed their interests
      between visits has stored ids for pool stories that are no longer here.
      Counting `viewedStoryIds.size` would print "3 of 8" for two stories the
      reader can see plus one they cannot, and in the worst case a numerator
      larger than the denominator.
    */
    const viewed = new Set(["story-0", "story-1", "story-9"]);

    const result = editionProgress(stories(8), viewed);

    expect(result.viewedCount).toBe(2);
    expect(result.total).toBe(8);
    expect(progressText(result)).toBe("2 of 8 viewed");
  });

  it("never counts more than the stories on the page", () => {
    // The same property stated as the bound it protects: whatever the device
    // holds, the numerator cannot exceed the denominator.
    const viewed = new Set(validEdition().stories.map((story) => story.id));

    const result = editionProgress(stories(3), viewed);

    expect(result.viewedCount).toBe(3);
    expect(result.total).toBe(3);
  });

  it("counts nothing when the reader has expanded nothing", () => {
    const result = editionProgress(stories(8), new Set());

    expect(result).toEqual({ viewedCount: 0, total: 8 });
  });

  it("takes the denominator from the stories it was given, not a constant", () => {
    /*
      PRD section 5.1 specifies a ten-story edition, which is exactly why this
      is asserted: hardcoding 10 would be right for today's editions and would
      quietly claim, on a shorter one, that stories exist somewhere the reader
      cannot reach.
    */
    expect(editionProgress(stories(10), new Set()).total).toBe(10);
    expect(editionProgress(stories(8), new Set()).total).toBe(8);
    expect(editionProgress(stories(3), new Set()).total).toBe(3);
    expect(editionProgress([], new Set()).total).toBe(0);
  });
});

describe("progressText", () => {
  it("states the count in PRD section 6.4's wording", () => {
    expect(progressText(progress(6, 10))).toBe("6 of 10 viewed");
    expect(progressText(progress(0, 8))).toBe("0 of 8 viewed");
    expect(progressText(progress(8, 8))).toBe("8 of 8 viewed");
  });
});

describe("isEditionOver", () => {
  it("is true once every story on screen has been expanded", () => {
    expect(isEditionOver(progress(8, 8), false)).toBe(true);
  });

  it("is true once the reader has ended it, however little they read", () => {
    expect(isEditionOver(progress(3, 8), true)).toBe(true);
    expect(isEditionOver(progress(0, 8), true)).toBe(true);
  });

  it("is false while the reader is still reading", () => {
    expect(isEditionOver(progress(0, 8), false)).toBe(false);
    expect(isEditionOver(progress(7, 8), false)).toBe(false);
  });

  it("does not call an empty list a finished edition", () => {
    // The same guard `endingCopy` relies on: an edition that rendered nothing
    // has not been read to the end, it has failed to appear.
    expect(isEditionOver(progress(0, 0), false)).toBe(false);
    expect(isEditionOver(progress(0, 0), true)).toBe(true);
  });

  it("is the same predicate that withdraws the end-edition control", () => {
    /*
      The reason this is exported rather than left inline in `endingCopy`.
      AB-204's interest invitation appears at the end of the edition, which
      means two places now have to agree on when that is; a second copy of the
      expression would drift, and the drift would show as an invitation sitting
      under a control still offering to end an edition that is already over.
    */
    for (const freshness of FRESHNESS_VALUES) {
      for (const state of [
        progress(0, 0),
        progress(0, 8),
        progress(3, 8),
        progress(8, 8),
      ]) {
        for (const hasEnded of [false, true]) {
          expect(endingCopy(freshness, state, hasEnded).endLabel === null).toBe(
            isEditionOver(state, hasEnded),
          );
        }
      }
    }
  });
});

/**
 * The copy table, written out rather than computed.
 *
 * Restating the strings here is the point: a test that derived them from the
 * same expression the module uses would pass on any rewording, and the wording
 * is the product commitment. Every string a reader can see for these three
 * states appears literally below, so changing one is visible in a diff of this
 * file.
 */
const EXPECTED: Record<
  EditionFreshness,
  {
    readonly inProgress: EndingCopy;
    readonly complete: EndingCopy;
    readonly endedEarly: EndingCopy;
  }
> = {
  current: {
    inProgress: {
      endLabel: "End today's edition",
      message: null,
      nextEdition: "See you tomorrow.",
    },
    complete: {
      endLabel: null,
      message: "That's today's edition.",
      nextEdition: "See you tomorrow.",
    },
    endedEarly: {
      endLabel: null,
      message: "You read 3 of 8. That can be enough for today.",
      nextEdition: "See you tomorrow.",
    },
  },
  stale: {
    inProgress: {
      endLabel: "End this edition",
      message: null,
      nextEdition: "The next edition will appear here when it is published.",
    },
    complete: {
      endLabel: null,
      message: "That's the whole edition.",
      nextEdition: "The next edition will appear here when it is published.",
    },
    endedEarly: {
      endLabel: null,
      message: "You read 3 of 8. That can be enough for today.",
      nextEdition: "The next edition will appear here when it is published.",
    },
  },
  archived: {
    inProgress: {
      endLabel: "End this edition",
      message: null,
      nextEdition: null,
    },
    complete: {
      endLabel: null,
      message: "That's the whole edition.",
      nextEdition: null,
    },
    endedEarly: {
      endLabel: null,
      message: "You read 3 of 8. That can be enough for today.",
      nextEdition: null,
    },
  },
};

const IN_PROGRESS = progress(3, 8);
const COMPLETE = progress(8, 8);

describe("endingCopy", () => {
  for (const freshness of FRESHNESS_VALUES) {
    const expected = EXPECTED[freshness];

    describe(`on a ${freshness} edition`, () => {
      it("offers the end control and says nothing while in progress", () => {
        expect(endingCopy(freshness, IN_PROGRESS, false)).toEqual(
          expected.inProgress,
        );
      });

      it("reports the edition as whole when every story was expanded", () => {
        expect(endingCopy(freshness, COMPLETE, false)).toEqual(
          expected.complete,
        );
      });

      it("reports what was read when the reader ended early", () => {
        expect(endingCopy(freshness, IN_PROGRESS, true)).toEqual(
          expected.endedEarly,
        );
      });

      it("prefers the completion message when the reader ended a finished edition", () => {
        // A reader who expanded every story and then pressed the control read
        // the whole edition; "You read 8 of 8" would be strictly less accurate.
        expect(endingCopy(freshness, COMPLETE, true)).toEqual(
          expected.complete,
        );
      });

      it("drops the end control once the edition is over", () => {
        expect(endingCopy(freshness, COMPLETE, false).endLabel).toBeNull();
        expect(endingCopy(freshness, IN_PROGRESS, true).endLabel).toBeNull();
        expect(
          endingCopy(freshness, IN_PROGRESS, false).endLabel,
        ).not.toBeNull();
      });

      it("says nothing about completion while the reader is still reading", () => {
        expect(endingCopy(freshness, IN_PROGRESS, false).message).toBeNull();
        expect(endingCopy(freshness, progress(0, 8), false).message).toBeNull();
      });
    });
  }

  it("keeps the early message's hedge, and the reader's own count", () => {
    // PRD section 6.4 verbatim. A bare "You read 3 of 8." is a score line, and
    // "That is enough for today." asserts something about the reader's day the
    // product cannot know. The hedge is the copy that neither judges nor
    // instructs, and this assertion is what stops it drifting into either.
    expect(endingCopy("current", progress(6, 10), true).message).toBe(
      "You read 6 of 10. That can be enough for today.",
    );
  });

  it("tells a reader who expanded nothing exactly what it tells everyone else", () => {
    // PRD section 5.1: a reader "may end early without being told they
    // failed". A separate message for zero would be the product remarking on
    // how little was read.
    expect(endingCopy("current", progress(0, 8), true).message).toBe(
      "You read 0 of 8. That can be enough for today.",
    );
  });

  it("does not call an empty list a finished edition", () => {
    // Without the `total > 0` guard, an edition that rendered no stories would
    // congratulate the reader on completing it.
    const empty = endingCopy("current", progress(0, 0), false);

    expect(empty.message).toBeNull();
    expect(empty.endLabel).toBe("End today's edition");
  });

  it("says \"today's\" only on today's edition", () => {
    expect(endingCopy("current", COMPLETE, false).message).toContain("today's");

    for (const freshness of ["stale", "archived"] as const) {
      for (const copy of copiesFor(freshness)) {
        expect(copy).not.toContain("today's");
      }
    }
  });

  it("offers no next-edition line on an archived edition", () => {
    // The reader asked for a past date. "See you tomorrow." there is an
    // invitation to return rather than the end of what they asked for.
    for (const hasEnded of [false, true]) {
      for (const state of [IN_PROGRESS, COMPLETE]) {
        expect(endingCopy("archived", state, hasEnded).nextEdition).toBeNull();
      }
    }
  });

  it("names no time, hour, or deadline anywhere", () => {
    /*
      Publication here is a human merge, not a scheduled job: a stated hour
      would be a promise the pipeline does not keep. It would also be an
      appointment, which is the artificial urgency constitution 2 rules out.
    */
    for (const text of everyString()) {
      expect(text).not.toMatch(
        /\d\s?(am|pm)|\bat \d|o'clock|hour|minute|midnight|noon|tomorrow at|in \d+ (hours|minutes)/i,
      );
    }
  });
});

/** Every string this module can produce, across freshness and every state. */
function everyString(): readonly string[] {
  const texts: string[] = [];

  for (const freshness of FRESHNESS_VALUES) {
    texts.push(...copiesFor(freshness));
  }

  for (const state of [progress(0, 8), progress(3, 8), progress(10, 10)]) {
    texts.push(progressText(state));
  }

  return texts;
}

/** The non-null copy strings for one freshness, across every progress state. */
function copiesFor(freshness: EditionFreshness): readonly string[] {
  const states = [
    progress(0, 0),
    progress(0, 8),
    progress(3, 8),
    progress(8, 8),
  ];

  return states.flatMap((state) =>
    [false, true].flatMap((hasEnded) => {
      const copy = endingCopy(freshness, state, hasEnded);

      return [copy.endLabel, copy.message, copy.nextEdition].filter(
        (text): text is string => text !== null,
      );
    }),
  );
}

/**
 * Vocabulary that would turn a finite edition into a game, a queue, or a
 * reprimand.
 *
 * Section 3.2 and constitution 2 and 7 in one executable list. It is a coarse
 * instrument on purpose: it cannot tell whether copy is manipulative, but it
 * can tell that nobody quietly added "You're on a roll" or "2 stories
 * remaining" to a module whose entire output is three short strings.
 */
const FORBIDDEN = [
  "streak",
  "score",
  "badge",
  "xp",
  "reward",
  "unlock",
  "earn",
  "congrat",
  "on a roll",
  "great job",
  "keep it up",
  "come back",
  "don't miss",
  "only read",
  "you missed",
  "you failed",
  "unread",
  "remaining",
  "left to",
  "read next",
  "recommend",
  "you may also like",
];

describe("the words this module can put on screen", () => {
  it("produces real copy for every state, and never an empty string", () => {
    // The sweep below would pass vacuously over an empty list, which is what a
    // deleted or short-circuited module would produce.
    const texts = everyString();

    expect(texts.length).toBeGreaterThan(20);
    for (const text of texts) {
      expect(text.trim()).not.toBe("");
    }
  });

  it("contains no engagement, guilt, or continuation vocabulary", () => {
    for (const text of everyString()) {
      const lowered = text.toLowerCase();
      for (const word of FORBIDDEN) {
        expect(lowered).not.toContain(word);
      }
    }
  });
});
