# Operational Runbooks

This directory contains procedures and runbooks for operating and maintaining Aaj, Bas.

## Operations & Incidents

- [Adding a source to the registry](adding-a-source.md) — How to add, validate, and verify a new news source in `content/sources.yml`.
- [Handling a source outage](source-outage.md) — Remediation steps when an RSS/Atom/JSON feed fails or degrades.
- [Recovering from a missed edition](missed-edition.md) — Manual generation and fallback procedures when scheduled daily generation fails.
- [Correcting a bad summary](bad-summary.md) — Publishing visible, additive corrections for factual inaccuracies in accordance with ADR-0014.
- [Rolling back an edition](edition-rollback.md) — Emergency rollback to a prior edition or withdrawing a broken edition using `rollback-edition.ts`.
- [Offline resilience verification](offline-verification.md) — Procedures for testing service worker caching and offline presentation under airplane mode.
- [Cloudflare Pages deployment](cloudflare-pages-deployment.md) — Architecture and deployment verification for Cloudflare Pages (ADR-0002).
- [Contributions and branch protection](contributions-and-branch-protection.md) — Git branching model, pull request workflow, and branch protection rules.
