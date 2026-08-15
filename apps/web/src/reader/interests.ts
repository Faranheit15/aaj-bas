/**
 * The interests the reader has chosen, and the ones this edition was built on.
 *
 * Two hooks that deliberately do not share a value. `useInterests` is the
 * reader's answer as it stands right now — what the picker shows and what the
 * picker changes. `useInterestSnapshot` is the answer that was in force when
 * the edition on screen was composed, and it stays put for as long as the
 * reader is on that edition.
 *
 * Neither names a storage API (section 15). This file knows two verbs, the same
 * shape as `useViewedStories` and `useEditionEnded`: what was chosen, and please
 * remember this.
 *
 * There is no `editionDate` parameter on `useInterests`, and that is the
 * difference from its two siblings rather than an oversight. Their state is
 * keyed BY edition, so both re-derive during render when the date changes;
 * interests are one answer that outlives every edition, so repeating that block
 * here would be cargo cult — it would re-read the device on every navigation to
 * arrive at the value it already held.
 *
 * The read is synchronous — `localStorage.getItem` is synchronous by
 * specification — so the lazy `useState` initialiser below makes the FIRST
 * render already correct. There is no loading state to model and section 26's
 * loading case does not apply, because there is no render in which the answer
 * is wrong.
 *
 * That matters more here than it did for AB-203's counter, and it is worth
 * being precise about why. A wrong first render of the viewed count is a number
 * that settles. A wrong first render of the interests changes WHICH STORIES ARE
 * ON THE PAGE: an effect-loaded read would paint eight stories and then ten —
 * a content shift and a layout shift under the reader's thumb, in a list they
 * have already started reading — and on the way it would flash the invitation
 * at a reader who answered it weeks ago.
 */

import type { InterestSlug } from "@aaj-bas/schemas";
import { useCallback, useState } from "react";
import {
  type InterestsRead,
  readInterests,
  rememberInterests,
} from "../local-state/local-state-store";

/**
 * The whole surface: the answer, and the one way to change it.
 *
 * `read` is the store's three-way answer rather than a plain array, because the
 * difference between "this device has never been asked" and "this reader chose
 * nothing" is the difference between showing the invitation and never showing
 * it again. Flattening the two to `[]` here would put a dismissal flag back
 * into the product by the side door.
 */
export type InterestsStore = {
  readonly read: InterestsRead;
  /**
   * Records the reader's answer, and reports whether the device took it.
   *
   * A boolean, where `rememberViewed` and `rememberEnded` deliberately return
   * nothing. Those two echo something already true on the screen — the card is
   * open, the edition is over — so a refused write costs the reader nothing
   * they can see. An interest choice changes nothing in front of the reader at
   * all: its only effect is on the next edition they open, which is precisely
   * what a refused write throws away. Returning void would let every caller
   * assume it landed (section 37).
   */
  readonly chooseInterests: (interests: readonly InterestSlug[]) => boolean;
};

export function useInterests(): InterestsStore {
  const [read, setRead] = useState<InterestsRead>(() => readInterests());

  const chooseInterests = useCallback(
    (interests: readonly InterestSlug[]): boolean => {
      const chosen = canonicalInterests(interests);

      setRead((previous) => {
        // Idempotent, and returning the identical object means saving the same
        // selection twice does not re-render the edition around the picker.
        if (
          previous.status === "answered" &&
          sameChoice(previous.interests, chosen)
        ) {
          return previous;
        }

        return { status: "answered", interests: chosen };
      });

      /*
        In the handler body, deliberately outside the updater above. React
        double-invokes state updaters and lazy initialisers to surface impure
        ones, and does not double-invoke event handlers, so a write placed
        inside the updater would run twice per choice in development and in
        StrictMode. The updater stays a pure function of its argument.

        The state moves whether or not the write lands. A reader who pressed
        Save has answered, and a device that refuses to remember it does not
        get to turn that back into a question — re-showing the invitation to
        someone who just answered it is the one thing the store's three-way
        read exists to prevent. What the returned boolean says is narrower and
        true: whether the answer survives the next load.
      */
      return rememberInterests(chosen);
    },
    [],
  );

  return { read, chooseInterests };
}

