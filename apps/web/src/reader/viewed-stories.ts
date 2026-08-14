/**
 * Which stories the reader has expanded, for this edition, in memory only.
 *
 * This deliberately does not touch localStorage or sessionStorage. AB-301 owns
 * persisted local state — the versioned adapter, the safe read and write, the
 * migration interface and corruption recovery — and section 17 requires all of
 * that for anything that survives a reload. Writing an unversioned key here
 * would not be a head start on AB-301; it would invent a legacy format AB-301
 * then has to migrate away from, on readers' devices, before it has written a
 * line. Viewed state is therefore lost on reload until AB-301 lands, which is
 * an honest gap rather than a half-built one.
 *
 * `editionDate` is in the public type from the first commit, and switching it
 * empties the set, so one edition's viewed stories can never be read as
 * another's. It is also what makes this a real seam: AB-301 replaces the body
 * of this hook without changing its signature or any caller.
 */
import { useCallback, useState } from "react";

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
    noneViewed(editionDate),
  );

  // Derived during render rather than reset in an effect, per section 14: an
  // effect would let one render show the previous edition's viewed set under
  // the new date. Assigning the same value back is React's documented way to
  // adjust state when a prop changes, and it re-renders before committing
  // anything to the DOM.
  const viewed =
    stored.editionDate === editionDate ? stored : noneViewed(editionDate);
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
    },
    [editionDate],
  );

  return { viewed, markViewed };
}

function noneViewed(editionDate: string): ViewedStories {
  return { editionDate, storyIds: new Set<string>() };
}
