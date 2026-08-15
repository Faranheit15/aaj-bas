/**
 * The interest picker: an invitation once, and a settings control after that.
 *
 * PRD section 7.1 asks for the invitation at the end of a reader's first
 * edition, and AB-204 asks for a way to change the answer later. Both are this
 * one block, in the same place, and the second is deliberately not a
 * `/settings` route: a route serves none of the acceptance criteria and it
 * needs an affordance the shell has tested away — there is no navigation
 * landmark, there are no footer links, and the ready page carries zero links by
 * assertion. ADR-0006 also records that no route may be reachable from the end
 * of an edition, and a preferences page reached from exactly there is the shape
 * that rule exists to keep out.
 *
 * Four states, and two of them render nothing:
 *
 * - `unknown` — the device's state can be neither read nor written. Asking
 *   would re-ask a reader who has already answered, and their new answer would
 *   be silently refused. Rendering nothing is section 26's honest answer.
 * - `unanswered` with the trigger not yet reached — nothing. The reader is
 *   mid-edition and has not been offered anything.
 * - `unanswered` with the trigger reached — the invitation.
 * - `answered`, INCLUDING an empty choice — the settings control. An empty
 *   array is an answer, which is why there is no dismissal flag anywhere in
 *   this slice: "No thanks" is stored as choosing nothing, and a reader who
 *   said it is never asked again.
 *
 * The invitation arrives silently. No `autoFocus`, no `scrollIntoView`, no
 * `role="status"`, no `aria-live`: it appears below the stories and the reader
 * meets it when they get there. Anything that announced it would make finishing
 * the edition trigger a prompt, which is the interruption the whole product is
 * arranged to avoid. If the reader cannot tell it arrived until they reach it,
 * it did not interrupt.
 *
 * Nothing here counts, congratulates, or promises more content. The copy says
 * what the boosts do and when they take effect, and stops.
 */

import { INTEREST_SLUGS, type InterestSlug } from "@aaj-bas/schemas";
import type { FormEvent, JSX } from "react";
import { useEffect, useId, useRef, useState } from "react";
import type { InterestsRead } from "../local-state/local-state-store";
import { TOPIC_LABELS } from "./story-labels";

/** PRD section 7.1: "up to two interest boosts". Stated once, in the legend. */
const INTEREST_LIMIT = 2;

const EXPLAINER =
  "Two of the ten stories in each edition follow topics you choose.";

/*
  Said before the reader chooses, not after they save. It is the one fact that
  makes the choice predictable — the edition in front of them will not rearrange
  itself — and a reader who learns it only from a confirmation has already been
  surprised once.
*/
const SCOPE =
  "Your choice applies to the next edition you open, not to this one.";

type InterestBoostsProps = {
  readonly read: InterestsRead;
  /**
   * Whether PRD section 7.1's trigger has been reached: two stories expanded,
   * or the end of the edition.
   *
   * Computed by the caller, which is the component that already knows what the
   * reader has read. Deriving it here would mean this block held its own view
   * of progress, and two views of progress eventually disagree.
   */
  readonly canInvite: boolean;
  readonly onChoose: (interests: readonly InterestSlug[]) => boolean;
};