/**
 * The interests this edition was composed with, held still while it is read.
 *
 * A deliberate departure from section 14's "derive during render", and the
 * departure IS the feature: this must not be a function of the current stored
 * answer, because the reader can change that answer from the bottom of the very
 * edition it would recompose.
 *
 * What deriving it live would do, in order: the story list changes under a
 * reader who has already read most of it, two stories they never saw appear in
 * the middle of it, the counter above it drops from "8 of 8 viewed" back to
 * "6 of 10 viewed", and the closing message un-says that the edition is over.
 * That is "2 more stories unlocked" delivered as a mechanic — a reward paid out
 * for answering a question (section 3.2) — and it arrives by rewriting what the
 * reader was in the middle of.
 *
 * So the answer is captured once and re-read only when `editionDate` changes,
 * using the re-derive-during-render idiom from `viewed-stories.ts`. The next
 * edition the reader opens is composed with the new choice, which is exactly
 * what the picker's own copy promises them.
 */
export function useInterestSnapshot(
  editionDate: string,
): readonly InterestSlug[] {
  const [snapshot, setSnapshot] = useState<InterestSnapshot>(() =>
    storedSnapshot(editionDate),
  );

  // Assigning the same value back is React's documented way to adjust state
  // when a prop changes, and it re-renders before committing anything to the
  // DOM. The read is synchronous, so the new date's snapshot is available in
  // time to be the value this render uses.
  const current =
    snapshot.editionDate === editionDate
      ? snapshot
      : storedSnapshot(editionDate);
  if (snapshot !== current) {
    setSnapshot(current);
  }

  return current.interests;
}

/**
 * The captured answer paired with the edition it was captured for.
 *
 * The date travels with the interests inside state rather than in a ref, for
 * the same reason it does in `viewed-stories.ts`: it makes "these are the
 * interests of THAT edition" a fact the value carries, so no render can read
 * one edition's composition as another's.
 */
type InterestSnapshot = {
  readonly editionDate: string;
  readonly interests: readonly InterestSlug[];
};

function storedSnapshot(editionDate: string): InterestSnapshot {
  const read = readInterests();

  // A device that was never asked, and a device that cannot be read at all,
  // compose the same edition: the eight core stories and nothing added. The
  // distinction between them matters to the picker, not to the composition.
  return {
    editionDate,
    interests: read.status === "answered" ? read.interests : [],
  };
}

/**
 * The selection sorted and de-duplicated, exactly as the device will keep it.
 *
 * Order here is not cosmetic, and this deliberately matches `local-state.ts`'s
 * `canonicalInterests` rather than picking an order of its own. Two reasons,
 * and the second is the one that would show:
 *
 * - Tick order is a record of how the reader used the control rather than of
 *   what they chose. Discarding it is what lets the same two topics chosen in
 *   the other order be recognised as the same answer by the comparison above,
 *   so re-saving an unchanged selection does not re-render the edition.
 *
 * - Whatever this holds in memory is what the reader is shown until they
 *   reload, and what the device holds is what they are shown afterwards. A
 *   different order here would rewrite "Chosen: Technology & AI and Sports."
 *   into "Chosen: Sports and Technology & AI." on the next visit, for a reader
 *   who changed nothing. The tests assert the two agree rather than trusting
 *   that they do, so a change to either order fails here.
 *
 * Sorted rather than filtered through `INTEREST_SLUGS`, which would be the
 * other obvious canonical order, purely because that is the one the storage
 * layer already chose.
 */
function canonicalInterests(
  interests: readonly InterestSlug[],
): readonly InterestSlug[] {
  return [...new Set(interests)].sort();
}

function sameChoice(
  left: readonly InterestSlug[],
  right: readonly InterestSlug[],
): boolean {
  return (
    left.length === right.length && left.every((slug, at) => slug === right[at])
  );
}
