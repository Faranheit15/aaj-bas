# Aaj, Bas.

Aaj, Bas. is a finite daily news product for people who want to understand the important changes of the day, check the sources, and get on with their day.

The product is deliberately not a feed. A completed edition is the intended outcome: ten important stories, useful context, visible sources, and a clear end.

## Architecture

This repository is a Bun workspace monorepo. It contains two static React + Vite applications, small shared TypeScript packages, versioned content directories, and GitHub Actions CI/CD. Cloudflare Pages hosts the applications through direct uploads from GitHub Actions.

There is intentionally no runtime backend, database, authentication, or analytics. Published content will be versioned in Git and served as static files.

## Repository structure

```text
apps/
  landing/        Public positioning page
  web/            Reader application shell
packages/
  domain/         Future pure product behavior
  schemas/        Future public Zod content contracts
  ui/             Small reusable presentation primitives
  test-fixtures/  Deterministic test-only data
content/          Versioned editions, drafts, and corrections
prompts/          Future versioned editorial prompts
scripts/          Repository check scripts; future content automation
docs/             Product, editorial, runbook, and architecture documentation
docs/workflows/   Shared procedures both agent tools follow
.claude/          Claude Code permissions, hooks, and repository commands
.codex/           Codex project configuration and command policy
.agents/skills/   Codex skills for the repository workflows
.github/          CI/CD workflow and pull-request template
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

Run the reader application shell:

```bash
bun run dev:web
```

Set `VITE_APP_URL` in a local `.env` file at the repository root when the landing-page CTA should point to a reader deployment. `apps/landing/vite.config.ts` sets `envDir` to the repository root, so the landing build reads that file rather than one inside `apps/landing/`. See `.env.example`; no production URL is assumed in this repository.

## Validate

```bash
bun run check:agents
bun run check:pm
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run build
bun run check
```

`bun run format` rewrites files rather than checking them, so it is a fix-up command rather than a validation step.

`bun run check` runs every merge-blocking formatting, linting, type-checking, test, and production-build check.

## Deployment

Pull requests and pushes to `develop` run the full CI suite. A successful push to `develop` deploys `apps/web` and then `apps/landing` to Cloudflare Pages; the landing CTA is built with the deployed reader URL. The one-time Cloudflare project and GitHub secret setup is documented in the [Cloudflare Pages deployment runbook](docs/runbooks/cloudflare-pages-deployment.md).

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

- [Repository instructions](AGENTS.md)
- [Claude Code entry point](CLAUDE.md)
- [Shared agent workflows](docs/workflows/)
- [Product requirements document](docs/PRD.md)
- [Build backlog](docs/BACKLOG.md)
- [Product constitution](docs/PRODUCT_CONSTITUTION.md)
- [Architecture decisions](docs/architecture/decisions/README.md)

## Current scope

This is foundation work only. The repository deliberately does not yet include an edition schema, news UI, content fetching, RSS ingestion, LLM integration, local reading state, or PWA support. Deployment is limited to static application shells.
