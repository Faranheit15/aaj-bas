# ADR-0002: Cloudflare Pages continuous deployment

Status: Accepted
Date: 2026-08-11
Owners: Aaj, Bas. maintainers

## Context

The two static applications need repeatable production delivery without weakening the Bun-based quality gate or introducing a runtime service. The repository's production branch is `develop`.

## Decision

Deploy `apps/web` and `apps/landing` as separate Cloudflare Pages Direct Upload projects named `aaj-bas-web` and `aaj-bas-landing`. GitHub Actions builds each app with Bun after the complete `bun run check` job succeeds on a push to `develop`.

The workflow deploys the reader first, then builds the landing application with the reader deployment URL as `VITE_APP_URL`, and finally deploys the landing application. It uses the official `cloudflare/wrangler-action@v3` with repository secrets named `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.

Pull requests run validation only. They cannot access deployment credentials. Deployment jobs have only `contents: read` and `deployments: write` GitHub permissions.

## Alternatives considered

- Cloudflare Pages Git integration: rejected because the repository's Bun checks and deployment ordering should be controlled in one GitHub Actions workflow. Direct Upload also supports the monorepo's independent app build outputs.
- A single Pages project: rejected because landing and reader are independent application surfaces with distinct deployment needs.
- A runtime backend or deployment service: rejected because both apps are static and need no server-side behavior.

## Consequences

The two Pages projects must be created once with `develop` as their production branch, and the required Cloudflare credentials must be stored as GitHub repository secrets. Direct Upload Pages projects cannot later be converted to Cloudflare Git integration; a new Pages project would be required for that change.

Each qualifying push produces deployments recorded in GitHub. Cloudflare Pages deployment history provides the operational rollback surface.

## Security/privacy impact

Cloudflare credentials are repository secrets exposed only to the deployment jobs on trusted pushes to `develop`. Pull-request jobs receive no deployment secrets. `VITE_APP_URL` is a public deployment URL, not a secret. No analytics, user data, backend, database, or authentication are introduced.

## Product-constitution impact

This decision delivers only static application assets. It adds no behavioral tracking, recommendation logic, engagement mechanics, or accumulated reader obligations.

## Rollback plan

Use the Cloudflare Pages deployment history for the affected project to roll back to the prior production deployment. The landing and reader can be rolled back independently. If Direct Upload no longer suits the project, create replacement Pages projects after a new ADR; do not attempt to convert the existing projects to Git integration.
