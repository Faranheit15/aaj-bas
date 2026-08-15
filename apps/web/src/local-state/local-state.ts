/**
 * What this reader keeps on the device, and the pure rules for reading it and
 * changing it.
 *
 * There is no DOM here, no clock, and no storage: every function below is a
 * function of its arguments alone, so the rules that decide whether a stored
 * document may be trusted or overwritten can be tested without a browser and
 * cannot behave differently on the machine that happens to run them. The
 * localStorage access lives in `device-storage.ts` and the key, the logging and
 * the read-modify-write live in `local-state-store.ts`.
 *
 * Section 17 requires persisted local state to be versioned, validated, safely
 * parsed, recoverable from corruption and migratable, and this file is where
 * those four properties are decided.
 *
 * The document deliberately holds only which stories were expanded, per
 * edition, which editions the reader ended, which interests the reader
 * explicitly chose, and which theme they chose to read in. It records no
 * timestamps and no ordering, so it cannot become a reading-behaviour record
 * (section 23), and it never leaves the device (section 17).
 *
 * Interests are the first field here that a reader stated rather than one this
 * code observed, which makes them the most sensitive thing in the document even
 * though they are the smallest. Section 3.3 permits them for exactly that
 * reason — a boost the reader selected is not a behavioural profile — and the
 * permission ends where the statement does: nothing may infer an interest from
 * what was read.
 *
 * The theme is stated too, and is the one field here that is not about the news
 * at all: it says how the reader wants a page to look, never what they read or
 * when. It is kept in the same document rather than under a key of its own for
 * ADR-0007's reason — a second key would need its own version, its own
 * corruption handling, and its own eviction — and it is resolved into an
 * appearance in `theme/document-theme.ts`, which is the only module that
 * touches the document element.
 */

import {
  editionDateSchema,
  type InterestSlug,
  identifierSchema,
  interestSlugSchema,
} from "@aaj-bas/schemas";
import { z } from "zod";

/** The version this build writes, and the only one it can read. */
export const LOCAL_STATE_VERSION = 1;

/**
 * How many editions each field of the document remembers.
 *
 * A month of archive browsing is remembered and everything older is dropped, so
 * the document has a bounded size no matter how long a device is used. It is a
 * storage bound, not a product feature: nothing shows the reader a history.
 *
 * One bound, applied per field rather than across them, because the fields are
 * evicted independently and a shared budget would let a reader's ended editions
 * push out their viewed sets. Every field that accumulates per edition takes
 * it: an unbounded one would be the single thing in this document that grows
 * without limit, which is exactly what ADR-0007 promised it would not have.
 */
export const MAX_REMEMBERED_EDITIONS = 30;

/**
 * How many interest boosts a reader may hold at once (PRD section 5.3).
 *
 * A product parameter, and deliberately NOT a schema constraint. A `.max(2)` on
 * the field below would quietly convert it into a compatibility parameter: if a
 * later build allowed three, this build would read that reader's document as
 * corrupt-and-replaceable and destroy every viewed set in it over a preference
 * it merely disagreed with. The cap is applied where the choice is made instead
 * — refused on the way in by the store, sliced on the way out by
 * `canonicalInterests`.
 *
 * This field takes no eviction rule, unlike the bound above, and the difference
 * is the growth mode rather than an omission. Nothing appends to it and it is
 * not keyed per edition: `withInterests` replaces the array wholesale, so there
 * is no oldest entry to drop and no way for it to grow without limit.
 */
export const MAX_INTERESTS = 2;

/**
 * The three appearances a reader may choose between.
 *
 * "system" is one of the three rather than the absence of an answer, and it is
 * the one that is never resolved here: it means "follow whatever this device
 * says", which the stylesheet answers live through a media query. Nothing in
 * this repository computes what the operating system currently prefers, so
 * there is no moment at which this build's idea of the reader's system
 * appearance can be stale.
 *
 * There is deliberately no `hasChosenTheme` beside these, where `interests` has
 * `hasChosenInterests`. That presence bit exists because an invitation must
 * never re-appear in front of a reader who answered it; the theme control is on
 * screen whenever the reader looks for it, so there is no question left for a
 * stored fact to answer. What such a field would actually record is whether
 * this reader has opened the settings, which is a fact about how they use the
 * product that nothing asks for (section 23).
 */
