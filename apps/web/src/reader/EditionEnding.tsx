/**
 * The end of the edition: the closing words, and the one control that ends it.
 *
 * It renders copy and it moves focus once. Every string comes from
 * `endingCopy`, which is a pure table of freshness and progress, so nothing
 * here decides what the reader is told — this file decides only *when* each of
 * the three slots is on the page, and that turns out to be the part with the
 * product risk in it.
 *
 * Reads no clock. There is no time of day, no countdown, and no timer anywhere
 * below, because the end of an edition is exactly where artificial urgency
 * would be added if it were ever going to be (AGENTS.md section 3.2,
 * constitution 2).
 *
 * Ending is not a reward. Nothing is unlocked, counted across editions, or
 * animated: the control disappears, a sentence appears, and the stories stay
 * exactly where they were. A reader who ends and keeps reading is doing
 * something the product allows.
 */

import type { JSX } from "react";
import { useEffect, useRef } from "react";
import type { EditionFreshness } from "../edition/edition-freshness";
import type { EditionProgress } from "./edition-progress";
import { endingCopy } from "./edition-progress";

type EditionEndingProps = {
  readonly freshness: EditionFreshness;
  readonly progress: EditionProgress;
  readonly hasEnded: boolean;
  /** Ends this edition. One-way, and the only thing the control does. */
  readonly onEnd: () => void;
};

export function EditionEnding({
  freshness,
  progress,
  hasEnded,
  onEnd,
}: EditionEndingProps): JSX.Element {
  const { endLabel, message, nextEdition } = endingCopy(
    freshness,
    progress,
    hasEnded,
  );

  const endingRef = useRef<HTMLDivElement>(null);

  /*
    Seeded with the current value, the same idiom `ReaderShell` uses for route
    changes, so that focus moves on a *change* rather than on the first render
    that happens to be in the ended state.
  */
  const focusedEnded = useRef(hasEnded);

  useEffect(() => {
    /*
      Focus moves for exactly one transition: not-ended to ended. That is the
      press, and the asymmetry below is deliberate.

      It moves on the press because the press unmounts the button the reader
      just activated, which drops focus to `<body>` and loses a keyboard
      reader's place on the page entirely — WCAG 2.2 success criterion 2.4.3.
      Moving focus to the block that replaced the control both repairs that and
      reads the closing sentence once, without a live region: the message is
      the thing that arrived, and it is now where focus is.

      It does NOT move when an already-ended edition mounts. The reader
      reloaded or came back; nothing just happened, and the browser has already
      placed focus.

      It does NOT move when the reader expands the last card. Completion with
      no press is `message` appearing while `hasEnded` stays false, and
      announcing "That's today's edition." the instant the eighth card opens
      would be a completion chime — the most gamified thing this component
      could do — on top of yanking focus out of the story the reader opened to
      read. The reader finds the ending when they get to it.

      There is deliberately no `role="status"`, no `aria-live`, and no
      `autoFocus` anywhere in this file. A live region would announce the
      ending every time the copy changed, including on completion, which is the
      chime again by another route.
    */
    if (focusedEnded.current === hasEnded) {
      return;
    }
    focusedEnded.current = hasEnded;
    if (!hasEnded) {
      // Navigating from an ended edition to one the reader has not ended.
      // Nothing arrived, so nothing takes focus.
      return;
    }
    endingRef.current?.focus();
  }, [hasEnded]);

  return (
    // tabIndex -1 makes the block a focus target for the press above without
    // putting it in the tab order.
    <div className="edition-ending" tabIndex={-1} ref={endingRef}>
      {message && <p className="edition-ending-message">{message}</p>}

      {/*
        Gated on `message`, not on `nextEdition` alone. `endingCopy` derives
        `nextEdition` from freshness by itself, so it is a non-null string from
        the first render of today's edition onward — rendering it unconditionally
        would put "See you tomorrow." under a full, unread edition, which reads
        as the product telling a reader who has just arrived to leave. `message`
        is the slot that means the edition is over, so it is the slot that
        decides whether there is a "next" worth mentioning.
      */}
      {message && nextEdition && <p className="edition-next">{nextEdition}</p>}

      {endLabel && (
        <p className="edition-actions">
          <button className="edition-action" type="button" onClick={onEnd}>
            {endLabel}
          </button>
        </p>
      )}

      {/*
        Nothing follows. This is the end of the edition, and the list of things
        that must never be added here is the point of the slice: no next- or
        previous-edition link, no archive or date picker, no "related reading"
        or "you may also like", no install or notification prompt, no share
        control, no feedback survey, no streak, count of editions finished, or
        anything else that accumulates across days.

        AB-204's interest invitation is named explicitly because it is the one
        with a backlog item pointing at this spot: PRD section 7.1 puts it "at
        edition end", and it still needs its own argument for why an invitation
        here is not a continuation surface. Inheriting this slot is not that
        argument (sections 3.1 and 48, constitution 1).
      */}
    </div>
  );
}
