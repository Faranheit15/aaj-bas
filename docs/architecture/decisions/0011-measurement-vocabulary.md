# ADR-0011: The measurement vocabulary, and why nothing collects yet

Status: Proposed
Date: 2026-08-15
Owners: Aaj, Bas. maintainers

## Context

AB-302 asks for a no-op event adapter, documented aggregate event names, the ability to enable a first-party endpoint by configuration, and no third-party SDK.

Section 47 lists "add tracking" among the things an agent must never do autonomously, and `docs/workflows/slice.md` says what that means in practice: *"If the task requires anything in `AGENTS.md` section 47, prepare the change and ask for authorization instead of doing it."* A backlog item is therefore not authorization here. The maintainer was asked, with the findings below in front of them, and chose to ship the vocabulary and the guard and no adapter.

Four facts made that the right call, and each was checked rather than assumed.

**Nothing downstream exists.** There is no endpoint — AB-802 builds the Worker and sits behind the whole ingestion and generation backlog, and PRD section 12.4 says of the endpoints it lists: "None of it is built, and section 7 of `AGENTS.md` rules out standing up a backend to serve it." There is no pilot cohort, no published edition, and no privacy page, which PRD section 15 requires "before inviting public users". Section 50 asks what current problem requires this. The honest answer is none.

**Three of the four permitted event families need no client code at all.** PRD section 15 allows aggregate edition loads, aggregate completions and early endings, aggregate source-link opens by story, and aggregate issue-report counts. Edition loads are already countable as requests to `/content/latest.json`. Issue-report counts are already countable as GitHub issues, because `report-issue.ts` opens a public issue rather than posting anywhere — and an event there would additionally count the *intent* to report, which is a fact about a reader the existing surface does not produce. Source-link opens are discussed below. That leaves completions and early endings as the only family a client genuinely has to emit, because ending is a local act that produces no request.

**A no-op adapter with call sites is the shape ADR-0003 refused, rebuilt one layer up.** That record's control is stated as an argument about shape: adding a transport "means writing `fetch` here, which is unarguable in review; behind a sink interface the same change would read as 'adding a sink'." An adapter plus a configuration flag moves the reviewable moment from "someone added a network call" to "someone changed a build variable", and it leaves behind a map of every place in the reader where measurement could be switched on. ADR-0003 also binds this slice directly: it requires a new ADR for a transport, a buffer, an identifier, or a pluggable sink "in this package **or in any caller**".

**The guard that was supposed to protect all of this only covered four files.** `interests-stay-on-device.test.ts` asserts that no transport appears in four modules named by hand. `SECURITY.md` tells readers "no reader data leaves the reader's device". A module added tomorrow satisfies the first and could falsify the second.

## Decision

**No adapter, no payload type, no configuration, no network code.** AB-302 remains open and is delivered in part. What ships is the vocabulary, the prohibitions, the preconditions, and one enforceable guard.

### The vocabulary is closed

These are the only events this product may ever emit, and the list is closed: adding a name requires an ADR.

| Name | Fields | Why the field cannot name a reader |
| --- | --- | --- |
| `edition-opened` | `editionDate` | An editorial calendar day, served to every reader as the name of a public file. Not a device clock reading, so it says which artefact, never when. |
| `edition-completed` | `editionDate` | As above. |
| `edition-ended-early` | `editionDate` | As above. The distinction from completion is carried by *which name fires*, never by a count. |
| `source-link-opened` | `editionDate`, `storyId` | Both public; the story id appears in the edition every reader downloads. **See the conflict below — this one may not be reachable at all.** |
| `issue-report-opened` | `editionDate` | As above. |

**And the honest sentence that has to sit beside that table:** no field identifies a reader *in isolation*, and that is not the property that matters. An edition date, a story id, the receipt time the endpoint stamps, and the address the transport unavoidably reveals compose into a reading record — the same record `viewedByEdition` holds on device, which section 17 forbids transmitting. Unlinkability is a property of the destination, not of the payload.