export const THEMES = ["light", "dark", "system"] as const;

export type Theme = (typeof THEMES)[number];

/**
 * What a device with no usable answer reads as.
 *
 * "system" rather than "light", so that a reader whose document this build
 * cannot make sense of still gets the appearance their device already asks for.
 * A "light" default would show a reader in dark mode a white page and call it
 * the absence of a preference, when their preference was stated to their
 * operating system and is sitting there to be honoured.
 */
export const DEFAULT_THEME: Theme = "system";

/**
 * Flat `schemaVersion`, matching the published-content contracts.
 *
 * `looseObject` rather than `object` on purpose: unknown top-level keys are
 * preserved rather than stripped. A reader who has been served this build from
 * a stale CDN edge after a newer build wrote a field this one has never heard
 * of must hand that field back unchanged, or an older deploy quietly deletes a
 * newer slice's state. The keys this file owns are still validated exactly.
 *
 * The edition date and the story id are imported rather than restated (section
 * 16). That also buys the calendar check for free: a key of "2026-02-30" fails
 * here without this file knowing anything about February.
 */
export const localStateV1Schema = z.looseObject({
  schemaVersion: z.literal(1),
  viewedByEdition: z.record(editionDateSchema, z.array(identifierSchema)),
  /*
    Editions the reader ENDED, by pressing the end control. Not "editions the
    reader finished": finishing is derived from the viewed set at render time
    and writes nothing, so an edition every story of which was expanded is
    absent here unless the reader also chose to end it.

    That distinction is the whole value of the field, and it is written down
    because the next reader of it will not have this slice in front of them.
    PRD section 7.1 wants an install prompt after three ended-or-completed
    editions; a slice implementing that has to combine this field with a
    derived completion count, and must argue its own semantics rather than
    inherit a field whose name it guessed the meaning of.

    OPTIONAL, and `schemaVersion` stays 1. ADR-0007 settles this: an additive
    optional field does not bump the version, and names this exact field as the
    case it was settled for. Required would mean every document already on a
    reader's device fails validation, reads as `replaceable`, and has its
    viewed set destroyed by the next write — a field that records one boolean
    per edition would have cost readers a month of state to add.
  */
  endedEditions: z.array(editionDateSchema).optional(),
  /*
    The interest boosts the reader chose, from the published slug vocabulary.

    ABSENT and EMPTY are DIFFERENT ANSWERS, and the invitation depends on the
    difference: absent means the reader has never been asked, `[]` means they
    were asked and chose none. Collapsing the two re-offers the invitation on
    every load to a reader who already declined it, which is the nagging
    section 3.2 rules out. So `withInterests` writes the key even for an empty
    choice, `hasChosenInterests` tests the key's presence rather than the
    array's length, and `EMPTY_LOCAL_STATE` must never gain `interests: []` —
    that would tell every device its reader answered an invitation they were
    never shown.

    OPTIONAL, and `schemaVersion` stays 1, for the reason `endedEditions`
    gives above and that ADR-0007 settles: required would invalidate every
    document already on a reader's device.

    `identifierSchema`, NOT `interestSlugSchema`, and the leniency is the
    decision this field turns on. Strictness is right where the vocabulary is
    fixed by nature: a calendar date is not a product decision, so
    `editionDateSchema` can reject "2026-02-30" and be certain it is wrong.
    Leniency is right where the vocabulary is a product decision the product
    has already said it may change — `slugs.ts` calls renaming a slug "a
    content migration across the archive", and nothing migrates a device.
    Validated strictly here, a later slice that added, removed or renamed one
    interest would make every document holding the old slug `replaceable`, and
    the next write would take a month of viewed sets with it, over a word.

    An unrecognised slug is therefore filtered at the ACCESSOR and never by a
    `.transform` here. A transform would strip it on every read-modify-write,
    so a reader served this bundle from a stale edge would have the preference
    their newer bundle just wrote silently deleted by the next story they
    expanded. `withViewedStory` and `withEndedEdition` spread `...state`, so
    the stored array survives byte-identically; keep it that way.

    The leniency is bounded by SHAPE, not abandoned: an entry that is not a
    well-formed identifier, or a field that is not an array, still fails, so a
    document that could not have been written by any build of this application
    is still recognised as corrupt.
  */
  interests: z.array(identifierSchema).optional(),
  /*
    The appearance the reader chose.

    OPTIONAL, and `schemaVersion` stays 1, for the reason `endedEditions` and
    `interests` give above and that ADR-0007 settles: required would invalidate
    every document already on a reader's device.

    `z.string()`, NOT `z.enum(THEMES)`, and the criterion is the one ADR-0008
    wrote down for `interests`: strictness is right where the vocabulary is
    fixed by nature, leniency where it is a product decision the product may
    change. A calendar date is not ours to change, so `editionDateSchema` can
    reject "2026-02-30" and be certain. `light | dark | system` is entirely
    ours, and a fourth value — a high-contrast theme, sepia — is a plausible
    thing for a later slice to add.

    Validated strictly here, that fourth value would be a state wipe. A reader
    picks it, a stale CDN edge or AB-206's service worker serves an older
    bundle, and that bundle sees `schemaVersion: 1` — so the never-clobber rule
    does NOT engage — fails validation, reads the whole document as
    `replaceable`, and destroys a month of viewed sets, the ended editions and
    the interests on the next story the reader expands. Over a colour.

    The leniency is bounded by SHAPE rather than abandoned, exactly as for
    `interests`: `theme: 42`, `null`, or an object is something no build of this
    application could have written, so it is still corruption and still makes
    the document replaceable. Only an unrecognised STRING is tolerated.

    Resolved at the ACCESSOR (`canonicalTheme`) and never by a `.transform` or a
    `.catch` here. Either would rewrite the field on every read-modify-write, so
    an older bundle would delete the answer a newer bundle had just written —
    silently, on the next card the reader opened.
  */
  theme: z.string().optional(),
});

