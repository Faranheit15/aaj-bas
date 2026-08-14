/**
 * Whether the reader has ended this edition, kept on the device.
 *
 * The sibling of `useViewedStories`, and deliberately the same shape: one
 * question and one verb, keyed by edition date, with the storage API named
 * nowhere above `local-state/` (section 15). Ending is a fact about one
 * edition, so ending today's says nothing about yesterday's and nothing about
 * tomorrow's — there is no cross-edition state here to accumulate into a
 * streak, a count of editions finished, or anything else section 3.2 rules
 * out.
 *
 * Ending is one-way within an edition and carries no reward: it removes the
 * end-edition control and shows the completion message (see
 * `edition-progress.ts`), and that is all it does. It never hides the stories,
 * locks the page, or leads anywhere. A reader who ends and then keeps reading
 * is doing something the product allows.
 *
 * Browsing writes nothing. Opening an edition only reads; the first byte lands
 * on the device when the reader presses the control.
 *
 * The read is synchronous, so the lazy `useState` initialiser below makes the
 * FIRST render already correct. That is what AB-203's "state persists on
 * reload" means at this level: not that the ended state arrives eventually,
 * but that there is no render in which a reader who ended yesterday's session
 * is shown the end-edition control again before it disappears. No loading state
 * is modelled because none exists (section 26).
 */
import { useCallback, useState } from "react";
import {
  readEditionEnded,
  rememberEnded,
} from "../local-state/local-state-store";

/**
 * The whole surface: the state, and the one way to change it.
 *
 * There is no way to un-end an edition. Nothing in the product offers that, and
 * an exported function with no caller is API invented for an unspecified
 * milestone (sections 13 and 48).
 */
export type EditionEndedStore = {
  readonly hasEnded: boolean;
  readonly endEdition: () => void;
};

export function useEditionEnded(editionDate: string): EditionEndedStore {
  const [stored, setStored] = useState<EndedEdition>(() =>
    storedEnded(editionDate),
  );

  // Derived during render rather than loaded in an effect, per section 14: an
  // effect would let one render show the previous edition's ended state under
  // the new date — an archive edition the reader has never opened appearing
  // already finished. Assigning the same value back is React's documented way
  // to adjust state when a prop changes, and it re-renders before committing
  // anything to the DOM. The read is synchronous, so the new date's stored
  // value is available in time to be the value this render uses.
  const ended =
    stored.editionDate === editionDate ? stored : storedEnded(editionDate);
  if (stored !== ended) {
    setStored(ended);
  }

  const endEdition = useCallback(() => {
    setStored((previous) => {
      // Idempotent, and returning the identical object means a second press
      // does not re-render the edition.
      if (previous.editionDate === editionDate && previous.hasEnded) {
        return previous;
      }

      return { editionDate, hasEnded: true };
    });

    /*
      In the handler body, deliberately outside the updater above. React
      double-invokes state updaters and lazy initialisers to surface impure
      ones, and does not double-invoke event handlers, so a write placed inside
      the updater would run twice per press in development and in StrictMode.
      The updater stays a pure function of its argument.

      The result is deliberately unused, and `rememberEnded` deliberately
      returns nothing. Persistence here is an echo of React state, never a
      precondition for it: the edition has already ended on screen by the time
      this runs, and it stays ended whether or not the device accepts the
      write. There is therefore no path along which a refused write becomes a
      rendering decision, which is what keeps a reader in private browsing on
      the same edition as everyone else.
    */
    rememberEnded(editionDate);
  }, [editionDate]);

  return { hasEnded: ended.hasEnded, endEdition };
}

/**
 * The stored flag paired with the edition it belongs to.
 *
 * The date travels with the flag inside state rather than being compared
 * against a ref, so that one edition's ended state can never be read as
 * another's: every read and every write is keyed by it, and changing the date
 * re-reads rather than carrying anything across.
 */
type EndedEdition = {
  readonly editionDate: string;
  readonly hasEnded: boolean;
};

/** This edition's stored flag, or false when the device has nothing. */
function storedEnded(editionDate: string): EndedEdition {
  return { editionDate, hasEnded: readEditionEnded(editionDate) };
}
