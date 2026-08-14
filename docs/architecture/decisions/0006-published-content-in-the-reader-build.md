# ADR-0006: Published content in the reader build

Status: Accepted
Date: 2026-08-14
Owners: Aaj, Bas. maintainers
Accepted by: Faran Mohammad, repository maintainer, in the session that proposed this record.

## Context

AB-201 gives the reader a route that loads an edition. Until now `content/editions/` was data the repository held and nothing served; the deployed applications did not read it, so the question of which editions a build contains had never come up. AB-201 forces it.

The forcing detail is that the only edition in the repository is the AB-102 development sample. Every source it cites is on a reserved `.invalid` host, its publishers are invented, and its stories are fabricated. AB-103 already computes exactly this — `publishable` is false when any blocking finding fired, when `url/sample-data-hosts` fired, or when the file did not parse — and deliberately left the `--publish` profile unwired, recording in `.github/workflows/ci.yml` that it belonged to "the slice that first copies `content/` into a build". This is that slice.

If content reaches the build with no gate, the front page of a live news product renders ten fabricated stories under a masthead. That is a section 18 and section 20 content-safety failure, not a cosmetic one. But the sample edition must still be visible in development, because AB-202 through AB-205 cannot be built against an empty archive.

Two further questions had no answer anywhere. PRD section 12.3 pins `/content/latest.json` as a public path and never says what is in it. And `/edition/:date` is a deep link into a static host, which needs a fallback rule that Cloudflare Pages applies in a way that is easy to get catastrophically wrong.

## Decision

**A build stages editions rather than copying them.** `scripts/stage-content.ts` runs the AB-103 validator over `content/editions/`, selects editions with a pure function in `packages/domain`, and writes the selected set plus a pointer file into `apps/web/public/content/`. It runs inside `apps/web`'s own `dev` and `build` scripts, so no command can produce a build whose content was never selected.

**Selection reads `publishable`; it never recomputes it.** One definition of publishable exists, in AB-103. A second one would drift, and the drift would be invisible until it published something.

**Development uses an explicit, honestly named flag.** `--include-sample-data` stages editions with no blocking finding, which includes the sample. It is passed only in the `dev` script. It changes which files are copied, never what the validator finds or whether a command passes, so it is not the "convert a failure into success" mechanism section 45 forbids.

Three things stop it reaching production, and it is worth being exact about how much each carries, because "three independent barriers" would overstate it. Selection and the CI gate apply **the same predicate** — `publishable`, computed once in AB-103 — at two points: when files are chosen and again on the bytes about to be uploaded. That is defence against a defect in the staging script, not against a blind spot in the predicate, and a blind spot would defeat both at once. The residue sweep is a third mechanism but only bites locally: CI checks out clean and the staged directory is git-ignored, so it never has residue to find. What makes the production path safe on its own is the CI gate; the other two make the local path safe and make a staging bug loud.

**`/content/latest.json` is a pointer, not an edition.** `{ schemaVersion: 1, contentSet, latest: string | null, editions: string[] }`, newest first, defined by `editionIndexSchema` in `packages/schemas` because it is published content. A copy of the latest edition would give one document two URLs, two ETags, and a way to disagree with itself. The pointer can only be wrong about which date it names, and it is written in the same run that copies the files it names.

**`contentSet` is present in both modes**, and the reader says plainly when it is showing sample data. A field that appears only in development lets the two shapes diverge exactly where the difference matters.

**Zero publishable editions is a supported state, not a failure.** `latest` is null, the archive is empty, and the reader renders "No edition has been published yet." That is the honest state of this product today, and AB-201's own acceptance criterion already requires a useful state for a missing edition.

**Routing is hand-rolled from `location.pathname`.** Two routes, no nested layouts, no loaders, and a product that must never grow continuation routing.

**The Cloudflare Pages fallback is narrow.** `/edition` and `/edition/*` rewrite to `index.html`; the reflexive `/*` catch-all is forbidden in this repository, because Pages follows redirects regardless of whether an asset matches the request and a catch-all would swallow `/content/*.json` and every hashed asset.

**Editions are never cached as immutable.** Corrections rewrite a dated file in place and bump `editionVersion`. An `immutable` header on that path would hide corrections from returning readers, turning a caching choice into a section 46 violation.

## Alternatives considered

