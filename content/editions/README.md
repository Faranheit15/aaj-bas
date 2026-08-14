# Editions — development sample data

Everything in this directory is development sample data.

The publishers, outlets, institutions, places, people, and events named here are invented. No real organisation is quoted, described, or represented. Every source URL uses the RFC 2606 reserved `.invalid` top-level domain and can never resolve to anything.

This content exists to exercise `editionSchema` in `packages/schemas` and, later, the reader interface. It is not a record of anything that happened. Do not read it as news, quote it, or copy it into anything that is published.

## Files

- `2026-07-21.json` — the sample edition authored for AB-102: ten stories, at least six publishers, and one instance of each state the contract can express.

It is a `corrected` edition at version 2 because that is the only shape the contract permits a correction note to appear in: `editionSchema` requires an edition carrying corrections to have status `corrected` and a version of at least 2. Running `git log -p content/editions/2026-07-21.json` shows the version-1 text the correction replaced, which is the archive section 46 asks for.

`packages/test-fixtures/src/sample-edition.test.ts` validates this file. AB-103 will replace those checks with `bun run content:validate` across every edition here.