So: **the payload carries no identifier; the observation is not anonymous.** This product must never describe its events as anonymous — not in a document, not in a privacy page, not in a comment. That is a claim only an operator can make, only about server configuration, and only if it is true.

### What no event may ever carry

No timestamp of any kind. ADR-0007 rejected least-recently-used eviction to avoid storing when a reader read; ADR-0010 reads a download time off a response header rather than minting one. A device-minted timestamp here would be the first reading timestamp this product has produced.

No identifier — install, session, device, or correlation — and no sequence number, batch, or queue. A batch is a session and an ordinal is a reading order.

**No interests, no count of them, and not the bare fact that any were chosen.** ADR-0008 states this as a hard rule for the console and delegates the transmission question here in writing: interests "must be out of scope for it by default". This record accepts that delegation and makes it permanent rather than default.

No count of stories read on a completion or early-ending event. That is the most tempting field in the design and it is "stories consumed", named as an anti-metric in section 1.

No theme, no content set, no freshness, no cache-source, no user agent, no language, no viewport. Each is defensible alone and each narrows the anonymity set.

No event on story expansion, scroll, dwell, focus, visibility, or unload.

### The installation identifier is refused, and the refusal is load-bearing

PRD section 15 permits "an optional anonymous installation ID with 30-day rotation during the closed beta only". There is no closed beta. ADR-0007, 0008, 0009 and 0010 each separately assert, as a checked property, that no identifier is minted and `crypto.randomUUID` is not called.

Rotation is not a mitigation; it is two further violations, because it needs a stored mint time and a clock — the exact things three records have separately refused. And an identifier is what converts four aggregate counts into a per-device reading stream.

So that a later slice can still add one honestly, this slice adds **no field to `LocalStateV1`** — not even an optional one — **no identifier-shaped optional field to any type**, and **no clock or randomness anywhere**. The later slice's diff must therefore be visibly the first identifier this product has ever written.

### Preconditions on any future adapter

All three must be true before any measurement code is written:

1. an endpoint exists, under its own accepted ADR and an unlocked milestone (AB-802);
2. the plain-language privacy page PRD section 15 requires is published;
3. a cohort exists to measure (AB-1002).

And the endpoint that receives these events must store **counters, not rows** — one row per event with a timestamp is a reconstructable sequence whatever the payload holds — must never read the connecting address into application code or derive anything from it, including a country or a hash, and must answer `204` with no body and no cookie. Zone-level request logging for that path is a dashboard setting that no test in this repository can assert, which is the same class of claim ADR-0010 verified against the live site rather than assuming.

### One guard ships, and it is worth more than the adapter was

`apps/web/src/transports.test.ts` inverts the existing check. Rather than asking whether four named files send bytes, it asks which files do, and compares the answer to a literal list of two: the edition repository and the service worker. Adding a transport anywhere now fails, and the fix is to edit the list — a one-line diff that reads as "this module may now send bytes". That is the review moment ADR-0003 wanted and said it could not have.

It also asserts that nothing patches `console`. ADR-0003 named that route and said plainly that "no repository check would catch it". That sentence is now false.

**What the guard is not.** A source-text sweep is a tripwire, not a sandbox: it is defeated by a computed property name, it cannot see inside dependencies, and it says nothing about what the two permitted modules actually send. The real structural control is a `connect-src 'self'` Content-Security-Policy, which belongs to AB-903 and which ADR-0009 already noted must carry the pre-paint script's hash.

## Alternatives considered

