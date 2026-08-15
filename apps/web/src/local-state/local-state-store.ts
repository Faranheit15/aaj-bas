/**
 * The device-backed store: one key, a read-modify-write, and the logging.
 *
 * This is the seam the reader hooks sit on. Everything above it asks six
 * questions — which stories were already expanded in this edition, please
 * remember this one, was this edition ended, please remember that it was, what
 * did this reader choose to be interested in, please remember that too — and
 * nothing above it knows that localStorage exists (section 15). The rules for
 * what a stored document means are in `local-state.ts`; the browser access is
 * in `device-storage.ts`; what is left here is the key, the order of
 * operations, and what a developer gets told.
 */

import { createLogger } from "@aaj-bas/logger";
import {
  editionDateSchema,
  identifierSchema,
  type InterestSlug,
  interestSlugSchema,
} from "@aaj-bas/schemas";
import { readRaw, writeRaw } from "./device-storage";
import {
  chosenInterests,
  EMPTY_LOCAL_STATE,
  hasChosenInterests,
  hasEndedEdition,
  type LocalStateV1,
  MAX_INTERESTS,
  readLocalState,
  viewedStoryIds,
  withEndedEdition,
  withInterests,
  withViewedStory,
} from "./local-state";

/**
 * The one key this application owns.
 *
 * Exactly one, and a test asserts that a write leaves `localStorage.length` at
 * one. Key sprawl is how device state stops being versionable: a second key
 * written by a later slice has its own implicit format, its own corruption
 * mode, and no migration path, and by the time that is noticed it is already on
 * readers' devices. Everything persisted goes inside this document instead.
 */
export const LOCAL_STATE_KEY = "aaj-bas.local-state";

const log = createLogger("web", import.meta.env.DEV ? "debug" : "warn");

/**
 * Reasons already reported during this page load.
 *
 * A reader with storage blocked, or holding a document from a newer build,
 * hits the same condition on every card they expand. Warning every time would
 * put dozens of identical lines in the console for one fact, and a channel that
 * repeats itself is a channel developers learn to scroll past — which costs
 * more than the repetition saves.
 *
 * This is not swallowing the failure that section 37 prohibits: the condition
 * is reported, once, with its reason, and the fallback it produces is correct
 * and visible in behaviour. What is suppressed is the repetition, not the fact.
 */
const reportedReasons = new Set<string>();

/**
 * What a read of the stored document produced.
 *
 * `unavailable` is separate from `replaceable` because only one of them permits
 * a write. If storage could not be read at all, this build has no idea what is
 * under the key — it could be a newer build's document — so it must not write
 * over it. That is the same rule as `foreign`, arrived at from the other side.
 */
type StoreRead =
  | { readonly kind: "usable"; readonly state: LocalStateV1 }
  | { readonly kind: "replaceable" }
  | { readonly kind: "foreign" }
  | { readonly kind: "unavailable" };

/** Which stories the reader has already expanded in one edition. */
export function readViewedStoryIds(editionDate: string): ReadonlySet<string> {
  const read = load();

  return read.kind === "usable"
    ? viewedStoryIds(read.state, editionDate)
    : new Set<string>();
}

/**
 * Records that the reader expanded one story.
 *
 * Returns nothing, deliberately. Persistence here is an echo of React state,
 * never a precondition for it: the story has already expanded on screen by the
 * time this runs, and it stays expanded whether or not the device accepts the
 * write. A boolean would be a value a caller could mistake for a rendering
 * decision, and the first component that branched on it would show a reader
 * with private browsing on a different edition from everyone else.
 *
 * It is a read-modify-write because the document holds other editions and, in
 * time, other slices' fields. A blind write would drop them.
 */
export function rememberViewed(editionDate: string, storyId: string): void {
  /*
    Checked here, at the entry, and not left to the caller.

    Today both values come from an edition that passed the published content
    schemas, so in the product they are already valid. That is an argument
    about today's callers, not an invariant of this function, and the failure
    it guards is not proportionate to it: `viewedByEdition` is keyed BY the
    edition date, so one bad key makes the WHOLE document fail its own read on
    the next load, and every other edition the reader had accumulated goes with
    it. Writing "2026-02-30" once discards a month of state.

    On entry rather than on the finished document, because it is strictly
    stronger. A key of "__proto__" survives a document-level check — the
    assignment that builds the entry map sets a prototype instead of adding a
    key, so the bad entry is simply absent and what remains validates — and is
    caught here. AB-204 is the concrete reason to have it: interests are chosen
    by the reader, so its keys will not have come from a published edition.
  */
  const validArguments =
    editionDateSchema.safeParse(editionDate).success &&
    identifierSchema.safeParse(storyId).success;
  if (!validArguments) {
    // Reported without either value, and without saying which of the two
    // failed: what this refuses to write to the device is exactly what it must
    // not write to a console line either (section 38). A developer holding the
    // reason knows the caller passed something the document could not carry,
    // which is enough to find it from the call site.
    report("unwritable-values");
    return;
  }

  const read = load();
  if (read.kind === "foreign" || read.kind === "unavailable") {
    // Never write over a document this build could not read. See the version
    // rule in `local-state.ts`; `load` has already reported the reason.
    return;
  }

  const base = read.kind === "usable" ? read.state : EMPTY_LOCAL_STATE;
  const next = withViewedStory(base, editionDate, storyId);

  if (!writeRaw(LOCAL_STATE_KEY, JSON.stringify(next))) {
    report("write-refused");
  }
}