- **`publicDir: "../../content"`.** Rejected: it maps to `/editions/...`, not the PRD-pinned `/content/editions/...`; it copies drafts, corrections, and READMEs; it cannot filter by `publishable`; and it consumes the one `publicDir` slot `_redirects` and AB-206's manifest need.
- **A copy-plugin dependency.** Rejected under section 11: it buys a `cp` that still cannot select editions or write the pointer, so a program is required regardless.
- **Committing a duplicate of each edition under `apps/web/public/`.** Rejected: two copies in Git that drift, and the publish gate becomes "remember not to copy the sample edition" — a convention rather than a mechanism.
- **Copying into `dist/` after `vite build`.** Rejected: the dev server serves `public/`, not `dist/`, so development would need a second mechanism.
- **Hand-writing `latest.json`.** Rejected: two sources of truth for one fact, and a pointer naming a withdrawn edition is precisely the silent failure this design exists to prevent.
- **Resolving "latest" by probing dates from the browser.** Rejected: it depends on the reader's clock and timezone, issues speculative requests, and cannot work at all here, because the SPA fallback answers a missing edition with 200 and an HTML body.
- **`react-router`.** Rejected under sections 11 and 27. It would work, and the compressed-JavaScript budget would still be met; the objection is that a regex and `history.pushState` already meet the requirement, so the dependency solves no measured problem. Consistency requires naming the larger cost this slice does accept: validating fetched content puts Zod in the reader, about 23 KB gzipped, which is far more than routing would have cost. That is paid for a different reason — section 16 makes the contract the thing that decides whether content may render, and a CDN can serve a stale or truncated file that CI validated perfectly — but the budget argument is not what rejected the router.
- **A pre-rendered HTML file per edition date.** Rejected: it makes the HTML output a function of the archive, rebuilds every date when content changes, and delivers nothing a client-rendered shell does not without SSR, which sections 5 and 6 rule out.
- **Wiring `--publish` into the `check` job.** Rejected: with no publishable edition it would fail every pull request, gating the whole repository suite on the archive rather than on what is being deployed.

## Consequences

The reader deployment now carries content. `apps/web/public/content/` is generated and git-ignored, and Biome excludes it, so a generated artifact is never linted or formatted.

A blocking validation finding now fails the build itself, not only `content:validate`, because staging refuses to proceed. That is intentional: a build that silently produced an empty archive would be an empty success after a failure.

`latest.json` is a second published artifact under `schemaVersion`. Changing its shape follows section 16 exactly as an edition change does.

AB-703's "update `latest.json` atomically" becomes "merge a publishable edition; the build derives the pointer; the deploy is the atomic unit". That is a strengthening rather than a contradiction.

`latest` is the newest staged date, so an edition merged with a future date would go live at the next deploy. Publication scheduling belongs to AB-703 and is recorded here rather than solved.

AB-206 inherits a cache surface of two paths and a `Freshness` model that already distinguishes current, stale, and archived, so an offline variant is an added case rather than a rewrite.

## Security/privacy impact

The gate is the security-relevant part, and its scope should not be overstated. It detects **development sample data by the class of host its sources cite** — reserved domains, and any edition mixing reserved hosts with real ones. It does not detect fabrication. An edition of invented stories citing real publisher hostnames would pass every automated check and deploy. That is by design: sections 20 and 44 put fabrication behind human review of a pull request, and no static rule can tell an invented story from a reported one. The gate closes the accident, not the intent.

The narrow `_redirects` rule is also a safety property. A catch-all would return the HTML shell for `/content/latest.json`, which the reader would then have to interpret, and would mask a withdrawn edition as a parse failure rather than an absence.

Because a missing file is answered with 200 and HTML, the transport checks the response content type before parsing. Without that, "this edition does not exist" and "this edition is corrupt" become indistinguishable, which section 37 forbids.

No user data, no telemetry, no identifier, and no new external service. Editions are fetched from the same origin that served the application.

## Product-constitution impact

Deploying no edition rather than a fabricated one is the constitution's own priority: better context over more content, and provenance a reader can check. A front page of invented news would fail every commitment the product makes.

Routing carries a constitutional constraint of its own. There is no prefetch of adjacent editions and no route reachable from the end of an edition, because fetching the next edition as a reader finishes would be continuation in substance whatever it is called. The prior-edition link exists only where an edition failed to load, and there is exactly one of it.

## Rollback plan

Revert the commit. Staging is invoked from `apps/web`'s scripts, so reverting removes it from every path at once; `apps/web/public/content/` is git-ignored and can be deleted. The deployed site returns to the application shell it served before, which is what is deployed today.

`latest.json` has no consumer outside this repository, so withdrawing it breaks no published contract. Once real editions exist, removing the gate is the change that would need review, not adding it.