export type LocalStateV1 = z.infer<typeof localStateV1Schema>;

export const EMPTY_LOCAL_STATE: LocalStateV1 = {
  schemaVersion: LOCAL_STATE_VERSION,
  viewedByEdition: {},
};

/**
 * The three answers a stored string can give.
 *
 * They are three because they lead to three different actions, and collapsing
 * any two of them either loses a reader's state or destroys someone else's
 * (section 37).
 */
export type StoredStateRead =
  /** A document this build understands. */
  | { readonly kind: "usable"; readonly state: LocalStateV1 }
  /** Absent, corrupt, or ours and broken: safe to overwrite. */
  | { readonly kind: "replaceable" }
  /** A version this build does not understand: read nothing, write nothing. */
  | { readonly kind: "foreign" };

/**
 * Probes the version before asserting anything else about the document.
 *
 * Deliberately tiny: it must succeed on a document whose every other field is
 * unrecognisable, because the version is what decides whether the rest of the
 * document is this build's business at all.
 */
const versionProbeSchema = z.object({ schemaVersion: z.number() });

/**
 * Decides what a stored string is.
 *
 * THE VERSION RULE, which is the whole point of this module:
 *
 * - a document at the CURRENT version that fails validation is OURS and broken,
 *   so it is `replaceable` — this build wrote it, this build can fix it;
 * - a document declaring a version this build does NOT know is SOMEONE ELSE'S
 *   and intact, so it is `foreign` — read nothing from it and NEVER overwrite
 *   it.
 *
 * The second half is the one that is easy to leave out and expensive to get
 * wrong. A reader served a stale bundle from a CDN edge, or later from a
 * service worker that has not updated yet, is running an OLD build against a
 * NEWER document. If that build treated the unrecognised document as corrupt
 * and replaced it, it would silently destroy the state the reader's newer
 * bundle wrote, and the reader would have no way to tell that it happened. The
 * cost of refusing to write instead is that this session is not remembered,
 * which the next load of the newer bundle repairs by itself.
 *
 * A document with NO readable `schemaVersion` is corrupt, not foreign: no build
 * of this application has ever written an unversioned document — the in-memory
 * hook that preceded this slice asserts in its own tests that it wrote no key
 * at all — so an unversioned value under our key can only be corruption or a
 * collision with something that had no business using the key.
 */
