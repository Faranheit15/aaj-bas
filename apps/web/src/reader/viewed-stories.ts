/**
 * Which stories the reader has expanded, for this edition, kept on the device.
 *
 * The rules for the stored document — one versioned key, validated on every
 * read, never written over a version this build cannot read — are ADR-0007's,
 * and they live in `local-state/`. This hook knows only two verbs: which
 * stories were already expanded in this edition, and please remember this one
 * (section 15). It never names a storage API.
 *
 * Two properties are worth knowing here, because both are easy to lose in a
 * later edit:
 *
 * - Browsing writes nothing. Opening an edition only reads; the first byte
 *   lands on the device when the reader expands their first story.
 * - One edition's set can never be read as another's. `editionDate` is in the
 *   public type, every read and every write is keyed by it, and changing it
 *   re-reads rather than carrying anything across.
 *
 * The read is synchronous, which is why AB-301 could replace the body of this
 * hook without changing its signature or any caller: `localStorage.getItem` is
 * synchronous by specification, so the lazy `useState` initialiser below makes
 * the FIRST render already correct. There is no loading state to model and
 * section 26 does not apply — AB-203's "6 of 10" counter cannot flash a wrong
 * number and settle, because there is no render in which the number is wrong.
 */
import { useCallback, useState } from "react";
import {
  readViewedStoryIds,
  rememberViewed,
} from "../local-state/local-state-store";

export type ViewedStories = {
  readonly editionDate: string;
  readonly storyIds: ReadonlySet<string>;
};

/**
 * The whole surface: the state, and the one way to change it.
 *
 * There is no `isViewed` accessor. Nothing in the product asks whether a single
 * story was viewed, and an exported function with no caller is API invented for
 * a milestone that has not been specified (sections 13 and 48). AB-203 reads
 * `viewed` directly for its "6 of 10" summary, and adds whatever accessor it
 * actually turns out to need rather than inheriting this slice's guess at one.
 */
export type ViewedStoriesStore = {
  readonly viewed: ViewedStories;
  readonly markViewed: (storyId: string) => void;
};

export function useViewedStories(editionDate: string): ViewedStoriesStore {
  const [stored, setStored] = useState<ViewedStories>(() =>
    storedViewed(editionDate),
  );

  // Derived during render rather than loaded in an effect, per section 14: an
  // effect would let one render show the previous edition's viewed set under
  // the new date. Assigning the same value back is React's documented way to
  // adjust state when a prop changes, and it re-renders before committing
  // anything to the DOM. The read is a plain synchronous read, so the new
  // date's stored set is available in time to be the value this render uses.
  const viewed =
    stored.editionDate === editionDate ? stored : storedViewed(editionDate);
  if (stored !== viewed) {
    setStored(viewed);
  }

  const markViewed = useCallback(
    (storyId: string) => {
      setStored((previous) => {
        const sameEdition = previous.editionDate === editionDate;
        // Idempotent, and returning the identical object means a second mark
        // does not re-render the edition.
        if (sameEdition && previous.storyIds.has(storyId)) {
          return previous;
        }

        const storyIds = new Set(sameEdition ? previous.storyIds : []);
        storyIds.add(storyId);

        return { editionDate, storyIds };
      });

      /*
        In the handler body, deliberately outside the updater above. React
        double-invokes state updaters and lazy initialisers to surface impure
        ones, and does not double-invoke event handlers, so a write placed
        inside the updater would run twice per mark in development and in
        StrictMode. The updater stays a pure function of its argument.

        Unconditional, rather than skipped when the id is already in the set.
        The gate would need `viewed` in the dependency array, which changes
        `markViewed`'s identity on every render and regresses `StoryCard`'s
        render behaviour, to save at most nine idempotent writes per edition.

        The result is deliberately unused, and `rememberViewed` deliberately
        returns nothing. Persistence here is an echo of React state, never a
        precondition for it: the story is already expanded on screen, and it
        stays expanded whether or not the device accepts the write. There is
        therefore no path along which a refused write becomes a rendering
        decision, which is what keeps a reader in private browsing on the same
        edition as everyone else.
      */
      rememberViewed(editionDate, storyId);
    },
    [editionDate],
  );

  return { viewed, markViewed };
}

/** This edition's stored set, or an empty one when the device has nothing. */
function storedViewed(editionDate: string): ViewedStories {
  return { editionDate, storyIds: readViewedStoryIds(editionDate) };
}
