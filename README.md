# Aaj, Bas.

Aaj, Bas. is a finite daily news product for people who want to understand the important changes of the day, check the sources, and get on with their day.

The product is deliberately not a feed. A completed edition is the intended outcome: ten important stories, useful context, visible sources, and a clear end.

## Architecture

This repository is a Bun workspace monorepo. It contains two static React + Vite applications, small shared TypeScript packages, versioned content directories, and GitHub Actions CI/CD. Cloudflare Pages hosts the applications through direct uploads from GitHub Actions.

There is intentionally no runtime backend, database, authentication, or analytics. Published content is versioned in Git and served as static files: `bun run content:stage` copies the editions a build may carry into `apps/web/public/content/`, and the reader fetches them from there.

## Repository structure

```text
apps/
  landing/        Public positioning page
  web/            Reader application: today's edition and the dated archive
packages/
  domain/         Pure product behavior; the edition validation rule engine
  logger/         Developer console logging
  schemas/        Public Zod content contracts for published editions
  ui/             Small reusable presentation primitives and the shared colour palette
  test-fixtures/  Deterministic test-only editions and data
content/          Versioned editions, drafts, and corrections; a build stages these into the reader
prompts/          Future versioned editorial prompts
scripts/          Repository check scripts, edition validation, and content staging; future content automation
docs/             Product, editorial, runbook, and architecture documentation
docs/workflows/   Shared procedures every agent harness follows
.claude/          Claude Code permissions, hooks, and repository commands
.codex/           Codex project configuration, hooks, and command policy
.gemini/          Gemini CLI settings, hooks, and repository commands
.agents/          Shared skills plus Antigravity rules, workflows, hooks, and agents
.github/          CI/CD workflow, dependency updates, issue and pull-request templates, code owners
```

## Prerequisites

