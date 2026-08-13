# ADR-0005: Edition content contract

Status: Accepted
Date: 2026-08-13
Owners: Aaj, Bas. maintainers
Accepted by: Faran Mohammad, repository maintainer, in the session that proposed this record.

## Context

`packages/schemas` was an `export {}` stub carrying an unused `zod` dependency. Nothing downstream — story cards, local reading state, ingestion, ranking, the `content:validate` command — could begin without a contract to build against. AB-101 exists to produce one.

PRD section 13 specifies most of it, but four things it references were never defined, and the schema cannot be written without closing them:

1. `Edition` has no `sources` array, so `Story.sourceIds` has nothing to resolve against. AB-101's "rejects missing source mapping" acceptance criterion is unimplementable as written.
2. `CorrectionNote` appears in `Edition` and is defined nowhere.
3. `TopicSlug` appears in `Story` and is defined nowhere.
4. `InterestSlug` values exist only as display labels in section 5.3.

Two further questions had no answer in any governing document: whether topics and interests are one vocabulary or two, and what "ten stories" means for a file that holds eight core stories plus interest pools.

This record covers the decisions. The field-by-field contract lives in `docs/PRD.md` section 13 and is implemented in `packages/schemas`.

## Decision

**`Edition` gains `sources: SourceReference[]`.** It is the only place the array can live, and without it provenance cannot be checked.

**Topics and interests are one vocabulary, with `InterestSlug` a strict subset of `TopicSlug`.** Eight topics; the six interest boosts are six of them. `india` and `world` are core-only, matching section 5.3's "India is part of the shared core and is not an optional topic". Choosing an interest therefore means "more stories whose topic is this", and a schema rule enforces that a pooled story carries the matching topic.

**Ten stories is a reachability guarantee, not a count.** The schema requires exactly eight core stories and at least two more across the interest pools. Which two a reader who has chosen no interests receives is a rendering decision that belongs to AB-204.

**Interest pools are partial.** Only interests with candidates on the day appear.

**`CorrectionNote` requires a reader-visible `summary` and an `editionVersion` of 2 or above.**

**Cross-field integrity is enforced in the schema, not in a later step.** Source mapping, id uniqueness, core size, pool-topic agreement, orphan stories, and the unreviewed-story publication gate all block parsing.

**The JSON Schema export describes shapes only.** JSON Schema cannot express the cross-field rules; Zod drops them from the output. `editionSchema` remains the authority and a test records the gap.

## Alternatives considered

- **Two taxonomies joined by a mapping table**, faithful to the PRD's literal wording. Rejected: it puts an editorial decision inside a lookup nobody reads, which section 22 rules out, and every consumer pays a translation step for no gain.
- **Seven topics, folding world affairs into policy-geopolitics.** Rejected: an overseas disaster or a foreign science story has no natural home, and section 5.2 names world affairs as core coverage in its own right.
- **An explicit `defaultInterestStoryIds` pair**, guaranteeing ten stories in the data rather than in the reader. Rejected as pre-empting AB-204, which owns the no-interests case. The field remains addable later; adding one is a compatible change.
- **Requiring all six interest pools.** Rejected: at two stories each it forces twenty-story editions and contradicts the ten-story edition AB-102 describes.
- **Deferring counts and integrity to AB-103's `content:validate`.** Rejected: it would leave AB-101's own acceptance criteria unmet, and a contract that parses invalid content is not a contract. Editorial diversity rules — publisher counts, topic caps — do stay in AB-103.
- **Hand-maintained JSON Schema.** Rejected: two artefacts that drift. Generated from Zod instead.

## Consequences

Applications derive content types from `@aaj-bas/schemas` and never restate them. The `zod` dependency now has a call site.

The topic slugs are written into every published edition. Renaming one is a content migration across the archive, not a refactor. Adding a topic is compatible; adding an interest requires that topic to exist first, which the package enforces at compile time.

`schemaVersion` is pinned to the literal `1`. A contract change bumps it, and a reader built for version 1 refuses rather than half-renders.

`packages/test-fixtures` now depends on `packages/schemas`. That direction is load-bearing: schema tests build their objects inline so no workspace cycle forms.

An edition cannot be published while any story is unreviewed, making section 20's human-review gate a check rather than a convention.

## Security/privacy impact

Source URLs are restricted to http and https, so a source registry cannot carry `file:`, `javascript:`, or `data:` URLs — the first half of the SSRF surface section 19 addresses, held at the contract as well as at the fetcher.

Text fields are bounded, so untrusted generated output cannot arrive unbounded. Identifiers are lowercase kebab-case, so two ids cannot differ only by case and defeat a uniqueness check.

No user data, telemetry, identifier, or network access is introduced. The package remains dependency-free apart from Zod.

## Product-constitution impact

Reinforces the constitution rather than straining it. The contract has no field for click counts, dwell time, reading history, or predicted engagement, so behavioural ranking has nowhere to live. Interest boosts are explicit reader selections, which section 3.3 permits. Corrections are additive and visible per section 46. The finite edition is expressed structurally: eight core stories, a bounded pool, and no field that could carry a continuation.

## Rollback plan

Revert the commit. Nothing imports the package at runtime yet — neither application depends on it and no content has been authored against it — so removal affects no deployed behaviour and no published data. After content exists, a contract change follows section 16 instead: bump `schemaVersion`, migrate fixtures and content, and keep the previous version readable until the archive is converted.
