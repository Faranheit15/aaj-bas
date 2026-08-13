# Aaj, Bas. — Repository Instructions for AI Coding Agents

This file contains binding engineering and product rules for every AI coding agent operating in this repository.

It applies to the entire repository unless a more specific nested `AGENTS.md` explicitly narrows behavior for a subdirectory.

These instructions are not suggestions.

When an implementation request conflicts with this file, stop the conflicting implementation, explain the conflict, and choose the smallest compliant solution unless a human explicitly changes the governing requirement.

This file is agent-tool agnostic and is the single source of truth. Codex reads it directly; Claude Code loads root `CLAUDE.md`, which imports it and adds only tool-specific notes.

Add or change binding rules here, never in a tool-specific file, where they would drift.

Do not create a root `AGENTS.override.md`. Codex reads it *instead of* this file, silently disabling every rule below.

---

# 1. Product mission

Aaj, Bas. is a finite daily news product.

Its purpose is not to maximize engagement.

Its purpose is to let a reader:

1. understand the important changes of the day;
2. understand why they matter;
3. verify where the information came from;
4. reach a natural end;
5. leave.

The product is successful when users feel sufficiently informed and close it.

Never optimize the product around conventional engagement metrics such as:

- time in app;
- pages per session;
- number of stories consumed;
- repeated daily opens;
- notification opens;
- streak length.

---

# 2. Governing documents

Before implementing a task, read the relevant governing documents.

Authority order:

1. explicit human instruction for the current task;
2. this `AGENTS.md`;
3. `docs/PRODUCT_CONSTITUTION.md`;
4. accepted ADRs in `docs/architecture/decisions/`;
5. current PRD;
6. issue/task acceptance criteria;
7. existing implementation conventions.

A lower-priority document may not silently override a higher-priority document. The single exception: `docs/PRODUCT_CONSTITUTION.md` is canonical for the product commitments themselves. This file ranks above it only for engineering rules, and section 3 restates none of those commitments.

The three repository procedures are defined once in `docs/workflows/`: `check.md`, `slice.md`, and `adr.md`. Claude Code invokes them as `/check`, `/slice`, `/adr`; Codex invokes them as `$check`, `$slice`, `$adr`.

If two governing documents materially conflict, report the conflict rather than guessing.

---

# 3. Product constitution

The constitution is stated canonically in `docs/PRODUCT_CONSTITUTION.md`. The engineering prohibitions below follow from it and are equally binding.

## 3.1 Finite by design

The product must have a real end.

Never introduce:

- infinite scroll;
- automatically loading additional stories;
- endless pagination disguised as scrolling;
- "you may also like" continuation after completion;
- autoplay content;
- feeds designed to prevent completion.

Historical editions may be deliberately navigated by date, but finishing today's edition must not automatically lead into more content.

## 3.2 No engagement manipulation

Do not add:

- streaks;
- badges for repeated use;
- XP or points;
- engagement rewards;
- guilt-based copy;
- forced timers;
- punitive session limits;
- mandatory breathing screens;
- countdown pressure;
- artificial scarcity;
- dark patterns;
- variable-reward mechanics.

## 3.3 No behavioral ranking

Do not rank news based on:

- clicks;
- dwell time;
- reading history;
- behavioral profiles;
- predicted engagement;
- similar-user behavior.

Interest boosts explicitly selected by the user are permitted when the relevant milestone introduces them.

Behavioral personalization is not.

## 3.4 Better context over more content

When choosing between:

- increasing story volume; or
- improving clarity, provenance, context, or trust,

prefer the latter.

## 3.5 No accidental obligations

Do not introduce accumulating queues such as:

- unread counters;
- bookmark backlogs;
- saved-for-later pressure;
- daily task lists;
- incomplete-content guilt.

Such features require explicit product approval.

---

# 4. Current v1 architecture

The repository is intentionally static-first.

Approved architecture:

```text
GitHub monorepo
│
├── apps/landing
│   └── React + Vite
│
├── apps/web
│   └── React + Vite
│
├── packages/*
│   └── shared TypeScript
│
├── content/*
│   └── versioned content-as-code
│
├── scripts/*
│   └── repository checks and future content automation
│
└── GitHub Actions
    └── CI and future scheduled content workflows
```

Hosting target:

```text
apps/landing → Cloudflare Pages
apps/web     → Cloudflare Pages
```

`develop` is the production branch: a push to it deploys both applications to Cloudflare Pages (ADR-0002).

Content is initially versioned JSON in Git.

The product does not require an application API for ordinary edition reads.

---

# 5. Technology baseline

Use:

- Bun;
- Bun workspaces;
- TypeScript;
- ESM;
- React;
- Vite;
- Zod;
- Vitest;
- React Testing Library where needed;
- Playwright (end-to-end) and axe-core (accessibility) — neither is installed; adding either requires an ADR;
- Biome for formatting and linting;
- GitHub Actions;
- plain CSS and CSS custom properties.

Do not silently substitute competing technologies.

---

# 6. Explicitly prohibited architecture in v1

Do NOT introduce without an approved ADR and an explicitly unlocked product milestone:

- FastAPI;
- Express;
- NestJS;
- Next.js;
- another runtime backend;
- PostgreSQL;
- MySQL;
- MongoDB;
- Redis;
- Firebase;
- Supabase;
- authentication;
- OAuth;
- user accounts;
- server-side sessions;
- React Native;
- Expo;
- native mobile applications;
- GraphQL;
- Kafka or message queues;
- microservices;
- Turborepo;
- Nx;
- Docker as an application requirement;
- Kubernetes;
- infrastructure-as-code platforms.

A tool being popular or convenient is not enough reason to introduce it.

Architecture must solve a current, measured problem.

---

# 7. Backend rule

Do not add an always-running backend merely to serve static content.

The current default content path is:

```text
published JSON
    ↓
static hosting/CDN
    ↓
web application
```

If a future requirement truly needs server-side behavior, first determine whether a small edge Worker is sufficient.

A conventional backend becomes justified only when a concrete approved requirement cannot reasonably be solved by static content, local state, build-time automation, or a small edge function.

Do not create placeholder API layers "for future flexibility."

---

# 8. Package manager rules

Bun is the only JavaScript/TypeScript package manager.

Allowed:

```bash
bun install
bun ci
bun add
bun remove
bun run
bunx
```

Do not create or commit:

```text
package-lock.json
pnpm-lock.yaml
yarn.lock
```

`bun.lock` must be committed.

CI must use `bun ci` or equivalent frozen-lockfile behavior.

Do not use npm, pnpm, or Yarn commands in documentation, CI, scripts, or agent responses.

---

# 9. Monorepo rules

Use native Bun workspaces.

Do not add a monorepo orchestration framework unless an accepted ADR demonstrates that Bun workspaces no longer meet a measured need.

Workspace packages should have clear ownership.

Expected top-level structure:

```text
apps/
packages/
content/
prompts/
scripts/
docs/
.github/
.claude/
.codex/
.agents/
```

Applications may depend on shared packages.

Shared packages must never depend on applications.

Avoid circular workspace dependencies.

---

# 10. Package responsibilities

## `apps/landing`

Public marketing/positioning surface.

Responsibilities:

- explain the product;
- attract the intended audience;
- link to the product.

It must remain extremely lightweight.

It is not a content publication platform.

Do not turn it into a marketing CMS.

## `apps/web`

The actual reader-facing product.

It owns:

- application composition;
- page-level UI;
- browser state integration;
- edition consumption experience.

Business contracts belong in shared packages rather than being duplicated here.

## `packages/schemas`

Single source of truth for public data contracts.

It may depend on Zod.

It must not depend on:

- React;
- browser APIs;
- application packages.

## `packages/domain`

