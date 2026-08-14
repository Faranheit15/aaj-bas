# ADR-0007: Versioned on-device state

Status: Accepted
Date: 2026-08-14
Owners: Aaj, Bas. maintainers
Accepted by: Faran Mohammad, repository maintainer, in the session that proposed this record.

## Context

This is the first byte the product writes to a reader's device.

AB-202 built story cards that record which stories a reader expanded, and deliberately kept that record in memory. Its own header comment explains why: writing an unversioned key would not have been a head start on AB-301, it would have invented a legacy format AB-301 then had to migrate away from, on readers' devices, before it had written a line. AB-203 needs the record to survive a reload — "state persists on reload" is its acceptance criterion — so the durable half comes due now.

Section 17 sets the bar. Persisted local state must be versioned, validated, safely parsed, recoverable from corruption, and migratable, and must never be assumed valid. The product constitution names persistence explicitly as requiring a documented decision.

The reason this record exists is not that the code is complicated. It is that five later slices must obey rules that are not discoverable by reading a React hook. AB-203 adds an ended-editions field, AB-204 adds interests, AB-205 adds a theme, AB-206 adds a service worker that can serve an older bundle to a device holding newer state, and AB-302 decides whether anything is ever transmitted. Left in a hook body, the rules below would be violated within a slice or two.

## Decision

**One key, one document, versioned in the value.** `aaj-bas.local-state` holds a single JSON object whose first field is `schemaVersion`, flat at the top level. That matches both published artifacts — `editionSchema` and `editionIndexSchema` open the same way — and matches the interface the PRD already specifies. Versioning in the value rather than in the key name means a migration reads one place and a stale build cannot half-see a newer document.

**The document is untrusted input, exactly like a fetched edition.** It is parsed and validated with Zod on every read, against a schema that imports `editionDateSchema` and `identifierSchema` from `packages/schemas` rather than restating what a date or an id is.

**This build is the authority on version 1, and on nothing else.** A document at the current version that fails validation is ours and broken, so the next write replaces it. A document declaring a version *newer* than this build understands is intact and someone else's: the reader gets an empty set for the session, and **nothing is written at all**.

The precision matters, because the protection is narrower than "any version we do not recognise". A document whose `schemaVersion` is lower than the current one, or is not a number at all, is treated as replaceable. Lower is deliberate — an older version is ours to migrate or discard. Non-numeric is a gap rather than a decision: a hypothetical future build that serialised its version as a string would not be protected. Nothing writes such a document today, and widening the probe is a one-line change if one ever does. That rule is what makes AB-206 safe to add later — a service worker, or a CDN edge, can serve an older bundle to a device whose state a newer bundle wrote, and the older bundle must not destroy it.

A document with no `schemaVersion` is corrupt, not foreign. No build of this application has ever written an unversioned document, and AB-202's test asserts it never wrote a key at all, so one can only be corruption or a collision with another origin's key.

**An additive optional field does not bump `schemaVersion`, and writers preserve top-level keys they do not own.** Together these are what make AB-203's ended editions, AB-204's interests, and AB-205's theme cheap to add, and what stops an older deploy stripping a field a newer one wrote.

**The migration interface is a place, not a pipeline.** One function between parsing and validating, returning a document for the current schema or nothing. Returning nothing is a supported outcome rather than an error.

**Thirty editions, evicted by edition date.** The entry being written is always kept, entries are dropped whole, and eviction is a pure function of the stored keys and the date being written — no clock, no read timestamps, no reliance on key order.

**The schema lives in the application, not in `packages/schemas`.** That package is the source of truth for what the product *publishes*. This document is never published, never fetched, never served, and has one consumer forever.

**Exactly one module reaches the browser storage API.** Other files mention it in prose; only `device-storage.ts` calls it. Its two functions cannot throw, and they distinguish storage being unreachable from the key being absent. That distinction is load-bearing rather than tidy: a read that *failed* must not be treated as replaceable, because if reading throws while writing succeeds, a write would clobber a document we were never able to inspect — the same hazard as a foreign version, approached from the other side.

**Nothing is said to the reader.** Storage being unavailable produces the same screen a first-time reader sees.

## Conflicts with the PRD, reported rather than resolved quietly

Section 2 ranks an accepted ADR above the PRD but also requires a material conflict to be reported rather than guessed at. Two exist.

**The name.** PRD section 14 declares `LocalStateV1` with six fields, three of them required — interests, theme, and ended editions among them. This record reuses that name for a document holding one field, and relies on the additive rule above to grow into the rest. That works only if AB-203, AB-204, and AB-205 add their fields as **optional**. A later slice implementing the PRD's shape verbatim, with those fields required, would invalidate every document already on a reader's device.

**Migration.** PRD section 14 says migration code must preserve older local state. This record accepts discarding it when a version cannot be brought forward, argued above on the grounds that losing which cards were open costs a reader one recoverable count. That argument is about this payload and does not survive the PRD's larger shape: interests and a theme are choices a reader deliberately made, and discarding those would be a different decision needing a different justification.