- **Build the whole item, including a configurable endpoint.** Rejected: section 7 forbids placeholder API layers by name, there is nothing to point at, and it would make `SECURITY.md`'s published claim conditional on a build variable. A build flag is also a poor kill switch — turning collection off would need a rebuild and a redeploy.
- **Build the contract and a no-op adapter, with no transport.** Rejected as the shape argument above, and under section 13: an interface with one implementation and zero consumers. It would also force deciding the call sites now, and every call site widens a boundary an existing record argued for — `use-edition.ts` would turn the loader into a reporter, and the source-link anchors have no handler today precisely so the card cannot grow an outward channel.
- **Defer the whole item and write nothing.** Rejected: it forfeits the two pieces with present value. A closed vocabulary written by someone with no metric to hit is a better vocabulary than one written when a retention gate is due, and the guard is worth having whether or not measurement ever ships.
- **Emit a development-mode console line instead of a no-op.** Rejected: it has no diagnostic value, because there is nothing downstream to be wrong, and it would route a reading record through the one channel ADR-0003 identifies as exfiltrable.

## Consequences

AB-302 stays open. Its no-op adapter and its configurable endpoint are deferred to the slice where an endpoint exists; its documented event names are delivered here; its "no third-party SDK" was already true and is now enforced rather than asserted.

Two of its three acceptance criteria were already satisfied before this slice — "works identically with analytics disabled" is vacuously true when nothing is enabled, and is now structurally guarded. The third is delivered as a closed documented vocabulary rather than as a serialized-payload test.

**Its second criterion is partly unenforceable in a client, and that should not be papered over.** "No raw IP field" is a statement about a JSON body; section 23 forbids raw address *storage* as product analytics, which is a statement about a database. A client can satisfy the criterion completely while the destination violates the rule. AB-802's own criteria already carry that half.

A conflict this record reports rather than resolves: **PRD section 15 permits aggregate source-link opens by story, and ADR-0010 refused exactly that observation from the service worker**, on the grounds that a component positioned to see which publishers a reader visits "would be a data-collection surface this product has no use for". Moving the observation from the worker to a click handler does not change what is observed. A human should settle whether that event may exist at all.

A second conflict, larger and worth stating plainly: **PRD section 16.1's first pilot gate is a return rate across days, and no event in this vocabulary can produce it without the identifier this record refuses.** The product's own success criterion is defined in a quantity its privacy rules forbid it from measuring. That is not this slice's to solve, but the slice that faces the gate should not discover it under time pressure.

AB-302 is also mis-filed. It sits in backlog section 3, "Local state and migration", beside the versioned-state item, but nothing about it is local state and its real dependencies are in sections 8 and 10. Its position is the main reason it read as the next thing to do.

This is the fourth consecutive record at `Status: Proposed` above merged code. ADR-0010 already flagged that as deserving attention; here the unratified premise would be a privacy claim rather than a caching or styling one, which is a reason to ratify 0007 through 0010 rather than a footnote.

## Security/privacy impact

Nothing is collected, nothing is transmitted, no identifier is minted, no clock is read, and no field is added to the stored document. The reader's device is in exactly the state it was in before this slice.

The application's outbound surface is now an asserted property rather than a reviewed one: exactly two modules may send bytes, and the assertion names any third. Combined with the console check, the two routes by which reader data could plausibly leave — a new module with a beacon, and a wrapped `console` — both now fail the blocking suite.

The limits are stated above and are real: this is a text sweep, not a sandbox, and the endpoint-side obligations it records cannot be enforced from this repository at all.

## Product-constitution impact

The constitution's measurement position is that the product collects nothing by default, and this slice keeps that literally true while making it checkable.

The vocabulary itself was chosen against the constitution's anti-metrics. There is no session length, no stories-consumed count, no return-frequency event, and no streak-shaped counter, because section 1 names time in app, pages per session, stories consumed and repeated daily opens as the things this product must never optimise for. What survives is a count of editions opened, finished, and deliberately ended — the last of which exists because a reader choosing to stop early is a *success* by this product's definition, and is the one fact no server-side surface can see.

Nothing here is visible to a reader, changes what they see, or asks anything of them.

## Rollback plan

Delete the guard test and this record. Nothing else changes, because nothing else was built: no runtime code ships in this slice, and the application's behaviour, bundle and stored document are byte-identical with or without it.

The cost of reverting is the guarantee itself — the outbound surface returns to being a claim in `SECURITY.md` that four hand-listed files partially support.