export function readLocalState(raw: string | null): StoredStateRead {
  if (raw === null) {
    // A fresh device. Not a failure, and nothing to log about it.
    return { kind: "replaceable" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { kind: "replaceable" };
  }

  // Narrowing, not a decision. `"3"`, `"null"`, `'"x"'` and `"[]"` are all
  // valid JSON that is not a document, and the version probe below already
  // answers `replaceable` for every one of them — deleting these four lines
  // changes no test result. What they do is give `toCurrentVersion` the
  // `object` its signature asks for, so removing them fails `typecheck` rather
  // than forcing a cast at the call site.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { kind: "replaceable" };
  }

  const probed = versionProbeSchema.safeParse(parsed);
  if (!probed.success) {
    return { kind: "replaceable" };
  }

  if (probed.data.schemaVersion > LOCAL_STATE_VERSION) {
    return { kind: "foreign" };
  }

  const current = toCurrentVersion(parsed);
  if (current === null) {
    // A version at or below ours that no migration path accepts. Ours to
    // replace: a version below the first one we ever wrote cannot be a newer
    // build's document.
    return { kind: "replaceable" };
  }

  const validated = localStateV1Schema.safeParse(current);
  if (!validated.success) {
    return { kind: "replaceable" };
  }

  return { kind: "usable", state: validated.data };
}

/**
 * The migration seam.
 *
 * One `switch` with one `case`, and deliberately not a `Migration[]` registry.
 * A registry with zero entries is a framework built for a version that does not
 * exist (section 48), and it has already guessed the shape of the answer:
 * whether V1 to V2 turns out to be a chain of steps, a single rewrite, or a
 * discard is not knowable now, and a registry only supports the first.
 *
 * Returning `null` is a supported outcome rather than an error. Losing this
 * document costs a reader the record of which stories they had expanded, which
 * is one recoverable count on one edition — they can expand them again, and
 * nothing else in the product depends on it.
 *
 * That acceptability is a property of THIS payload, not a policy, and the
 * payload has since grown the interests a reader explicitly chose — something
 * they stated rather than something they can re-derive by looking. ADR-0007
 * requires the argument to be made again for them, so: it still holds, for
 * three reasons that are about this field rather than about discarding in
 * general. Returning `null` is reachable only for a version at or below ours,
 * never for a newer document — those are `foreign` and are not touched at all.
 * The loss is at most two slugs, and it is self-repairing rather than silent:
 * a document without the key reads as never-asked, so the reader is offered
 * the invitation again on the next load instead of quietly losing the boost.
 * And the fallback while it is gone is the edition a reader who has chosen
 * nothing sees, which is what AB-204's acceptance criteria name as the correct
 * behaviour for invalid local state. That edition is TEN stories — the shared
 * core plus the default pooled pair — and not the eight-story core alone: the
 * criterion's phrase "falls back to the shared core" names the core's ordering
 * surviving a preference, and ADR-0008 decided that every reader gets ten
 * however they answered. A fallback that dropped to eight would make a
 * discarded document visible as a shorter edition.
 *
 * If a later field ever holds something a reader cannot restate in one gesture,
 * that field must re-argue this in turn, or migrate rather than discard.
 */
export function toCurrentVersion(stored: object): object | null {
  const probed = versionProbeSchema.safeParse(stored);
  if (!probed.success) {
    return null;
  }

  switch (probed.data.schemaVersion) {
    case LOCAL_STATE_VERSION:
      return stored;
    default:
      return null;
  }
}

