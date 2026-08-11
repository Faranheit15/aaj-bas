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
scripts/          Future content automation
docs/             Product, editorial, runbook, and architecture documentation
```

## Prerequisites

- [Bun 1.3.14](https://bun.sh/)

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

Set `VITE_APP_URL` in a local `.env` file when the landing-page CTA should point to a reader deployment. See `.env.example`; no production URL is assumed in this repository.

## Validate

```bash
bun run format
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run build
bun run check
```

`bun run check` runs every merge-blocking formatting, linting, type-checking, test, and production-build check.

## Deployment

Pull requests and pushes to `develop` run the full CI suite. A successful push to `develop` deploys `apps/web` and then `apps/landing` to Cloudflare Pages; the landing CTA is built with the deployed reader URL. The one-time Cloudflare project and GitHub secret setup is documented in the [Cloudflare Pages deployment runbook](docs/runbooks/cloudflare-pages-deployment.md).

## Governing documents

- [Repository instructions](AGENTS.md)
- [Product requirements document](docs/PRD.md)
- [Build backlog](docs/BACKLOG.md)
- [Product constitution](docs/PRODUCT_CONSTITUTION.md)
- [Architecture decisions](docs/architecture/decisions/README.md)

## Current scope

This is foundation work only. The repository deliberately does not yet include an edition schema, news UI, content fetching, RSS ingestion, LLM integration, local reading state, or PWA support. Deployment is limited to static application shells.
