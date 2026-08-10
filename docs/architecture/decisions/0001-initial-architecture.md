# ADR-0001: Initial architecture

Status: Accepted
Date: 2026-08-10
Owners: Aaj, Bas. maintainers

## Context

Aaj, Bas. needs a small, auditable foundation for a landing page, a reader application, shared TypeScript contracts, and future content-as-code work. The product constitution requires a finite, privacy-respecting product and rejects premature platform infrastructure.

## Decision

Use Bun 1.3.14 and native Bun workspaces in one TypeScript monorepo. Use React + Vite for two static applications: `apps/landing` for public positioning and `apps/web` for the reader experience. Use plain CSS and CSS custom properties.

Keep shared code in `packages/domain`, `packages/schemas`, `packages/ui`, and `packages/test-fixtures`. Store future edition content in Git under `content/`. Use GitHub Actions for CI. Cloudflare Pages is the future static-hosting target.

The baseline dependencies are React and React DOM for the applications; Vite and its React plugin for static builds; TypeScript for strict checking; Zod for future shared content validation; Vitest, React Testing Library, Jest DOM, and jsdom for deterministic component tests; and Biome for formatting and linting.

Do not introduce a runtime backend, database, authentication, Turborepo, or Nx.

## Alternatives considered

- A runtime API and database: rejected because ordinary edition reads are static content reads.
- Authentication and server-side state: rejected because v1 works without accounts and local preferences remain on-device.
- Turborepo or Nx: rejected because native Bun workspaces meet the current coordination need.
- A larger UI framework: rejected because the two initial interfaces need only restrained, text-first presentation.

## Consequences

Applications must access published content through narrow static-content boundaries when that work begins. Shared packages must not depend on applications. Content changes remain reviewable through Git history, and any future server-side behavior must be justified independently.

## Security/privacy impact

No secrets, user accounts, database, analytics, or runtime API are added. The static-first design minimizes exposed services. Future content validation belongs in the shared schema boundary.

## Product-constitution impact

The decision supports a small, finite reader product without engagement infrastructure or behavioral ranking. It keeps generated editions reviewable in Git before publication.

## Rollback plan

The applications can be deployed independently as static artifacts. Future infrastructure or dependency decisions require their own ADRs and can be removed without migrating user accounts or server-held reading history.
