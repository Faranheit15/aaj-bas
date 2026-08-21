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
docs/workflows/   Shared procedures both agent tools follow
.claude/          Claude Code permissions, hooks, and repository commands
.codex/           Codex project configuration and command policy
.agents/skills/   Codex skills for the repository workflows
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
```

`bun run content:stage` is deliberately not in that list. It writes a build artifact rather than checking anything, and `bun run build` invokes it, so running it separately verifies nothing the suite does not already cover. Run it directly only to inspect what a build would stage.

`bun run content:validate` checks every edition in `content/editions/` against `editionSchema` and the editorial rules in `packages/domain` — structural, diversity, duplicate, length, URL, and correction — exiting non-zero on a blocking finding and printing advisory warnings otherwise; it takes explicit paths instead of the default directory, `--json` for a machine-readable report, and `--publish`, which additionally treats a not-publishable edition as fatal. CI runs the `--publish` mode over the staged bytes before uploading the reader.

`bun run sources:validate` checks `content/sources.yml`, the list of feeds the content pipeline is permitted to fetch, against the registry contract and rules in `packages/domain` — an https-only feed URL, no address literal or private-network name in any spelling, reserved sample hosts kept apart from real ones, and the terms review an active source cannot be missing — exiting non-zero on a blocking finding, and exiting 3 rather than 0 when it found no registry or no entries to check. `--json` writes a machine-readable report to stdout. There is no flag that mutes a rule: adding a real source is a human procedure documented in the [adding a source runbook](docs/runbooks/adding-a-source.md), and every entry today is invented sample data on reserved `.invalid` hosts that can never resolve.

`bun run format` rewrites files rather than checking them, so it is a fix-up command rather than a validation step.

`bun run check` runs every merge-blocking formatting, linting, type-checking, content-validation, source-registry-validation, test, and production-build check.

## Deployment

Pull requests and pushes to `develop` run the full CI suite. Because both deploy jobs depend on the `check` job, a blocking validation finding stops a deployment before it starts. A successful push to `develop` deploys `apps/web` and then `apps/landing` to Cloudflare Pages; the landing CTA is built with the reader's stable production URL, so rolling the reader back changes what the CTA serves. The one-time Cloudflare project and GitHub secret setup is documented in the [Cloudflare Pages deployment runbook](docs/runbooks/cloudflare-pages-deployment.md).

Editions reach a reader through a publish gate. The reader's build stages only publishable editions, and the `deploy-web` job then re-runs `bun run content:validate --publish` over the staged bytes — the files about to be uploaded, not the archive they came from — so a defect in the staging script cannot publish content the validator would refuse.

**No edition is publishable today.** The only edition authored so far is development sample data, whose every source host is a reserved `.invalid` domain, so a production build stages zero editions and the deployed reader shows its no-edition state. That is the intended outcome, not a failure: nothing invented reaches a reader, and the state disappears on its own when the first real edition is published.

`develop` is protected. Reaching it takes a pull request with a passing `check` job and an approval from a code owner; the maintainer keeps an administrative bypass, because GitHub does not allow approving your own pull request. The ruleset is version-controlled in [`docs/runbooks/develop-ruleset.json`](docs/runbooks/develop-ruleset.json) and applied as described in the [contributions and branch protection runbook](docs/runbooks/contributions-and-branch-protection.md).

## Contributing

Contributions are welcome. [`CONTRIBUTING.md`](CONTRIBUTING.md) covers setup, the single command that has to pass, the review process, and — most usefully before you start building — what gets a change declined. This product rules some things out by design rather than by preference, and it is much better to find that out from the contribution guide than from a review.

Report a security issue privately through a [GitHub security advisory](https://github.com/Faranheit15/aaj-bas/security/advisories/new), never in a public issue. See [`SECURITY.md`](SECURITY.md).

The code is MIT licensed; see [`LICENSE`](LICENSE). Editorial content, generated summaries, and third-party source material are governed separately under `AGENTS.md` section 18.

## AI coding agents

[`AGENTS.md`](AGENTS.md) holds the binding engineering and product rules, and is the single source of truth for every agent tool. Codex reads it directly. Claude Code reads [`CLAUDE.md`](CLAUDE.md), which imports `AGENTS.md` and adds only tool-specific notes.

The three repository workflows live once in `docs/workflows/`. Claude Code invokes them as `/check`, `/slice`, and `/adr` through `.claude/commands/`; Codex invokes the same procedures as `$check`, `$slice`, and `$adr` through `.agents/skills/`. Both sides are thin pointers, so a procedure is changed in one place.

`.claude/settings.json` carries permission rules and local hooks; `.codex/rules/team.rules` carries the equivalent command policy for Codex. Both encode the `AGENTS.md` rules a command policy can enforce: Bun-only package management, and no deployment or secret commands from an agent session. The Claude Code file additionally blocks reading local environment files, which a command policy cannot express. Personal Claude Code overrides belong in the git-ignored `.claude/settings.local.json`.

Two Codex-specific things are worth knowing:

- **Trust the project on first run in a fresh clone.** Codex loads `.codex/` — its configuration and command policy — only after you accept the trust prompt. Until then it runs without the repository's guardrails.
- **Never create a root `AGENTS.override.md`.** Codex reads it *instead of* `AGENTS.md`, which silently disables every rule in this repository. It is git-ignored to make that harder to do by accident.

Codex also caps how much of `AGENTS.md` it reads (32 KiB by default) and truncates the file mid-way with only a log warning, dropping whatever falls past the cutoff — the end of the file, working backwards from the closing rules. `.codex/config.toml` raises that budget for anyone who has trusted the project, and `bun run check:agents` fails the build if the file outgrows the default, so the problem cannot arrive unnoticed.

Change rules in `AGENTS.md`; do not restate them in tool-specific files.

## Governing documents

- [Contribution guide](CONTRIBUTING.md)
- [Security policy](SECURITY.md)
- [Repository instructions](AGENTS.md)
- [Claude Code entry point](CLAUDE.md)
- [Shared agent workflows](docs/workflows/)
- [Product requirements document](docs/PRD.md)
- [Build backlog](docs/BACKLOG.md)
- [Product constitution](docs/PRODUCT_CONSTITUTION.md)
- [Architecture decisions](docs/architecture/decisions/README.md)

## Current scope

The edition content contract is defined (`packages/schemas`, ADR-0005) and enforced by `bun run content:validate` (`packages/domain`). The reader renders an edition at `/` and a dated one at `/edition/YYYY-MM-DD`, reading the staged JSON a build produces. Story cards expand in place to show what changed, why it matters, any uncertainty, and the sources the story rests on, with a link to report a problem with a story. The repository deliberately does not yet include content fetching, RSS ingestion, LLM integration, local reading state, or PWA support. No real edition has been authored: `content/editions/` holds development sample data only, which the publish profile keeps out of production, so the deployed reader currently shows its no-edition state.
