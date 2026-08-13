# Content

Versioned editorial content lives here. The contract it must satisfy is defined in `packages/schemas` and recorded in ADR-0005.

- `editions/` will contain published static edition JSON.
- `drafts/` will contain reviewable candidate editions.
- `corrections/` will retain visible correction records.

Edition JSON must parse against `editionSchema` before it is published. `packages/test-fixtures` holds the
minimal valid and invalid editions the contract is tested against; the first realistic edition is AB-102.
The only edition authored so far is development sample data, described in `editions/README.md`.