Both are flagged for the human reviewer rather than settled here.

## Alternatives considered

- **A nested `{ version, data }` envelope.** Rejected: the claimed benefit is an opaque payload during a version probe, but a two-line probe schema reads a flat document just as safely, and nesting diverges from both published artifacts and from the PRD's stated interface for no gain.
- **One key per concern** (`aaj-bas.viewed`, `aaj-bas.theme`, …). Rejected: each key needs its own version, its own corruption handling, and its own eviction, and a partial write leaves the set of keys mutually inconsistent with nothing to detect it.
- **A `Migration[]` registry.** Rejected under section 48: a framework with zero entries, which also guesses whether a future upgrade is a chain, a rewrite, or a discard. With one version those are indistinguishable, so choosing now is a coin flip dressed as architecture.
- **Least-recently-used eviction.** Rejected on privacy grounds before ergonomics: it requires storing *when* a reader read, which is a behavioural timestamp and strictly more sensitive than which published stories they opened. It also needs a clock inside a pure function, and it would keep an old archive edition ahead of yesterday's.
- **`useSyncExternalStore`.** Rejected: it is the right API for an external store with change events, and this store has none — one writer per tab, and cross-tab synchronisation is not a requirement of any backlog item. A no-op `subscribe` advertises a subscription that does not exist.
- **A hand-written type guard instead of Zod.** Rejected: more code, validates less (nobody hand-writes an ISO calendar check), and duplicates `identifierSchema`. Zod is already in the reader bundle.
- **Telling the reader that storage is unavailable.** Rejected: the product never promised to remember, so a reader who loses nothing they were offered has not experienced a failure worth an interruption on a page whose job is today's news.

## Consequences

Reading history now exists durably on the device. That is the uncomfortable sentence and it should stay in this record: *which stories a reader expanded* is reading history. Section 17 permits it on-device — that is what "v1 user state stays on the user's device" means — and forbids transmitting it, and section 3.3 forbids using it to rank. Both permissions are conditional and both conditions are met. The next person to touch this file will be tempted to do something helpful with it.

The structural guarantee against ranking is that the ordering code cannot see the data: `coreStories` takes an edition and nothing else, and this slice changes neither its signature nor its module's imports.

Browsing leaves no trace. Nothing is written when a reader merely opens an edition; the first byte is written when they act on it. At the time of writing that meant expanding a story; AB-203 added a second such act, pressing the control that ends the edition, so a reader who ends an edition without opening anything also writes. The property that matters is unchanged: reading without acting records nothing.

Discarding on an unrecognised version is acceptable *for this payload*, because losing which cards were open costs a reader one recoverable count and blocks nothing. That acceptability is a property of the data, not of the mechanism. AB-204 must re-argue it for interests, which are choices a reader deliberately made.

AB-203 gets a viewed set that is already correct on the first render, so its counter cannot flash a wrong number and settle.

Two tests that asserted this slice had *not* happened are replaced by their positive counterparts rather than deleted. Turning a "not yet" assertion into a "now, and exactly this" assertion is the seam closing correctly.

Readers can clear the document through ordinary browser site-data controls. A product-level control belongs with a settings surface, which does not exist yet.

## Security/privacy impact

No network path exists in the new code: no fetch, no beacon, no socket, no dynamic import. The only dependency with any I/O is the logger, which ADR-0003 confines to the console.

Nothing identifies the reader. No install id, session id, or device id is minted; `crypto.randomUUID` is not called; no timestamp of reading is stored, which is a direct consequence of choosing date-ordered eviction over LRU. Every value stored is already public — edition dates and story ids are served to every reader in the published edition. The only non-public fact is the correlation, and it never leaves the device.

Nothing sensitive is stored, so section 17's prohibition on secrets is satisfied by there being no field that could hold one.

Storage failures degrade to the fresh-device experience and are logged once per reason. Unlike a rejected edition, **the validation paths are not logged**: a path in this document reads `viewedByEdition.2026-07-21.2`, which is an edition date and a position in a reader's viewed set. In published content a path is public structure; here the path is the private part. Only a fixed reason, and the stored version when a document is foreign, are recorded — never the stored string, a story id, an edition date, or a Zod issue path.

## Product-constitution impact

This store creates no reader obligation. Nothing is displayed as unread, nothing accumulates a visible count, there is no queue to clear and no badge. AB-202 already declined a per-card viewed marker because it would imply "unviewed" on the rest, which is the completion checklist section 3.5 rules out; this slice does not reopen that.

Eviction is invisible on purpose. Announcing housekeeping would manufacture the obligation the housekeeping exists to avoid.

## Rollback plan

Revert the commit. The hook returns to its in-memory body and every caller is unchanged, because the signature was designed not to move.

Documents already written to devices become inert: nothing reads the key, and it costs a few hundred bytes until the reader clears site data. That is the whole cost of being wrong, which is the strongest argument that this decision is reversible.

If instead only the shape is wrong, the version rule is the escape: ship a version 2, and every older build in the wild will decline to overwrite it.
