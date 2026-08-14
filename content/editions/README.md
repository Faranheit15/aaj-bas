# Editions — development sample data

Everything in this directory is development sample data.

The publishers, outlets, institutions, places, people, and events named here are invented. No real organisation is quoted, described, or represented. Every source URL uses the RFC 2606 reserved `.invalid` top-level domain and can never resolve to anything.

This content exists to exercise `editionSchema` in `packages/schemas` and, later, the reader interface. It is not a record of anything that happened. Do not read it as news, quote it, or copy it into anything that is published.

## Files

- `2026-07-21.json` — the sample edition authored for AB-102: ten stories, at least six publishers, and one instance of each state the contract can express.

It is a `corrected` edition at version 2 because that is the only shape the contract permits a correction note to appear in: `editionSchema` requires an edition carrying corrections to have status `corrected` and a version of at least 2. The figure the correction replaced is preserved in the correction note's own `summary` field, which is the archive section 46 asks for: it is part of the published edition, so it reaches every reader and survives any merge strategy. Git history is not that archive here — this edition arrived in a squash merge, which collapses per-commit history, so the version-1 text was never a commit on `develop`.

## Validation

`bun run content:validate` checks every file in this directory against `editionSchema` and the editorial rules in `packages/domain`. It is part of `bun run check`, so a broken edition fails the merge-blocking suite.

This edition is deliberately not publishable. Every source host is a reserved `.invalid` domain, which the `url/sample-data-hosts` rule reads as development sample data: an ordinary run reports it as a warning and exits 0, and `bun run content:validate --publish` treats it as fatal.

The publish profile now gates deployment. `bun run content:stage`, which the reader's build runs, stages only publishable editions into `apps/web/public/content/`, and the `deploy-web` job re-runs `bun run content:validate --publish` over those staged bytes before uploading them. Both refuse this edition, so it is visible in development — `bun run dev:web` stages it with `--include-sample-data` — and never in production. A production build therefore stages zero editions today and the deployed reader renders its no-edition state, which is the correct outcome until a real edition is authored.

`packages/test-fixtures/src/sample-edition.test.ts` still parses this file against the contract and asserts that no source could resolve. The structural, diversity, and correction assertions it used to carry now live in `bun run content:validate`.