export function InterestBoosts({
  read,
  canInvite,
  onChoose,
}: InterestBoostsProps): JSX.Element | null {
  /**
   * The selection being edited, or null when no form is on the page.
   *
   * Held here rather than in the fieldset so that Cancel is free: the draft is
   * seeded from the stored answer each time the panel opens, and closing it
   * throws the draft away without the stored answer ever having moved.
   */
  const [draft, setDraft] = useState<readonly InterestSlug[] | null>(null);
  const disclosureRef = useRef<HTMLButtonElement>(null);
  const formId = useId();

  const showsForm =
    read.status === "unanswered"
      ? canInvite
      : read.status === "answered" && draft !== null;

  /*
    Seeded with the current value, the idiom `EditionEnding` uses, so that focus
    moves on a CHANGE rather than on a first render that happens to be in one
    state or the other.
  */
  const hadForm = useRef(showsForm);

  useEffect(() => {
    if (hadForm.current === showsForm) {
      return;
    }
    hadForm.current = showsForm;

    /*
      One transition, in one direction: the form going away.

      It goes away because the reader pressed Save, "No thanks", or Cancel, and
      every one of those unmounts the button they just activated. Focus would
      drop to `<body>` and a keyboard reader would lose their place on the page
      entirely — WCAG 2.2 success criterion 2.4.3, the same failure AB-203
      repaired at the end of the edition. Focus moves to the disclosure that
      replaced the form, which is both the repair and the confirmation: the
      control now reads "Change interest boosts", collapsed, with the chosen
      topics named beside it. There is no "Saved!" message, and no live region
      to announce one.

      It does NOT move when the form APPEARS. That covers the invitation
      arriving, which must arrive silently, and it covers the reader opening the
      panel themselves — where focus belongs on the disclosure they just pressed
      and `aria-expanded` has already said what happened.
    */
    if (showsForm) {
      return;
    }
    disclosureRef.current?.focus();
  }, [showsForm]);

  if (read.status === "unknown") {
    return null;
  }
  if (read.status === "unanswered" && !canInvite) {
    return null;
  }

  const selection = draft ?? [];

  /*
    Read out into a const before the JSX rather than inside it. Narrowing a
    parameter and then relying on that narrowing inside an event handler is a
    fact about the compiler's flow analysis rather than about this component;
    one binding says the same thing without depending on it.
  */
  const chosen = read.status === "answered" ? read.interests : [];

  function toggleInterest(slug: InterestSlug, checked: boolean): void {
    setDraft((previous) => {
      const current = previous ?? [];

      // Rebuilt from `INTEREST_SLUGS` rather than appended to, so the draft is
      // always in the schema's own order: what the reader ticked is a set, and
      // the order they ticked it in is not part of their answer.
      return checked
        ? INTEREST_SLUGS.filter(
            (candidate) => candidate === slug || current.includes(candidate),
          )
        : current.filter((candidate) => candidate !== slug);
    });
  }

  function choose(interests: readonly InterestSlug[]): void {
    /*
      The boolean is deliberately unused. It reports whether the device kept
      the answer, and the store has already said so on the developer console;
      turning it into a reader-facing error would put a warning under an
      edition for a preference that affects a future one, which is alarm about
      something the reader can do nothing about. What the reader is told is
      what is true either way: this is what you chose, and it applies to the
      next edition you open.
    */
    onChoose(interests);
    setDraft(null);
  }

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    choose(selection);
  }

  /*
    A plain `<div>`, not `<section aria-labelledby>`. A named section is a
    `region` landmark, and the shell deliberately exposes only banner, main, and
    contentinfo — a fourth landmark would put "Interest boosts" in every screen
    reader's landmark menu, above the stories, as though it were a part of the
    product rather than a control at the end of one.

    The `h2` is a sibling of the story headlines, which are also `h2`s under the
    edition-date `h1`. This block is one more thing in the edition, at the same
    level as a story, not a subsection of the last one.
  */
  return (
    <div className="interest-boosts">
      <h2 className="interest-heading">Interest boosts</h2>

      {read.status === "unanswered" ? (
        <>
          <p className="interest-explainer">{EXPLAINER}</p>
          <p className="interest-scope">{SCOPE}</p>
          <form className="interest-form" onSubmit={submit}>
            <InterestChoices selection={selection} onToggle={toggleInterest} />
            <p className="edition-actions">
              <button type="submit" className="edition-action">
                Save interest boosts
              </button>
              {/*
                "No thanks", never "Not now". The product does not ask again —
                an empty choice is a stored answer — so "Not now" would be a
                promise to return that is not kept, and the reader would decline
                on the strength of it.
              */}
              <button
                type="button"
                className="edition-action"
                onClick={() => choose([])}
              >
                No thanks
              </button>
            </p>
          </form>
        </>
      ) : (
        <>
          <p className="interest-summary">{summaryLine(chosen)}</p>
          <p className="edition-actions">
            {/*
              `aria-controls` is set only while the panel exists, exactly as on
              `StoryCard`'s disclosure: an IDREF pointing at an unmounted
              element is worse than no IDREF, because assistive technology
              offers to jump to a dead end. `aria-expanded` is what announces
              the state, and it is present in both.
            */}
            <button
              type="button"
              className="edition-action"
              ref={disclosureRef}
              aria-expanded={draft !== null}
              aria-controls={draft === null ? undefined : formId}
              onClick={() => setDraft(draft === null ? chosen : null)}
            >
              Change interest boosts
            </button>
          </p>

          {draft === null ? null : (
            /*
              The explanation lives INSIDE the form here, where it sits outside
              it in the invitation. `aria-controls` names one element, so
              everything the disclosure reveals has to be within it — and a
              reader who chose "No thanks" months ago and has come back to
              change their mind needs the sentence that says what boosts are.
            */
            <form className="interest-form" id={formId} onSubmit={submit}>
              <p className="interest-explainer">{EXPLAINER}</p>
              <p className="interest-scope">{SCOPE}</p>
              <InterestChoices
                selection={selection}
                onToggle={toggleInterest}
              />
              <p className="edition-actions">
                <button type="submit" className="edition-action">
                  Save interest boosts
                </button>
                <button
                  type="button"
                  className="edition-action"
                  onClick={() => setDraft(null)}
                >
                  Cancel
                </button>
              </p>
            </form>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Six native checkboxes in a fieldset, and nothing cleverer.
 *
 * Not a listbox, and not `aria-pressed` toggles. Six independent binary choices
 * with a cap is the thing checkboxes are, so keyboard operation, the group
 * name, and every screen reader's own vocabulary for "checked, unchecked,
 * unavailable" come free — the platform primitive over the framework
 * abstraction (section 13). A custom widget would have to re-implement all
 * three and would get one of them wrong.
 *
 * The limit is stated once, in the legend, which is announced with each option
 * as its group name. Repeating "up to two" per option would say it six times to
 * a screen-reader user and read as nagging to everyone else.
 *
 * Iterates `INTEREST_SLUGS`, so a slug added in `packages/schemas` cannot be
 * silently left out of the picker, and `india` and `world` — which PRD section
 * 5.3 makes core coverage rather than something to opt into — can never appear
 * in it. The words are `TOPIC_LABELS`, the same map the story cards use, so the
 * picker and the edition cannot end up naming the same topic differently.
 */
function InterestChoices({
  selection,
  onToggle,
}: {
  readonly selection: readonly InterestSlug[];
  readonly onToggle: (slug: InterestSlug, checked: boolean) => void;
}): JSX.Element {
  const atLimit = selection.length >= INTEREST_LIMIT;

  return (
    <fieldset className="interest-choices">
      <legend>Choose up to two</legend>
      <ul className="interest-options">
        {INTEREST_SLUGS.map((slug) => {
          const chosen = selection.includes(slug);

          return (
            <li key={slug}>
              {/*
                The whole row is the label, so the target is the width of the
                column and clears 44px by height — the reader aims at the words
                rather than at a 13px box.

                `disabled` on the UNCHOSEN options at the limit, and never on a
                chosen one: a slot must always be freeable, so the control can
                never become a dead end, and the box that just received focus is
                never the one that goes away under it. The two rejected
                alternatives are worse in kind, not in degree. Dropping the
                oldest tick is an invisible destructive edit to a deliberate
                choice, and it would need the tick order the storage layer sorts
                away on purpose. Accepting a third and refusing it at Save is a
                scold for doing what the form allowed.
              */}
              <label className="interest-choice">
                <input
                  type="checkbox"
                  value={slug}
                  checked={chosen}
                  disabled={atLimit && !chosen}
                  onChange={(event) => onToggle(slug, event.target.checked)}
                />
                <span>{TOPIC_LABELS[slug]}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}

/**
 * What the reader chose, named back to them.
 *
 * "Chosen: none." rather than a hidden or absent line. A reader who declined is
 * entitled to see that the product recorded a decision, and to see the control
 * that changes it; an empty summary would leave them wondering whether the
 * answer took. No count, and no "0 of 2" — the topics are named or they are
 * not.
 */
function summaryLine(interests: readonly InterestSlug[]): string {
  if (interests.length === 0) {
    return "Chosen: none.";
  }

  return `Chosen: ${interests.map((slug) => TOPIC_LABELS[slug]).join(" and ")}.`;
}