- [Bun 1.3.14](https://bun.sh/)
- `jq`, only for the optional Claude Code hooks in `.claude/settings.json`. Without it the hooks exit quietly; `bun run check` is unaffected.

## Install

```bash
bun ci
```

## Develop

Run the public landing page:

```bash
bun run dev:landing
```

Run the reader application:

```bash
bun run dev:web
```

That stages content before starting Vite, with sample data included, so the reader renders the sample edition in `content/editions/` locally. A production build stages published editions only — see [Deployment](#deployment). `apps/web/public/content/` is a build artifact and is git-ignored; it is rebuilt on every `dev` and `build`.

Set `VITE_APP_URL` in a local `.env` file at the repository root when the landing-page CTA should point to a reader deployment. `apps/landing/vite.config.ts` sets `envDir` to the repository root, so the landing build reads that file rather than one inside `apps/landing/`. See `.env.example`; no production URL is assumed in this repository.

## Validate

```bash
bun run check:agents
bun run check:pm
bun run format:check
bun run lint
bun run typecheck
bun run content:validate
bun run sources:validate
bun run test
bun run build
bun run check
bun run check:security
bun run check:perf
bun run e2e
```

`bun run content:stage` is deliberately not in that list. It writes a build artifact rather than checking anything, and `bun run build` invokes it, so running it separately verifies nothing the suite does not already cover. Run it directly only to inspect what a build would stage.

`bun run content:validate` checks every edition in `content/editions/` against `editionSchema` and the editorial rules in `packages/domain` — structural, diversity, duplicate, length, URL, and correction — exiting non-zero on a blocking finding and printing advisory warnings otherwise; it takes explicit paths instead of the default directory, `--json` for a machine-readable report, and `--publish`, which additionally treats a not-publishable edition as fatal. CI runs the `--publish` mode over the staged bytes before uploading the reader.

`bun run sources:validate` checks `content/sources.yml`, the list of feeds the content pipeline is permitted to fetch, against the registry contract and rules in `packages/domain` — an https-only feed URL, no address literal or private-network name in any spelling, reserved sample hosts kept apart from real ones, and the terms review an active source cannot be missing — exiting non-zero on a blocking finding, and exiting 3 rather than 0 when it found no registry or no entries to check. `--json` writes a machine-readable report to stdout. Adding or changing a source is a human procedure documented in the [adding a source runbook](docs/runbooks/adding-a-source.md). Use `bun run sources:fetch --json` for live transport, feed parsing, and normalized item-count health; use `bun run draft:generate --date <YYYY-MM-DD> --dry-run` when the complete draft pipeline also needs verification.

`bun run check:security` runs an automated audit verifying zero tracking/telemetry SDKs, external link `rel="noopener"` enforcement, strict Content Security Policy (meta tags and `_headers`), absence of raw HTML injection, workflow least-privilege permissions, and secret hygiene.

`bun run check:perf` checks JavaScript, CSS, and Edition JSON gzip bundles against the PRD performance budgets.

`bun run e2e` runs the Playwright test suite verifying the 6 critical user journeys across desktop and mobile browsers.

`bun run format` rewrites files rather than checking them, so it is a fix-up command rather than a validation step.

`bun run check` runs every merge-blocking formatting, linting, type-checking, content-validation, source-registry-validation, unit test, and production-build check.

## Operational Workflows

```bash
bun run sources:fetch       # Fetch approved active sources with SSRF protection
bun run draft:generate      # Generate a daily draft edition JSON and Markdown summary
bun run draft:pr            # Create or update the automated daily draft pull request
bun run edition:publish     # Promote an approved draft edition to published
bun run edition:correct     # Apply an additive correction note to a published edition
bun run edition:rollback    # Rollback latest edition to a previous date or withdraw current
bun run status:generate     # Generate content/status.json static health artifact
bun run golden:evaluate     # Evaluate summarizer against factual grounding golden dataset
bun run edition:smoke       # Smoke-test staged production edition bundle
```

## Deployment

Pull requests and pushes to `develop` run the full CI suite. Because both deploy jobs depend on the `check` job, a blocking validation finding stops a deployment before it starts. A successful push to `develop` deploys `apps/web` and then `apps/landing` to Cloudflare Pages; the landing CTA is built with the reader's stable production URL, so rolling the reader back changes what the CTA serves. The one-time Cloudflare project and GitHub secret setup is documented in the [Cloudflare Pages deployment runbook](docs/runbooks/cloudflare-pages-deployment.md).

Editions reach a reader through a publish gate. The reader's build stages only publishable editions, and the `deploy-web` job then re-runs `bun run content:validate --publish` over the staged bytes — the files about to be uploaded, not the archive they came from — so a defect in the staging script cannot publish content the validator would refuse.

**No edition is publishable today.** The only edition authored in repository history is development sample data, whose every source host is a reserved `.invalid` domain, so a production build stages zero editions and the deployed reader shows its no-edition state. That is the intended outcome, not a failure: nothing invented reaches a reader, and the state disappears on its own when the first real edition is published.

`develop` is protected. Reaching it takes a pull request with a passing `check` job and an approval from a code owner; the maintainer keeps an administrative bypass, because GitHub does not allow approving your own pull request. The ruleset is version-controlled in [`docs/runbooks/develop-ruleset.json`](docs/runbooks/develop-ruleset.json) and applied as described in the [contributions and branch protection runbook](docs/runbooks/contributions-and-branch-protection.md).

## Contributing

Contributions are welcome. [`CONTRIBUTING.md`](CONTRIBUTING.md) covers setup, the single command that has to pass, the review process, and — most usefully before you start building — what gets a change declined. This product rules some things out by design rather than by preference, and it is much better to find that out from the contribution guide than from a review.

Report a security issue privately through a [GitHub security advisory](https://github.com/Faranheit15/aaj-bas/security/advisories/new), never in a public issue. See [`SECURITY.md`](SECURITY.md).

The code is MIT licensed; see [`LICENSE`](LICENSE). Editorial content, generated summaries, and third-party source material are governed separately under `AGENTS.md` section 18.

## AI coding agents

[`AGENTS.md`](AGENTS.md) holds the binding engineering and product rules, and is the single source of truth for every agent tool. Codex and Antigravity read it directly. Claude Code reads [`CLAUDE.md`](CLAUDE.md), and Gemini CLI reads [`GEMINI.md`](GEMINI.md); both entry points import it and add only tool-specific routing notes.

The repository workflows live once in `docs/workflows/`. Claude Code invokes them as `/check`, `/slice`, and `/adr` through `.claude/commands/`; Codex discovers them through `.agents/skills/`; Gemini CLI exposes thin `/check`, `/slice`, `/adr`, and `/review` commands in `.gemini/commands/`; Antigravity exposes the same procedures through `.agents/workflows/`. The review skill is shared too, so a procedure is changed in one place.

`.claude/settings.json` carries Claude Code permission rules and local hooks; `.codex/rules/team.rules`, `.codex/hooks.json`, `.gemini/settings.json`, and `.agents/hooks.json` provide the corresponding native adapters for the other harnesses. The shared `scripts/agent-hook.ts` applies the command policy and safe formatting behavior where the harness exposes the relevant payload. Personal Claude Code overrides belong in the git-ignored `.claude/settings.local.json`.

Two Codex-specific things are worth knowing:

- **Trust the project on first run in a fresh clone.** Codex loads `.codex/` — its configuration and command policy — only after you accept the trust prompt. Until then it runs without the repository's guardrails.
- **Never create a root `AGENTS.override.md`.** Codex reads it *instead of* `AGENTS.md`, which silently disables every rule in this repository. It is git-ignored to make that harder to do by accident.

Codex also caps how much of `AGENTS.md` it reads (32 KiB by default) and truncates the file mid-way with only a log warning, dropping whatever falls past the cutoff — the end of the file, working backwards from the closing rules. `.codex/config.toml` raises that budget for anyone who has trusted the project, and `bun run check:agents` fails the build if the file outgrows the default, so the problem cannot arrive unnoticed. The full compatibility map and first-run notes live in [`docs/agent-harnesses.md`](docs/agent-harnesses.md).

Change rules in `AGENTS.md`; do not restate them in tool-specific files.

## Governing documents

- [Contribution guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Repository instructions](AGENTS.md)
- [Claude Code entry point](CLAUDE.md)
- [Gemini CLI entry point](GEMINI.md)
- [Agent harness compatibility](docs/agent-harnesses.md)
- [Shared agent workflows](docs/workflows/)
- [Product requirements document](docs/PRD.md)
- [Build backlog](docs/BACKLOG.md)
- [Product constitution](docs/PRODUCT_CONSTITUTION.md)
- [Architecture decisions](docs/architecture/decisions/README.md)

## Current scope

The edition content contract is defined (`packages/schemas`, ADR-0005) and enforced by `bun run content:validate` (`packages/domain`). The reader renders an edition at `/` and a dated one at `/edition/YYYY-MM-DD`, reading the staged JSON a build produces. Story cards expand in place to show what changed, why it matters, any uncertainty, and the sources the story rests on, with a link to report a problem with a story.

The repository includes complete implementations for:
- SSRF-safe feed fetching & normalization for RSS 2.0, Atom, and JSON Feed (`packages/domain/src/source-fetching`, `packages/domain/src/feed-normalization`, `scripts/fetch-sources.ts`).
- Offline PWA and ServiceWorker caching (`scripts/build-service-worker.ts`, `apps/web/src/sw.ts`).
- On-device local reading state & theme preferences (`apps/web/src/reader/local-state.ts`).
- AI draft generation with factual support validation (`scripts/generate-draft-edition.ts`, `packages/domain/src/factual-validation`).
- Editorial release pipelines: automated daily draft PRs, publish promotion, additive corrections, and rollbacks (`scripts/open-daily-draft-pr.ts`, `scripts/publish-edition.ts`, `scripts/create-correction.ts`, `scripts/rollback-edition.ts`).
- System health status artifact generation (`scripts/generate-status-artifact.ts`, `content/status.json`).
- Performance budgets & Security auditing (`scripts/check-performance-budget.ts`, `scripts/audit-security.ts`).

Sample data (`content/editions/2026-07-21.json`) is kept isolated in development by the staging engine (`bun run content:stage`). Real daily editions are authored or generated through draft PRs, reviewed by editors, and published via `bun run edition:publish`.
