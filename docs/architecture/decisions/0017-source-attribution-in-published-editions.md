# ADR-0017: Source attribution in published editions

Status: Proposed
Date: 2026-08-30
Owners: Aaj, Bas. maintainers

## Context

The source registry records the credit line required by a reviewed publisher's
terms. Until now, the draft pipeline resolved only publisher, title, URL, type,
and publication time into the public `SourceReference` contract. That meant a
registry could correctly record an attribution requirement while the generated
edition and reader omitted it.

Global Voices is the first active source where this is material: its reviewed
Creative Commons policy requires attribution, the author's name, a link to the
licence, and disclosure that a summary is adapted from the original. The
product must make source provenance visible in the edition and keep older
edition JSON readable.

## Decision

Add optional bounded provenance fields to `SourceReference`: `attribution`,
`authors`, `termsUrl`, and `licenseUrl`. The pipeline copies reviewed registry
terms and credit metadata, and copies feed-provided author names from cited
items. The reader renders these as text and explicit policy/licence links
beneath the source link. The companion draft Markdown includes the source
credit by ID and remains a reviewer artifact; the JSON and reader are the
publication contract.

The field is optional for backward compatibility with schema-version-1
editions that predate registry attribution propagation. Active source registry
entries continue to require an attribution value, while sources without a
registry (legacy deterministic fixtures) remain valid without one.

Stories whose cited sources are all reviewed as `official` are also normalized
to the `official` reporting type before edition validation. This prevents an
official statement from being presented as independently reported journalism.

## Alternatives considered

1. Keep attribution only in `content/sources.yml`. Rejected: readers and
   reviewers would not receive the credit condition in the artifact they are
   evaluating.
2. Put attribution in story prose. Rejected: provenance belongs with the
   source link and would pollute concise editorial copy.
3. Make `attribution` required on every historical `SourceReference`.
   Rejected: it would make already-published schema-version-1 editions fail
   validation without a migration that adds information they never recorded.

## Consequences

- New editions carry the exact reviewed credit line, feed-provided author names
  when available, and links to the reviewed terms/licence pages alongside each
  cited source.
- Existing editions remain parseable because the field is additive and
  optional.
- The reader has a small additional line in expanded source lists.
- Source metadata is copied at draft generation time, so a later registry edit
  does not silently rewrite a published edition.

## Security/privacy impact

Values are bounded plain text from reviewed repository/feed metadata and are
rendered as text, never as HTML. URLs remain validated HTTP(S) links. They
carry no reader data, secrets, or tracking identifier. Missing feed bylines do
not result in invented authors.

## Product-constitution impact

This improves provenance and makes verification easier without adding content,
ranking by behavior, or an engagement loop. The official-source normalization
preserves the distinction between a statement and independent reporting.

## Rollback plan

Stop emitting the optional field and remove the reader presentation in a
follow-up change. Existing editions remain valid because the field is
optional. If a source's terms change, deactivate that registry entry and retain
the already-published attribution in Git history.
