# User input needed

This is a handoff ledger for decisions and actions that require a human. The autonomous development loop must append new entries here instead of blocking ordinary implementation. Never put secret values, tokens, private data, or production credentials in this file.

## UI-001 — Review and merge the cumulative PR

- Status: human-only
- Needed from: human reviewer / repository maintainer
- Exact decision or action: Review and merge the current cumulative PR when satisfied with the code, CI, editorial safeguards, and product fit. Current cumulative PR: [PR #40](https://github.com/Faranheit15/aaj-bas/pull/40).
- Why it matters: Agents may prepare and update a PR but must not approve or merge production-bound changes autonomously.
- Safe default: Leave the PR open and ready or draft according to its actual verification state.
- What can continue now: Implementation and verification of remaining unlocked work can continue on the authorized cumulative branch and PR.
- What remains blocked: The final merge and any production deployment triggered by that merge.

## UI-002 — Confirm the daily draft schedule

- Status: non-blocking
- Needed from: product owner / operator
- Exact decision or action: Confirm the desired scheduled time and timezone for opening the daily edition draft PR.
- Why it matters: Edition dates use Asia/Kolkata semantics and the automation should not encode an unintended publication workflow.
- Safe default: 06:00 Asia/Kolkata, opening a draft PR only; no automatic merge or publication.
- What can continue now: Workflow design, deterministic date handling, validation, and tests.
- What remains blocked: Enabling or changing the real production schedule if the repository settings differ from the safe default.

## UI-003 — Confirm production repository and hosting configuration

- Status: blocked
- Needed from: repository/hosting operator
- Exact decision or action: Confirm that the intended GitHub Actions and Cloudflare Pages projects are configured, and that CI may reference the secret names `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
- Why it matters: Deployment configuration is an external production setting and must not be guessed or enabled by an agent.
- Safe default: Keep deployment jobs unchanged or skipped until a human verifies the settings. Never provide secret values in this file or to the coding agent.
- What can continue now: Local builds, workflow review, dry-run generation, and PR-based validation.
- What remains blocked: Enabling, repairing, or validating a real production deployment.

## UI-004 — Unlock or defer feedback transport and server-side infrastructure

- Status: blocked
- Needed from: product owner / architect
- Exact decision or action: Explicitly approve or defer the milestone that would permit AB-302 and/or AB-802 to introduce feedback transport, an edge Worker/backend, persistence, or related infrastructure; an accepted ADR is also required before implementation.
- Why it matters: The current v1 architecture is static-first and explicitly prohibits these additions without a measured requirement, product unlock, and ADR.
- Safe default: Defer AB-302 and AB-802. Do not add Hono, a Worker, D1, a database, authentication, or a server API.
- What can continue now: Static content, editorial pipeline, source health, corrections, safeguards, tests, and documentation that stay within the approved architecture.
- What remains blocked: Any implementation that transmits feedback or adds server-side persistence.

## UI-005 — Approve real source rights and editorial registry inputs

- Status: human-only
- Needed from: editor / product owner
- Exact decision or action: Review and approve the real source registry, attribution wording, permitted inputs, reuse terms, and editorial handling before real news content is published.
- Why it matters: External news content is untrusted and may carry copyright, licensing, provenance, and factual-risk constraints that code cannot approve on a human's behalf.
- Safe default: Keep sample/fixture content and generated drafts non-published; preserve prominent original-source links and uncertainty.
- What can continue now: Schema validation, deterministic fixtures, pipeline safeguards, source-health checks, and draft-only workflow code.
- What remains blocked: Publishing real source-derived editions without editorial and rights review.

## UI-006 — Execute the product pilot

- Status: human-only
- Needed from: product owner / research operator
- Exact decision or action: Run the planned pilot activities for AB-1001, AB-1002, and AB-1003: prepare editions, recruit a consented target cohort, collect feedback, and make the documented go/revise/stop decision.
- Why it matters: Cohort selection, consent, reading behavior, and editorial judgment cannot be simulated honestly by an implementation agent.
- Safe default: Do not claim pilot completion or invent participant feedback.
- What can continue now: Pilot scripts, checklists, fixtures, instrumentation-free evaluation plans, and documentation that do not collect personal data.
- What remains blocked: Human findings, go/revise/stop decisions, and any product changes that depend on pilot evidence.

## UI-007 — Maintain the human editorial and publication gate

- Status: human-only
- Needed from: editor / reviewer
- Exact decision or action: Review each generated or normalized daily draft for factual support, attribution, uncertainty, corrections, source rights, and suitability before merging it for publication.
- Why it matters: Model output and source material are untrusted, and the repository requires human review before publication.
- Safe default: Keep the prior published edition available and leave a failed or questionable draft unmerged.
- What can continue now: Draft generation, validation, blocker reporting, source-support checks, and PR automation that never merges or publishes.
- What remains blocked: Publication of any individual draft that has not passed human review.

## UI-008 — Configure dependency vulnerability scanner plugin (Bun pm scan)

- Status: non-blocking
- Needed from: repository maintainer / security operator
- Exact decision or action: Decide whether to configure a third-party vulnerability scanner plugin in `bunfig.toml` to enable `bun pm scan` for automated CVE checking, or maintain dependency auditing via periodic out-of-band reviews.
- Why it matters: In Bun 1.3.14, `bun pm audit` is not a built-in command, and `bun pm scan` requires an external plugin in `bunfig.toml`. To ensure AB-903 audit claims remain strictly truthful, `scripts/audit-security.ts` verifies lockfile presence (`bun.lock`), the absence of foreign lockfiles (npm/yarn/pnpm), and frozen CI installation (`bun ci`), but does not query an external CVE database.
- Safe default: Rely on canonical `bun.lock`, frozen `bun ci` verification, zero unapproved dependencies, and maintainer dependency version updates. Do not add unvetted third-party scanner plugins without an approved ADR.
- What can continue now: Security audit script (`bun run check:security`), lockfile integrity checks, secret hygiene, CSP enforcement, and all standard repository validation checks.
- What remains blocked: Automated CVE database querying during `bun run check:security` until a scanner plugin is evaluated and approved.

