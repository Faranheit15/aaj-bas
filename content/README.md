# Content

Versioned editorial content lives here. The contract it must satisfy is defined in `packages/schemas` and recorded in ADR-0005.

- `editions/` will contain published static edition JSON.
- `drafts/` will contain reviewable candidate editions.
- `corrections/` will retain visible correction records.

Edition JSON must do more than parse against `editionSchema`: it must also pass `bun run content:validate`,
which applies the editorial rules in `packages/domain` — structural, diversity, duplicate, length, URL, and
correction. That command is part of `bun run check`, so a broken edition fails the merge-blocking suite, and
because both deploy jobs depend on that suite, a blocking finding also stops a deployment.

`packages/test-fixtures` holds the minimal valid and invalid editions the contract is tested against; the
first realistic edition is AB-102. The only edition authored so far is development sample data, described in
`editions/README.md`, and the publish profile is what keeps it out of production.