Pure product/domain behavior.

Prefer deterministic functions.

Avoid network, filesystem, browser, and UI dependencies.

## `packages/ui`

Small reusable presentation primitives.

It must not become a large design-system project.

It must not contain news ranking, storage, fetching, analytics, or business orchestration.

## `packages/test-fixtures`

Test-only deterministic fixtures.

Production applications must not import this package at runtime.

---

# 11. Dependency policy

Dependencies are architectural decisions.

Do not add a new dependency casually.

Before adding any package:

1. verify the requirement cannot reasonably be met with the platform or existing dependencies;
2. verify the dependency is actively maintained;
3. consider bundle/runtime cost;
4. consider security implications;
5. consider whether it introduces another abstraction or ecosystem;
6. document the decision.

Dependencies outside the approved baseline require an ADR before merge.

Do not install dependencies for functionality that is merely expected in a future milestone.

Prefer zero-dependency implementation when it remains clear and maintainable.

Do not reimplement complex security-sensitive functionality just to avoid a well-established dependency.

---

# 12. TypeScript standards

TypeScript is strict.

Do not weaken compiler settings to make code pass.

Avoid:

```typescript
any
```

Use `unknown` and narrow explicitly.

Do not use:

```typescript
// @ts-ignore
```

unless there is a documented external typing defect and the reason is explained immediately next to it.

Prefer:

- explicit boundaries;
- discriminated unions;
- exhaustive switches;
- immutable data where practical;
- narrow interfaces;
- pure transformations.

Avoid:

- giant generic utility types;
- speculative abstractions;
- unnecessary inheritance;
- clever type gymnastics;
- class hierarchies without a concrete reason.

Public package APIs require explicit types.

---

# 13. Code design rules

Prefer boring code.

Code should be easy for another engineer or coding agent to understand without reconstructing hidden assumptions.

Prefer:

```text
explicit > magical
small > generalized
composition > inheritance
deterministic > stateful
local > global
platform primitive > framework abstraction
```

Do not create abstractions until at least one real use case requires them.

Avoid generic names such as:

```text
Manager
Helper
Service
Utils
Common
Misc
Base
CoreService
```

unless they genuinely describe a coherent responsibility.

One module should have one clear reason to change.

---

# 14. React rules

Use functional components.

Prefer named exports for shared components.

Components should remain small and composable.

Do not add global state management without an approved ADR.

Before introducing a state library, exhaust:

- component state;
- lifted state;
- context for genuinely global low-frequency state;
- URL state;
- localStorage adapters.

Do not use effects for values that can be derived during rendering.

Do not mirror props into state without a concrete synchronization requirement.

Keep data loading separate from presentation where doing so materially improves testability.

---

# 15. Data-access abstraction

UI components must not scatter assumptions about storage paths or future transports.

Use narrow repository/adaptor boundaries when content access is introduced.

Preferred conceptual contract:

```typescript
interface EditionRepository {
  getToday(): Promise<Edition>;
  getByDate(date: string): Promise<Edition>;
}
```

Initial implementation may read static JSON.

A future implementation may use an API.

The UI should not need to know which transport is active.

Do not generalize this into a broad dependency-injection framework.

---

# 16. Schema rules

All public content must validate against shared Zod schemas before use.

The schema package is authoritative.

Do not duplicate interfaces independently in applications.

Derive TypeScript types from schemas wherever appropriate.

A schema change requires:

1. explicit schema-version consideration;
2. compatibility analysis;
3. updated fixtures;
4. updated tests;
5. migration logic where persisted/local data is affected.

Do not silently change a published contract.

Generated summaries may never deploy when blocking schema validation fails.

---

# 17. Local-state rules

v1 user state stays on the user's device.

Do not transmit reading history or preferences to a server unless an approved milestone explicitly introduces that capability.

Persisted local state must eventually be:

- versioned;
- validated;
- safely parsed;
- recoverable from corruption;
- migratable.

