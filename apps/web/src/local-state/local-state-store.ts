/**
 * The device-backed store: one key, a read-modify-write, and the logging.
 *
 * This is the seam the reader hook sits on. Everything above it asks two
 * questions — which stories were already expanded in this edition, and please
 * remember this one — and nothing above it knows that localStorage exists
 * (section 15). The rules for what a stored document means are in
 * `local-state.ts`; the browser access is in `device-storage.ts`; what is left
 * here is the key, the order of operations, and what a developer gets told.
 */

import { createLogger } from "@aaj-bas/logger";
import { editionDateSchema, identifierSchema } from "@aaj-bas/schemas";
import { readRaw, writeRaw } from "./device-storage";
import {
  EMPTY_LOCAL_STATE,
  type LocalStateV1,
  readLocalState,
  viewedStoryIds,
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
 * `paths` — and never the stored string, a story id, or an edition date.
 * Section 38 rules the last three out: which stories a named reader opened, and
 * on which day, is precisely the record this product does not keep, and putting
 * it in a console line is still keeping it.
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
