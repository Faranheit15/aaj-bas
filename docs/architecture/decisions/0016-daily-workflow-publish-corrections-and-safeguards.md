# ADR-0016: Daily Edition Workflow, Publish on Merge, Additive Corrections, and Quality Safeguards

## Status

Accepted

## Context

Aaj, Bas. is a finite daily news product that requires a robust, reproducible production pipeline operating from ingestion to published static web reader.

Earlier architectural decisions established:
- The static-first monorepo and CI/CD topology (ADR-0001, ADR-0002).
- Pure domain boundaries for candidate ranking, clustering, and summarization (ADR-0013, ADR-0014, ADR-0015).
- Zero-tracking and privacy commitments (ADR-0003, ADR-0011).
- Offline-first ServiceWorker architecture (ADR-0010).

To complete the operational and quality lifecycle (Milestones 7, 8, 9), the repository requires:
1. Automated daily draft pull requests via GitHub Actions (AB-702).
2. Promotion of approved drafts to published editions upon merge, with smoke tests and rollback mechanisms (AB-703).
3. Strict additive correction workflow preventing silent historical modification (AB-704).
4. Privacy-respecting story feedback and local duplicate suppression (AB-801).
5. Operational runbooks and static health status artifacts (AB-803).
6. End-to-end user journey validation (AB-901), performance budget verification (AB-902), and security/privacy audits (AB-903).

## Decision

1. **Daily Draft Automation & Branch Isolation (AB-702)**:
   - A scheduled GitHub Actions workflow (`.github/workflows/daily-draft.yml`) runs daily at 00:30 UTC (06:00 IST) or on manual trigger.
   - It generates the draft edition in `content/drafts/<date>.json`, runs factual and domain validation, pushes to an isolated branch `draft/<date>`, and opens/updates a daily Draft Pull Request titled `Draft Edition: <date>` using GitHub CLI.
   - Uses least-privilege token permissions (`contents: write`, `pull-requests: write`).

2. **Publish on Merge & Static Release Pipeline (AB-703)**:
   - A dedicated promotion tool (`scripts/publish-edition.ts` / `bun run edition:publish`) transitions approved draft editions (`status: "draft"`, `reviewed: false`) to published editions (`content/editions/<date>.json` with `status: "published"`, `reviewed: true`).
   - Merging to `develop` triggers Cloudflare Pages static deployment.
   - Smoke testing (`scripts/smoke-test-edition.ts` / `bun run edition:smoke`) validates index pointers, schema integrity, and core story counts.
   - Rollback tool (`scripts/rollback-edition.ts` / `bun run edition:rollback`) allows instantaneous, safe pointer reversion to earlier known-good editions without downtime or data destruction.

3. **Additive Correction Workflow & Historical Integrity (AB-704)**:
   - Factual corrections must never silently overwrite historical git records or published statements.
   - Corrections are applied via `scripts/create-correction.ts` (`bun run content:correct`), which increments `editionVersion` (>= 2), sets `status: "corrected"`, attaches timestamped `CorrectionNote` records, and updates story timestamps while recording standalone audit trails in `content/corrections/`.
   - Domain validation rejects version bumps without accompanying correction notes.

4. **Privacy-Preserving On-Device Story Feedback (AB-801)**:
   - The reader provides an accessible modal feedback dialog supporting 4 categories (`Factual error`, `Misleading wording`, `Broken source`, `Other`) and optional short detail text.
   - Prevents rapid duplicate submissions on the same story using local on-device session state.
   - Provides offline clipboard copy fallback alongside prefilled GitHub Issues.
   - Zero telemetry, tracking cookies, analytics tokens, or server-side user data storage.

5. **Operational Runbooks & Health Status Artifacts (AB-803)**:
   - Runbooks created in `docs/runbooks/`: `missed-edition.md`, `bad-summary.md`, `source-outage.md`, `edition-rollback.md`.
   - Health status generator (`scripts/generate-status-artifact.ts` / `bun run status:generate`) emits static `content/status.json` adhering to `statusArtifactSchema`.

6. **Quality Safeguards, Performance Budgets, & Security Audits (AB-901, AB-902, AB-903)**:
   - Playwright end-to-end tests (`apps/web/e2e/critical-journeys.spec.ts`) cover the 6 critical user journeys (core read, interest boosts, offline caching, date navigation, theme persistence, and issue reporting).
   - Automated performance budget script (`scripts/check-performance-budget.ts` / `bun run check:perf`) enforces client bundle sizes (Landing < 80 kB gzip, Web < 150 kB gzip, CSS < 25 kB gzip, Edition JSON < 150 kB uncompressed / < 50 kB gzip).
   - Automated security and privacy audit script (`scripts/audit-security.ts` / `bun run check:security`) enforces strict CSP headers, `rel="noopener"`, zero tracking SDKs, zero gamification, zero raw HTML injection, workflow least-privilege permissions, secret hygiene, and canonical `bun.lock` hygiene.
   - Note on dependency audit: Bun 1.3.14 does not include a built-in `bun pm audit` command, and `bun pm scan` requires a custom third-party scanner plugin in `bunfig.toml`. The repository enforces strict lockfile hygiene, frozen installation (`bun ci`), and single-package-manager rules, with external vulnerability scanning tracked in `user-input-needed.md` (UI-008).

## Consequences

### Positive
- Fully automated, safe, and verifiable daily publication pipeline from ingestion to static release.
- Immutable historical integrity with explicit additive corrections.
- Strict performance budgets and security audits prevent silent regressions.
- Complete operational runbooks enable reliable maintainer triage.
- 100% compliant with the product constitution: finite, calm, privacy-first, and truthful.

### Negative / Trade-offs
- Manual editorial review remains required before publishing each edition (a deliberate product invariant).
- Automated CVE vulnerability database scanning is bounded by Bun 1.3.14 tooling capabilities (requiring an external plugin for `bun pm scan` rather than a built-in zero-dependency command).