/**
 * The document that results from the reader expanding one story.
 *
 * Idempotent: marking the same story twice produces an equal document, so a
 * repeated write cannot grow the file or change its bytes.
 *
 * Ids are SORTED rather than appended. Two reasons, and the second matters
 * more. The same set of stories then serialises to identical bytes whichever
 * order the reader opened them in, which makes the document diffable and the
 * tests exact. And insertion order IS the order the reader worked through the
 * edition — behavioural data that nothing in this product asks for and that
 * section 23 says to not collect by default. Sorting discards it at the point
 * it would otherwise be written down.
 *
 * Unknown top-level keys on `state` are carried through untouched; see the
 * schema comment above.
 */
export function withViewedStory(
  state: LocalStateV1,
  editionDate: string,
  storyId: string,
): LocalStateV1 {
  const existing = ownEntry(state.viewedByEdition, editionDate);
  const ids = existing.includes(storyId) ? existing : [...existing, storyId];

  return {
    ...state,
    viewedByEdition: remembered(
      { ...state.viewedByEdition, [editionDate]: [...ids].sort() },
      editionDate,
    ),
  };
}

/** Which stories the reader has already expanded in one edition. */
export function viewedStoryIds(
  state: LocalStateV1,
  editionDate: string,
): ReadonlySet<string> {
  return new Set(ownEntry(state.viewedByEdition, editionDate));
}

/**
 * The document that results from the reader ending one edition.
 *
 * Idempotent, sorted and size-bounded for the same three reasons
 * `withViewedStory` is, and the second one bites harder here. This field is a
 * bare list of dates: unsorted, its order IS the order the reader ended
 * editions in, which is a behavioural sequence nothing asks for and section 23
 * says not to collect. Sorting discards it at the point it would be written
 * down, and buys byte-stability with it.
 *
 * Unknown top-level keys on `state` are carried through untouched; see the
 * schema comment above.
 */
export function withEndedEdition(
  state: LocalStateV1,
  editionDate: string,
): LocalStateV1 {
  const existing = state.endedEditions ?? [];
  const dates = existing.includes(editionDate)
    ? existing
    : [...existing, editionDate];

  return {
    ...state,
    endedEditions: rememberedDates(dates, editionDate),
  };
}

/**
 * Whether the reader ended this edition — pressed the end control on it, not
 * merely expanded every story in it.
 *
 * No `Object.hasOwn` guard, unlike `ownEntry` below, and the difference is the
 * shape rather than an oversight: this field is an array, so an edition date of
 * "constructor" or "__proto__" is a value being compared, never a key being
 * looked up, and there is no prototype chain for it to resolve through. The
 * hazard the guard exists for cannot arise here. It is asserted anyway, because
 * "this shape is safe" is a claim that should fail a test if the shape changes.
 */
export function hasEndedEdition(
  state: LocalStateV1,
  editionDate: string,
): boolean {
  return (state.endedEditions ?? []).includes(editionDate);
}

/**
 * The interests this build will act on, out of whatever the device holds.
 *
 * Four steps, each of which is a hazard rather than tidying:
 *
 * - FILTER to slugs this build knows, because the schema is deliberately
 *   lenient about the vocabulary (see its comment). This is the other half of
 *   that decision: an unknown slug is kept on the device and ignored while
 *   reading, so a build that has never heard of it neither destroys it nor
 *   boosts by it.
 *
 * - DE-DUPLICATE, because an array read off a device can hold the same slug
 *   twice — nothing in JSON prevents it — and a duplicate would spend one of
 *   the two slots the reader is entitled to.
 *
 * - SORT. Safe to do because the selection this feeds is order-independent by
 *   construction: it asks whether a story's topic is in the chosen set, and
 *   never which position a slug held. What sorting buys is that the tick order
 *   is discarded at the point it would otherwise be written to the device.
 *   "Sports first, then technology" is a statement about the reader that
 *   nothing asks for, and section 23 says not to collect what nothing asks
 *   for. Byte-stability comes with it: the same choice is the same document
 *   whichever order the boxes were ticked in.
 *
 * - SLICE to the cap, which is the only place a stored over-long array is
 *   narrowed. Narrowing on READ and never on write is deliberate: a stored
 *   third slug can only have come from a build whose cap was higher, and an
 *   older bundle must not truncate a newer bundle's choice on its way past.
 */