Never assume localStorage contents are valid.

Do not store secrets in localStorage.

---

# 18. Content safety and provenance

News content is higher-risk than ordinary application data.

Treat external content as untrusted input.

Never:

- scrape full publisher article pages without explicit approval;
- copy full copyrighted articles;
- store unnecessary full text;
- display publisher photography without permission;
- render RSS HTML directly;
- trust source-supplied HTML;
- assume an RSS feed grants unrestricted reuse rights.

Prefer:

- metadata;
- permitted source descriptions;
- generated summaries based on permitted inputs;
- prominent links to originals;
- clear source attribution.

External content must be sanitized before rendering.

---

# 19. Source fetching security

When source fetching is implemented, protect against SSRF.

The fetcher must eventually enforce:

- source allowlists;
- HTTP/HTTPS restrictions;
- blocked private-network addresses;
- redirect limits;
- response-size limits;
- timeouts;
- content-type validation;
- safe parsing.

Do not build a generic "fetch any URL" endpoint.

---

# 20. AI-generated content rules

Model output is untrusted data.

Never publish generated content merely because an LLM returned syntactically valid text.

When summarization is implemented, model output must be:

1. constrained to a schema;
2. parsed;
3. validated;
4. checked against source inputs;
5. mapped to supporting sources;
6. blocked on validation failure;
7. human-reviewed until an approved milestone changes that rule.

The model must never invent content merely to satisfy a UI layout.

Fallback priority:

1. validated generated summary;
2. permitted normalized publisher description;
3. headline and source links.

Failure must degrade honestly.

Do not fabricate.

---

# 21. AI provider architecture

Use one summarizer interface.

Do not create a multi-provider orchestration framework preemptively.

Provider replacement should be configuration behind a narrow boundary.

A second provider requires a measured reason such as:

- reliability;
- quality;
- cost;
- capacity.

Never send:

- user data;
- secrets;
- personally identifying feedback;
- unpublished private information

to a free-tier model.

---

# 22. Editorial behavior

Code must not silently make editorial-policy decisions.

Ranking logic must be:

- deterministic where possible;
- inspectable;
- documented;
- testable.

Important editorial decisions must not be hidden inside opaque prompts.

When sources disagree, the product must preserve uncertainty rather than force consensus.

Opinion must not be presented as reported fact.

Official statements must not be presented as independently verified reporting.

Corrections must be visible and additive.

Never silently rewrite the historical record of a published factual statement.

---

# 23. Privacy

Default to collecting nothing.

Do not introduce:

- Google Analytics;
- Meta Pixel;
- advertising IDs;
- cross-site tracking;
- session replay;
- fingerprinting;
- third-party behavioral analytics;
- personalized advertising;
- raw IP storage as product analytics.

Any future measurement must be:

- first-party;
- minimal;
- aggregate where possible;
- explicitly justified;
- documented.

Do not add telemetry merely because a framework offers it.

---

# 24. Security

Never expose secrets to client bundles.

Secrets must not appear in:

- source files;
- tests;
- fixtures;
- logs;
- pull-request comments;
- screenshots;
- generated artifacts.

Reference secrets by name and let CI inject them; never read, print, or otherwise access production secret values.

Environment files containing real values must remain ignored.

`.env.example` contains variable names and safe documentation only.

GitHub Actions should use least privilege.

Do not grant write permissions where read permission is enough.

Untrusted pull requests must never receive production secrets.

External links must use appropriate browser security attributes.

Avoid raw HTML rendering.

If raw HTML is ever unavoidable, sanitization must be explicit and tested.

---

# 25. Accessibility

Accessibility is part of correctness.

Target WCAG 2.2 AA.

Every user-facing change must consider:

- semantic HTML;
- heading hierarchy;
- landmarks;
- keyboard operation;
- focus visibility;
- screen readers;
- accessible names;
- reduced motion;
- color contrast;
- touch target size;
- light theme;
- dark theme;
- system theme.