/**
 * Whether the reader ended this edition on this device.
 *
 * `false` for every read this build could not make sense of, which is the same
 * answer a fresh device gives: an edition that cannot be shown to have been
 * ended is offered its ending again, and the cost of being wrong is one control
 * the reader has already used once. The opposite default would hide the ending
 * from a reader who never had one.
 */
export function readEditionEnded(editionDate: string): boolean {
  const read = load();

  return read.kind === "usable" && hasEndedEdition(read.state, editionDate);
}

/**
 * Records that the reader ended one edition.
 *
 * `void` for the same reason as `rememberViewed`: the edition has already ended
 * on screen by the time this runs, and it stays ended whether or not the device
 * accepts the write. A boolean here would be a value a caller could mistake for
 * a rendering decision.
 */
export function rememberEnded(editionDate: string): void {
  // Checked at the entry, exactly as in `rememberViewed` and for the same
  // reason — a date the schema rejects does not cost this one field, it makes
  // the WHOLE document fail its next read and takes the reader's viewed sets
  // with it. Reported without the value (section 38).
  if (!editionDateSchema.safeParse(editionDate).success) {
    report("unwritable-values");
    return;
  }

  const read = load();
  if (read.kind === "foreign" || read.kind === "unavailable") {
    // Never write over a document this build could not read. See the version
    // rule in `local-state.ts`; `load` has already reported the reason.
    return;
  }

  const base = read.kind === "usable" ? read.state : EMPTY_LOCAL_STATE;
  const next = withEndedEdition(base, editionDate);

  if (!writeRaw(LOCAL_STATE_KEY, JSON.stringify(next))) {
    report("write-refused");
  }
}

/**
 * What a read of the reader's interests produced.
 *
 * Three answers because there are three different things to do, and because two
 * of them are not "this reader has no interests":
 *
 * - `unknown` — the document could not be read, or belongs to a build this one
 *   must not touch. This build knows neither what the reader chose nor whether
 *   they were ever asked, so it shows no invitation and writes nothing. The
 *   edition falls back to the one a reader who chose nothing sees — ten
 *   stories, the shared core plus the default pooled pair, never the core
 *   alone — so nothing about the failure is visible.
 * - `unanswered` — the invitation has not been answered on this device.
 * - `answered` — it has, possibly with nothing.
 *
 * Collapsing `unanswered` into an empty `answered` re-invites a reader who
 * declined. Collapsing `unknown` into `unanswered` invites a reader whose
 * answer is sitting in a document this build cannot read, and then fails to
 * record the answer it just asked for.
 */
export type InterestsRead =
  | { readonly status: "unknown" }
  | { readonly status: "unanswered" }
  | {
      readonly status: "answered";
      readonly interests: readonly InterestSlug[];
    };

/**
 * What the reader chose, or why this build cannot say.
 *
 * A device with nothing stored, and a document this build read as corrupt, are
 * both `unanswered` rather than `unknown`: there is nothing under the key worth
 * protecting, the next write may replace it, and a device that holds no answer
 * has not given one. `unknown` is reserved for the two states in which writing
 * is forbidden, so that the invitation is never shown where the answer could
 * not be kept.
 *
 * At most two interests come back, whatever the device holds; see
 * `canonicalInterests`.
 */
export function readInterests(): InterestsRead {
  const read = load();
  if (read.kind === "foreign" || read.kind === "unavailable") {
    return { status: "unknown" };
  }

  if (read.kind === "replaceable" || !hasChosenInterests(read.state)) {
    return { status: "unanswered" };
  }

  return { status: "answered", interests: chosenInterests(read.state) };
}