export function canonicalInterests(
  interests: readonly string[],
): readonly InterestSlug[] {
  const known = interests.filter(
    (slug): slug is InterestSlug => interestSlugSchema.safeParse(slug).success,
  );

  return [...new Set(known)].sort().slice(0, MAX_INTERESTS);
}

/**
 * The document that results from the reader choosing their interests.
 *
 * REPLACES the array, where `withViewedStory` and `withEndedEdition` add to
 * theirs. Copying either of those bodies would be the natural thing to do and
 * would be wrong twice over: it would put the cap out of reach — a reader can
 * only ever add — and it would turn "change my preferences" into "accumulate
 * preferences", so a reader swapping sports for technology would silently hold
 * both, and then three, and then the whole vocabulary.
 *
 * An empty choice writes the key rather than omitting it; see the schema
 * comment, where absent and empty are different answers.
 *
 * Canonical on the way in, so the device never holds an order the reader's
 * clicks happened to produce. Unknown top-level keys, the viewed sets and the
 * ended editions are carried through untouched by the spread.
 */
export function withInterests(
  state: LocalStateV1,
  interests: readonly InterestSlug[],
): LocalStateV1 {
  return { ...state, interests: [...canonicalInterests(interests)] };
}

/**
 * The interests to boost by, empty when there are none to boost by.
 *
 * Empty for a reader who chose none AND for a reader who was never asked, which
 * is correct for ranking — both get the shared core — and is exactly why the
 * question "has this reader been asked?" is answered by the function below
 * instead of by this one's length.
 */
export function chosenInterests(state: LocalStateV1): readonly InterestSlug[] {
  return canonicalInterests(state.interests ?? []);
}

/**
 * Whether the reader has answered the invitation on this device.
 *
 * The key's PRESENCE, never the array's length. `chosenInterests(state).length
 * > 0` type-checks, reads naturally, and is the bug this field's shape exists
 * to prevent: it reports "I was asked and chose none" as "I have not been
 * asked", so the invitation returns on every load for the one reader who has
 * already said no to it.
 */
export function hasChosenInterests(state: LocalStateV1): boolean {
  return state.interests !== undefined;
}

/**
 * The theme this build will render with, out of whatever the device holds.
 *
 * The other half of the schema's leniency, and the same shape as
 * `canonicalInterests`: a string this build does not recognise is kept on the
 * device and ignored while reading, so a build that has never heard of it
 * neither destroys it nor tries to render by it. A reader who chose a theme a
 * newer bundle introduced reads as "system" here for the session and finds
 * their answer intact when the newer bundle loads again.
 *
 * An ABSENT field and an UNRECOGNISED one give the same answer, which is
 * correct here and would not have been for `interests`: nothing depends on
 * telling a reader who has chosen from one who has not (see `THEMES`).
 */
export function canonicalTheme(stored: string | undefined): Theme {
  return THEMES.find((theme) => theme === stored) ?? DEFAULT_THEME;
}

/**
 * The document that results from the reader choosing a theme.
 *
 * REPLACES, like `withInterests` and unlike the two writers that add to a list.
 * A reader has one appearance, so there is nothing to accumulate.
 *
 * "system" is written as a VALUE rather than by deleting the key. Deleting
 * would render identically — `canonicalTheme` answers "system" for an absent
 * field too — and it would throw away the one thing the two forms do not share:
 * an absent field is what every document written before this slice looks like,
 * so erasing the key turns "this reader asked to follow their device" back into
 * "this reader has never been asked". The two are the same to the stylesheet
 * and not the same fact, and keeping the one that says more costs a spread
 * either way.
 *
 * Unknown top-level keys, the viewed sets, the ended editions and the interests
 * are carried through untouched by the spread, so a reader changing theme on a
 * stale bundle keeps everything a newer bundle wrote.
 */