Minimum interactive target should generally be 44x44 CSS pixels.

Do not make critical information color-only.

Do not remove focus outlines without replacing them with a clearly visible accessible focus treatment.

Animation must honor `prefers-reduced-motion`.

---

# 26. User-interface states

Every relevant UI slice must explicitly consider:

- loading;
- success;
- empty;
- error;
- stale;
- offline.

Not every component needs all six states, but every applicable state must be intentionally handled.

Never display stale or cached data as if it were known to be current.

Failure states should preserve the last known good edition whenever possible.

---

# 27. Performance budgets

Performance is a product feature.

Current goals:

- application launch JavaScript under the PRD budget;
- edition JSON under the PRD budget;
- no image required for default story-list Largest Contentful Paint;
- current edition available offline after a successful load when offline support is implemented.

Avoid:

- large UI frameworks;
- unnecessary polyfills;
- large icon libraries;
- client-side libraries for trivial utilities;
- runtime syntax highlighting;
- unnecessary fonts;
- unnecessary images;
- broad imports when narrow imports exist.

A material budget regression must be investigated rather than ignored.

---

# 28. Styling and design

The product should feel calm, textual, fast, and intentionally restrained.

Prefer:

- typography;
- whitespace;
- hierarchy;
- borders;
- subtle background distinctions;
- CSS variables.

Avoid:

- gratuitous gradients;
- glassmorphism;
- excessive shadows;
- attention-seeking motion;
- animated backgrounds;
- carousels;
- autoplay;
- visual clutter.

The landing page should remain particularly minimal.

Do not make the interface visually louder merely because generated UI looks "more polished."

---

# 29. Testing strategy

Tests should protect behavior and contracts, not implementation trivia.

Use:

- unit tests for deterministic logic;
- schema tests for contracts;
- component tests for important user-visible behavior;
- accessibility checks for main flows, and end-to-end tests for critical journeys, once the tooling in section 5 is introduced;
- golden fixtures for future content-processing behavior.

Tests must not depend on:

- live RSS feeds;
- live LLMs;
- live third-party APIs;
- current internet availability.

Use deterministic fixtures.

Avoid excessive snapshot testing.

Do not mock the exact implementation being tested.

---

# 30. Required checks

Before declaring a task complete, run the relevant repository checks.

For normal repository-wide changes:

```bash
bun run check:agents
bun run check:pm
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run build
```

Prefer:

```bash
bun run check
```

when it represents the complete blocking suite.

For dependency installation verification, CI uses:

```bash
bun ci
```

Do not claim a command passed unless it was actually executed.

Do not suppress a failing check merely to complete the task.

---

# 31. Definition of done

A change is done only when:

- task acceptance criteria are met;
- type checking passes;
- lint passes;
- formatting passes;
- relevant unit tests pass;
- relevant integration tests pass;
- relevant end-to-end tests pass where such a suite exists;
- production builds pass;
- accessibility implications have been checked;
- loading, success, empty, error, stale, and offline states are handled where applicable;
- schemas and fixtures are updated where applicable;
- documentation is updated where behavior changed;
- no unauthorized tracking was added;
- no unauthorized dependency was added;
- no architecture was silently expanded;
- product constitution remains satisfied;
- mobile and desktop behavior has been considered for UI work.

"Works on my machine" is not sufficient.

---

# 32. Work sequence for every issue

Follow this sequence.

## Step 1 — Understand

Read:

- the issue;
- acceptance criteria;
- `AGENTS.md`;
- relevant product documentation;
- relevant ADRs;
- surrounding implementation.

Do not start editing after reading only the issue title.

## Step 2 — Scope

Identify the smallest vertical change satisfying the task.

Explicitly identify anything that is out of scope.

Do not expand the task because adjacent improvements are tempting.

## Step 3 — Plan

For non-trivial work, write a concise implementation plan before editing.

Include:

- files likely to change;
- contracts affected;
- tests required;
- relevant failure states;
- risks.

## Step 4 — Implement

Make the smallest coherent implementation.

Do not mix unrelated cleanup into the task.

## Step 5 — Test

Add or update tests.

Run relevant checks.

## Step 6 — Self-review

Review the diff for:

- correctness;
- scope creep;
- accessibility;
- privacy;
- security;
- performance;
- dependency changes;
- schema changes;
- product-constitution violations.

## Step 7 — Report

Respond in the format required by section 51.

Do not hide failed checks.

---

# 33. One issue, one vertical slice

The default unit of work is:

> one issue → one coherent vertical slice → one reviewable pull request.

Do not bundle unrelated backlog items together.

Do not automatically begin the next issue after completing the current one.

If a task reveals a larger architectural need, create or propose an ADR.

Do not silently solve that larger problem inside the current PR.

---

# 34. Architecture Decision Records

Create an ADR when a change introduces or materially alters:

- runtime architecture;
- data persistence;
- authentication;
- deployment topology;
- third-party infrastructure;
- significant dependencies;
- API contracts;
- schema compatibility;
- security model;
- privacy model;
- AI provider strategy;
- major package boundaries.

Do not use ADRs as bureaucracy for trivial implementation details.

An ADR must explain:

- context;
- decision;
- alternatives;
- consequences;
- security/privacy effect;
- product-constitution effect;
- rollback plan.

Architecture should be reversible wherever practical.

---

# 35. Do not refactor unrelated code

A feature task is not permission to reorganize the repository.

Avoid opportunistic:

- renaming;
- dependency upgrades;
- formatting unrelated directories;
- package movement;
- abstraction rewrites;
- architecture modernization.

If unrelated technical debt is discovered, report it separately.

Fix it only when required for the assigned task or explicitly requested.

---

# 36. Dependency upgrades

Do not perform broad dependency upgrades during unrelated feature work.

When upgrading a dependency:

- state why;
- review changelog/release notes when material;
- update the lockfile;
- run relevant regression checks;
- verify bundle impact for frontend runtime dependencies.

Do not use "latest everything" as maintenance strategy.

---

# 37. Error handling

Failures should be explicit and actionable.

Do not:

- swallow errors silently;
- return empty success states after failures;
- hide validation failures;
- turn exceptions into misleading content.

Where possible distinguish:

- network failure;
- parsing failure;
- validation failure;
- content unavailable;
- stale content;
- authorization failure when future authenticated systems exist.

User-facing error messages should not reveal internal secrets or stack traces.

---

# 38. Logging

Logs are operational tools, not data collection.

Do not log:

- secrets;
- tokens;
- full user-provided private text;
- unnecessary IP addresses;
- personal identifiers;
- full third-party copyrighted content.

Prefer structured, bounded operational logs.

Generated-content pipelines should log enough metadata to diagnose stages without dumping source bodies or secrets.

---

# 39. Comments and documentation

Comments should explain why, not narrate obvious syntax.

Document:

- unusual constraints;
- security assumptions;
- editorial rules;
- compatibility decisions;
- intentionally non-obvious behavior.

Do not generate verbose comments for self-explanatory code.

Public shared APIs should be understandable without reading their implementation.

---

# 40. Naming

Use names that describe domain meaning.

Prefer:

```text
Edition
Story
SourceReference
Correction
Interest
EditionRepository
```

over generic infrastructure terminology.

Keep acronyms limited to widely understood technical terms.

Do not encode temporary implementation details into long-lived domain names.

---

# 41. Dates and time

News is date-sensitive.

When date behavior is implemented:

- use explicit timezone rules;
- store machine timestamps in unambiguous formats;
- keep edition-date semantics separate from timestamp semantics;
- test date-boundary behavior;
- avoid relying on the developer machine's local timezone.

The initial editorial timezone is Asia/Kolkata unless a later approved product decision changes it.

