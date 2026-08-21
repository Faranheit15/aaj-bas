# Content

Versioned editorial content lives here. The contract it must satisfy is defined in `packages/schemas` and recorded in ADR-0005.

- `editions/` will contain published static edition JSON.
- `drafts/` will contain reviewable candidate editions.
- `corrections/` will retain visible correction records.
- `sources.yml` is the source registry: the feeds the content pipeline is permitted to fetch.

Edition JSON must do more than parse against `editionSchema`: it must also pass `bun run content:validate`,
which applies the editorial rules in `packages/domain` — structural, diversity, duplicate, length, URL, and
correction. That command is part of `bun run check`, so a broken edition fails the merge-blocking suite, and
because both deploy jobs depend on that suite, a blocking finding also stops a deployment.

`sources.yml` records which publishers this product may read and the terms review that says it may. It
must pass `bun run sources:validate`, which applies the registry contract and rules in `packages/domain` —
the https-only feed URL, the address and reserved-host classification, the terms review an active source
cannot be missing, and the duplicate checks. That command is part of `bun run check`, so a broken registry
fails the merge-blocking suite exactly as a broken edition does.

Every entry in it today is development sample data on reserved `.invalid` hosts that can never resolve, and
nothing fetches anything yet. Adding a real source is a human procedure: `docs/runbooks/adding-a-source.md`
describes it, and it requires a person to read the publisher's terms page and record what they found. An AI
coding agent must never author `termsUrl`, `termsReviewedOn`, `termsReviewedBy`, `permittedUse`,
`permittedUses`, or `attribution` — writing a plausible permitted-use note asserts a legal review that did
not happen, in the file whose purpose is to record that it did. ADR-0012 records the design and what it cannot promise.

A build stages editions from here into the reader: `bun run content:stage` copies only the publishable ones
into `apps/web/public/content/`, and the `deploy-web` job re-checks those staged bytes with
`bun run content:validate --publish` before upload. The publish profile is wired into CI, not pending.

`packages/test-fixtures` holds the minimal valid and invalid editions the contract is tested against; the
first realistic edition is AB-102. The only edition authored so far is development sample data, described in
`editions/README.md`. It is not publishable, so it is visible in development and never in production, and a
production build stages no edition at all until a real one is authored.