export function withTheme(state: LocalStateV1, theme: Theme): LocalStateV1 {
  return { ...state, theme };
}

/** The appearance to render, for a document this build could read. */
export function chosenTheme(state: LocalStateV1): Theme {
  return canonicalTheme(state.theme);
}

/**
 * One edition's stored ids, or none.
 *
 * `Object.hasOwn` rather than a plain lookup with `?? []`, because a plain
 * lookup resolves through `Object.prototype`. An `editionDate` of
 * "constructor", "toString", "valueOf" or "__proto__" then yields a function or
 * an object instead of `undefined`, `??` keeps it because it is not nullish,
 * and the caller either spreads a function or hands one to `new Set` — which
 * throws "is not iterable" out of a render, from a module whose whole promise
 * is that no refused write becomes a rendering decision.
 *
 * Today's dates come from a validated edition, so this is not reachable from
 * the product. It is written down here rather than argued about at each call
 * site because the argument is a property of the LOOKUP, and the next caller —
 * AB-204, reading a key the reader chose — would have to rediscover it.
 */
function ownEntry(
  entries: Record<string, readonly string[]>,
  editionDate: string,
): readonly string[] {
  return Object.hasOwn(entries, editionDate)
    ? (entries[editionDate] ?? [])
    : [];
}

/**
 * Applies the size bound.
 *
 * Two forms of one rule set: `rememberedDates` bounds `endedEditions`, which is
 * a list of dates, and `remembered` bounds `viewedByEdition`, which is a map
 * from a date to a set of ids. Documented once, here, so the two cannot drift
 * into evicting differently.
 *
 * The list form de-duplicates through a `Set` because, unlike an object's keys,
 * an array read off a device can hold the same date twice. Two copies would
 * each spend an entry of the budget, so the bound would quietly hold fewer
 * editions than it says.
 *
 * Three rules, each of which is a way of getting this wrong:
 *
 * - entries are dropped WHOLE and ids inside an entry are never trimmed. Half a
 *   viewed set is worse than none of it: it produces a count that is wrong and
 *   looks right, and neither the reader nor a later read can tell. The list
 *   form has nothing inside an entry to trim, so it satisfies this by shape.
 *
 * - the edition being written is ALWAYS kept, even when its date is the oldest
 *   of them all. Otherwise a reader opening a story in an old archive edition
 *   has the entry discarded by the very write that created it, and the edition
 *   they are looking at is the one edition that never remembers anything.
 *
 * - the survivors are chosen by sorting the dates, never by object key order or
 *   a clock. `YYYY-MM-DD` sorts chronologically as a string, so "newest" needs
 *   no date arithmetic and no timezone, and the result is identical whatever
 *   order the entries were inserted in. The output is rebuilt in sorted order
 *   for the same reason: JSON.stringify follows insertion order for an object
 *   and array order for a list, so without this the same set of editions could
 *   serialise two different ways.
 */
function rememberedDates(
  dates: readonly string[],
  alwaysKeep: string,
): string[] {
  const others = [...new Set(dates)]
    .filter((date) => date !== alwaysKeep)
    .sort()
    .reverse()
    .slice(0, MAX_REMEMBERED_EDITIONS - 1);

  return [alwaysKeep, ...others].sort();
}

function remembered(
  entries: Record<string, readonly string[]>,
  alwaysKeep: string,
): Record<string, string[]> {
  const others = Object.keys(entries)
    .filter((date) => date !== alwaysKeep)
    .sort()
    .reverse()
    .slice(0, MAX_REMEMBERED_EDITIONS - 1);

  const kept: Record<string, string[]> = {};
  for (const date of [alwaysKeep, ...others].sort()) {
    const ids = entries[date];
    if (ids !== undefined) {
      kept[date] = [...ids];
    }
  }

  return kept;
}