Use ISO formats for serialized dates/timestamps.

---

# 42. External services

Every external service is a failure mode.

Before integrating one, answer:

1. What current requirement needs it?
2. Can the product work when it is unavailable?
3. What data is sent to it?
4. What does it cost at current and future scale?
5. How can it be replaced?
6. What happens if its free tier disappears?

Do not couple core product availability to an unnecessary external service.

---

# 43. Free-tier architecture principle

Zero-cost infrastructure is a current constraint, not an excuse for fragile design.

Prefer architectures that:

- scale to zero;
- cache naturally;
- degrade gracefully;
- have deterministic fallbacks;
- are easy to migrate.

Never encode current free-tier quotas as permanent business logic.

Keep provider-specific behavior behind narrow interfaces.

---

# 44. GitHub Actions security

Workflows must use least privilege.

Prefer explicit:

```yaml
permissions:
  contents: read
```

when no write access is required.

Grant write permissions only to the specific workflow that needs them.

Do not expose production secrets to workflows triggered from untrusted forks.

Third-party GitHub Actions should be well-established and minimized.

Content automation must never push unvalidated generated editions directly to `develop` or `main`.

Human review remains the publication gate until an approved milestone says otherwise.

---

# 45. Generated content workflow

When daily-generation automation exists, the expected lifecycle is:

```text
fetch
  ↓
normalize
  ↓
deduplicate
  ↓
cluster
  ↓
rank
  ↓
generate candidate summaries
  ↓
validate
  ↓
create draft
  ↓
open pull request
  ↓
human review
  ↓
merge
  ↓
publish
```

Validation failure must never be converted into automatic success.

A failed daily run must leave the prior published edition available.

---

# 46. Corrections

Published news requires an auditable correction mechanism.

When correction functionality exists:

- corrections are timestamped;
- corrections are visible;
- correction history is retained;
- previously published versions remain recoverable from Git;
- silent factual rewrites fail validation or review.

Never erase evidence that a correction occurred.

---

# 47. Things agents must never do autonomously

Without explicit human authorization, do not:

- deploy to production;
- purchase services;
- register domains;
- create paid infrastructure;
- enable billing;
- rotate production secrets;
- delete production data;
- remove correction history;
- bypass CI;
- push or merge to `develop` (the production branch) or `main`;
- weaken security controls;
- weaken type checking;
- disable tests;
- add tracking;
- introduce authentication;
- add a database;
- switch frameworks;
- add a backend;
- publish AI-generated news directly.

Prepare changes for human review instead.

---

# 48. Scope-creep test

Before adding something not directly requested, ask:

> Is this necessary for the acceptance criteria of the current issue?

If no, do not implement it.

If it appears architecturally valuable, document it as a follow-up or ADR proposal.

Do not turn future possibilities into present infrastructure.

---

# 49. Product decision test

Before adding a user-facing behavior, ask:

> Does this make it easier for the reader to understand today's news and leave?

If it makes leaving materially harder, it is presumptively incompatible with the product.

Stop and request explicit product approval.

---

# 50. Engineering decision test

Before adding infrastructure, ask:

> What current user or operational problem requires this?

If there is no concrete answer, do not add it.

---

# 51. Final response format for agents

After completing implementation work, respond with:

```text
## Completed
What changed.

## Decisions
Important implementation choices.

## Validation
Exact commands/tests actually run and results.

## Files changed
Material files/directories changed.

## Risks / limitations
Anything the human reviewer should know.

## Deferred
Related work intentionally not included.
```

Do not claim tests were run if they were not.

Do not conceal limitations.

Do not automatically begin another backlog item.

---

# Final rule

Aaj, Bas. should remain unusually small, unusually understandable, and unusually easy to stop using.

The same principle applies to its codebase.

Do not build infrastructure, abstractions, features, or engagement mechanics merely because you can.

Build the smallest reliable system that satisfies the current requirement, make it easy to verify, and stop.