/**
 * Records the interests the reader chose.
 *
 * Returns whether the bytes were written — a deliberate exception to the `void`
 * of `rememberViewed` and `rememberEnded`, not an inconsistency with them. That
 * convention exists so that a refused write cannot become a CONTENT decision: a
 * story stays expanded on screen whatever the device does, and a caller
 * branching on a boolean would show a reader with private browsing a different
 * edition from everyone else. This boolean is not about content. It is a
 * statement about the write itself, and the invitation's copy promises the
 * choice will apply, so returning nothing would leave the product asserting
 * something it knows to be untrue — the swallowed failure section 37
 * prohibits. A caller may use `false` to tell the reader their choice was not
 * kept; it may not use it to rank anything differently.
 *
 * `false` for every path that wrote nothing: a selection this build refuses, a
 * document it must not overwrite, storage it could not read, and a write the
 * browser rejected. `true` only when bytes reached the device.
 */
export function rememberInterests(interests: readonly InterestSlug[]): boolean {
  /*
    Checked at the entry, as in `rememberViewed`, and against
    `interestSlugSchema` rather than `topicSlugSchema`: `india` and `world` are
    core coverage every reader gets and nobody opts into (PRD section 5.3), so
    storing one would be a preference the ranking cannot honour.

    REFUSED rather than truncated, de-duplicated or cleaned up, which is the
    opposite of what `canonicalInterests` does on the way out and is deliberate.
    The only caller is this application's own selection UI, so an over-long,
    duplicated or unrecognised selection is a bug in our code; quietly storing
    the first two of three would hide it behind a document that looks correct
    forever. Repairing a stored array is charity towards a device we do not
    control, and refusing one is honesty about a caller we do.

    Reported with the reason alone. An interest is a preference a person
    stated, which makes it MORE sensitive than which public stories they
    opened, not less: not the slugs, not how many there were, and not whether
    this reader has chosen at all may appear on a console line (section 38).
    A developer holding the reason knows the selection could not be stored,
    which is enough to find it from the call site.
  */
  const writable =
    interests.length <= MAX_INTERESTS &&
    new Set(interests).size === interests.length &&
    interests.every((slug) => interestSlugSchema.safeParse(slug).success);
  if (!writable) {
    report("unwritable-values");
    return false;
  }

  const read = load();
  if (read.kind === "foreign" || read.kind === "unavailable") {
    // Never write over a document this build could not read. See the version
    // rule in `local-state.ts`; `load` has already reported the reason.
    return false;
  }

  const base = read.kind === "usable" ? read.state : EMPTY_LOCAL_STATE;
  const next = withInterests(base, interests);

  if (!writeRaw(LOCAL_STATE_KEY, JSON.stringify(next))) {
    report("write-refused");
    return false;
  }

  return true;
}

function load(): StoreRead {
  const raw = readRaw(LOCAL_STATE_KEY);
  if (!raw.ok) {
    report("storage-unavailable");
    return { kind: "unavailable" };
  }

  const stored = raw.value;
  const read = readLocalState(stored);

  if (read.kind === "foreign" && stored !== null) {
    // The version is the one field worth naming: it says plainly that this
    // bundle is older than the document, which is a stale-cache or
    // service-worker problem rather than a bug in this code.
    report("foreign-version", { storedVersion: storedVersion(stored) });
    return read;
  }

  if (read.kind === "replaceable" && stored !== null) {
    // A fresh device is `replaceable` too, and is not worth a word.
    report("unreadable-document");
  }

  return read;
}

/** The declared version of a document already known to parse as JSON. */
function storedVersion(raw: string): number | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null) {
    return undefined;
  }

  const version: unknown = (parsed as { schemaVersion?: unknown })
    .schemaVersion;

  return typeof version === "number" ? version : undefined;
}

/**
 * Reports one condition, at most once per page load.
 *
 * The fields are a closed vocabulary — `reason`, `storedVersion`, `issueCount`,
 * `paths` — and never the stored string, a story id, an edition date, or an
 * interest slug. Section 38 rules those out: which stories a named reader
 * opened, and on which day, is precisely the record this product does not keep,
 * and putting it in a console line is still keeping it. An interest is stronger
 * still, being something the reader stated rather than something observed, so
 * neither a slug nor a count of them nor the bare fact that a reader has chosen
 * belongs here. The vocabulary being CLOSED is what enforces that: a field
 * carrying one would have to be added to this list first.
 *
 * `paths` is in the vocabulary and is deliberately NOT emitted here, which is
 * the one place this differs from `edition-repository.ts`. A validation path in
 * a published edition is public structure — `stories.3.headline` — so logging
 * it is free. A validation path in THIS document is `viewedByEdition.` followed
 * by an edition date, and its child index is a position in a reader's viewed
 * set. The path *is* the private part. A count of issues would be safe, but on
 * its own it is not worth a second parse of a document already judged bad; a
 * developer with the reason can open the key in devtools, which the reader's
 * console line never should.
 */
function report(reason: string, fields?: Record<string, unknown>): void {
  if (reportedReasons.has(reason)) {
    return;
  }
  reportedReasons.add(reason);

  log.warn("Local reading state was not persisted.", { reason, ...fields });
}
