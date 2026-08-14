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
 * edition. It records no timestamps and no ordering, so it cannot become a
 * reading-behaviour record (section 23), and it never leaves the device
 * (section 17).
 */

import { editionDateSchema, identifierSchema } from "@aaj-bas/schemas";
import { z } from "zod";

/** The version this build writes, and the only one it can read. */
export const LOCAL_STATE_VERSION = 1;

/**
 * How many editions' viewed sets are kept.
 *
 * A month of archive browsing is remembered and everything older is dropped, so
 * the document has a bounded size no matter how long a device is used. It is a
 * storage bound, not a product feature: nothing shows the reader a history.
 */
export const MAX_REMEMBERED_EDITIONS = 30;

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
 * That acceptability is a property of THIS payload, not a policy. When AB-204
 * adds explicitly chosen interests, discarding the document would throw away
 * something the reader typed in rather than something they can re-derive by
 * looking, and that slice has to make the argument again for its own payload.
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
 * Applies the size bound, keeping whole entries only.
 *
 * Three rules, each of which is a way of getting this wrong:
 *
 * - entries are dropped WHOLE and ids inside an entry are never trimmed. Half a
 *   viewed set is worse than none of it: it produces a count that is wrong and
 *   looks right, and neither the reader nor a later read can tell.
 *
 * - the edition being written is ALWAYS kept, even when its date is the oldest
 *   of them all. Otherwise a reader opening a story in an old archive edition
 *   has the entry discarded by the very write that created it, and the edition
 *   they are looking at is the one edition that never remembers anything.
 *
 * - the survivors are chosen by sorting the dates, never by object key order or
 *   a clock. `YYYY-MM-DD` sorts chronologically as a string, so "newest" needs
 *   no date arithmetic and no timezone, and the result is identical whatever
 *   order the entries were inserted in. The output object is rebuilt in sorted
 *   key order for the same reason: JSON.stringify follows insertion order, so
 *   without this the same set of editions could serialise two different ways.
 */
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
