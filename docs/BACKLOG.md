# Aaj, Bas. — AI-Agent Build Backlog

**Companion to:** Product Requirements Document v2.0  
**Execution rule:** One issue, one vertical slice, one reviewable pull request.

---

## 0. Repository constitution

### AB-001 — Initialize monorepo

**Goal:** Create the minimum TypeScript workspace.

**Deliverables**

- Bun workspace;
- `apps/landing` and `apps/web` Vite React applications;
- `packages/domain`, `packages/schemas`, `packages/ui`, and `packages/test-fixtures`;
- strict TypeScript configuration;
- lint, format, test, and build commands;
- CI workflow.

**Acceptance criteria**

- fresh clone installs and builds with documented commands;
- CI runs type check, lint, unit tests, and production build;
- no backend, auth, database, or UI framework is added.

### AB-002 — Add product constitution and agent rules

**Deliverables**

- `docs/PRODUCT_CONSTITUTION.md` as the canonical constitution, with the PRD pointing at it rather than restating it;
- root `AGENTS.md` with scope, privacy, accessibility, dependency, schema, and testing rules;
- ADR template.

**Acceptance criteria**

- agent instructions explicitly reject infinite scroll, behavioral ranking, forced wellbeing mechanics, and unreviewed dependencies;
- repository README links to the constitution.

---

## 1. Content schemas and fixtures

### AB-101 — Define edition schema

**Deliverables**

- Zod schemas for Edition, Story, SourceReference, CorrectionNote, topic, and interest slugs;
- inferred TypeScript types;
- JSON-schema export;
- valid and invalid fixtures.

**Acceptance criteria**

- schema rejects missing source mapping, invalid dates, duplicate IDs, unknown reporting type, and editions without ten standard stories;
- tests cover all required and optional fields;
- schema version is explicit.

### AB-102 — Create a hand-authored sample edition

**Deliverables**

- one realistic edition fixture with ten stories and at least six publishers;
- examples of reporting, analysis, official statement, multi-source, single-source, uncertainty, update, and correction states.

**Acceptance criteria**

- fixture passes schema validation;
- no copyrighted full-text article content or publisher images are included;
- content is clearly marked as development sample data.

### AB-103 — Add edition validation command

**Deliverables**

- `bun run content:validate`;
- structural, diversity, duplicate, length, URL, and correction checks;
- human-readable and machine-readable reports.

**Acceptance criteria**

- command exits non-zero for a blocking failure;
- report identifies the exact story and rule;
- deployment workflow depends on successful validation.

---

## 2. PWA product shell

### AB-201 — Build edition route and shell

**Deliverables**

- `/` loads latest edition;
- `/edition/:date` loads a historical edition file;
- semantic header, main content, and footer;
- stale/cached timestamp indicator.

**Acceptance criteria**

- works without JavaScript hydration failure;
- invalid or missing edition displays a useful error and prior-edition option;
- no pagination or content continuation exists after the edition.

### AB-202 — Build story card

**Deliverables**

- collapsed and expanded states;
- what changed, why it matters, optional background and uncertainty;
- reporting type and confidence labels;
- accessible source list;
- report-issue trigger.

**Acceptance criteria**

- expansion is keyboard operable and screen-reader announced;
- source links open originals safely with appropriate `rel` attributes;
- expanding a card updates local viewed state;
- no publisher image is required for layout stability.

### AB-203 — Build edition progress and ending

**Deliverables**

- neutral progress text;
- end-edition control;
- full and early completion messages;
- next-edition availability text.

**Acceptance criteria**

- reader may end before ten stories;
- no streak, reward animation, timer, guilt copy, or post-completion recommendation is present;
- state persists on reload.

### AB-204 — Progressive interest selection

**Deliverables**

- invitation after two expanded stories or at edition end;
- select up to two interest boosts;
- local selection of two interest stories from the published pool;
- settings control to change preferences.

**Acceptance criteria**

- first edition is usable without choosing interests;
- preferences never leave the device;
- invalid local state falls back to the shared core.

### AB-205 — Theme and accessibility foundation

**Deliverables**

- light, dark, and system themes;
- reduced-motion behavior;
- focus styles and skip link;
- contrast tokens;
- automated axe check.

**Acceptance criteria**

- no serious or critical axe violations in the main flow;
- all actions work with keyboard only;
- touch targets meet minimum size;
- theme preference persists locally.

### AB-206 — Offline support

**Deliverables**

- web app manifest;
- service worker;
- cache current application shell and edition JSON;
- explicit offline and stale states.

**Acceptance criteria**

- after one successful load, the current edition opens in airplane mode;
- a failed update does not delete the last good edition;
- offline state is never misrepresented as current live data.

---

## 3. Local state and migration

### AB-301 — Implement versioned local state

**Deliverables**

- LocalStateV1 adapter;
- safe read/write wrapper;
- migration interface;
- corruption recovery.

**Acceptance criteria**

- malformed storage cannot crash the app;
- viewed state is scoped by edition date;
- tests cover fresh, valid, old-version, and corrupt state.

### AB-302 — Add privacy-respecting event adapter

**Deliverables**

- no-op default adapter;
- documented aggregate event names;
- ability to enable a first-party endpoint by configuration;
- no third-party SDK.

**Acceptance criteria**

- application works identically with analytics disabled;
- payload contains no article text, email, persistent advertising ID, or raw IP field;
- event contract is tested.

---

## 4. Source registry and ingestion

### AB-401 — Define source registry schema

**Deliverables**

- `content/sources.yml` schema;
- required terms/licensing, attribution, region, type, and review fields;
- validator and sample entries.

**Acceptance criteria**

- source cannot be active without a terms-review date and permitted-use note;
- duplicate feed URLs and IDs fail validation;
- private-network and unsupported protocols fail validation.

### AB-402 — Implement safe feed fetcher

**Deliverables**

- conditional requests using ETag and Last-Modified where available;
- redirect and response-size limits;
- timeout, retry, and structured result;
- SSRF protections;
- fixture-based tests.

**Acceptance criteria**

- private IP ranges, localhost, file URLs, and excessive redirects are blocked;
- one failed source does not fail the whole run;
- raw HTML is never passed directly to the UI.

### AB-403 — Normalize and canonicalize feed items

**Deliverables**

- normalized feed item type;
- HTML sanitization to plain text;
- URL canonicalization;
- GUID/content hash generation;
- date normalization.

**Acceptance criteria**

- common tracking query parameters are removed without breaking legitimate URLs;
- duplicate items from the same source collapse;
- invalid dates and oversized descriptions are handled deterministically.

### AB-404 — Generate source-health report

**Deliverables**

- JSON and Markdown summary of success, failure, latency, last publication date, and item count;
- warning thresholds;
- workflow summary output.

**Acceptance criteria**

- report is generated even when some feeds fail;
- no source is automatically removed solely from transient failure;
- action output identifies feeds requiring human review.

---

## 5. Deduplication, clustering, and ranking

### AB-501 — Exact and near-duplicate detection

**Deliverables**

- normalized-title tokens;
- URL and content-hash duplicate rules;
- title-similarity heuristic;
- golden fixtures.

**Acceptance criteria**

- syndicated copies and minor headline rewrites cluster in fixtures;
- unrelated stories sharing one entity do not cluster;
- thresholds are configuration with tests.

### AB-502 — Story clustering pipeline

**Deliverables**

- cluster model with source items and representative title;
- deterministic first pass;
- optional provider interface for semantic assistance;
- confidence score and reasons.

**Acceptance criteria**

- every source item belongs to at most one cluster;
- low-confidence merges remain separate;
- clustering results are reproducible for identical input.

### AB-503 — Candidate ranking and composition

**Deliverables**

- ranking features for recency, source count, novelty, India relevance, source tier, and editorial weight;
- hard composition constraints;
- generated explanation for each selected/rejected candidate.

**Acceptance criteria**

- output includes a core candidate set and topic pools;
- source and topic diversity rules are enforced before scoring preferences;
- no click or user behavior enters the score.

---

## 6. Summary generation and validation

### AB-601 — Add summarizer interface

**Deliverables**

- provider-neutral interface;
- Cloudflare Workers AI adapter or selected pilot adapter;
- deterministic source-description fallback;
- strict timeout and retry policy.

**Acceptance criteria**

- provider can be replaced by configuration;
- API keys never enter the client bundle or logs;
- provider failure yields a reviewable fallback, not a pipeline crash.

### AB-602 — Implement source-mapped prompt

**Deliverables**

- versioned prompt;
- strict JSON output;
- sentence-to-source mappings;
- reporting-type, uncertainty, entity, date, and number extraction.

**Acceptance criteria**

- prompt explicitly forbids unsupported facts and invented context;
- every factual sentence requires at least one source ID;
- prompt version is stored with each draft story.

### AB-603 — Add factual support validators

**Deliverables**

- entity, date, and number containment checks;
- source-mapping check;
- unsupported certainty and opinion-label checks;
- block/warn severity levels.

**Acceptance criteria**

- unseen number or named entity blocks publication by default;
- disagreements produce uncertainty text or a block;
- validator output is included in the draft PR.

### AB-604 — Build prompt golden dataset

**Deliverables**

- at least 50 labeled clusters;
- expected facts, forbidden facts, reporting type, and acceptable summary examples;
- evaluation command and score report.

**Acceptance criteria**

- dataset includes politics, conflict, health, science, business, technology, culture, opinion, and official statements;
- prompt or model changes cannot merge without a regression report;
- severe unsupported-fact rate target is zero on the blocking set.

---

## 7. Daily edition workflow

### AB-701 — Generate draft edition artifacts

**Deliverables**

- dated draft JSON;
- source list;
- validation report;
- selection rationale;
- readable Markdown preview.

**Acceptance criteria**

- output is deterministic apart from explicitly recorded model output;
- all generated files validate;
- a human can review without opening logs.

### AB-702 — Open daily edition pull request

**Deliverables**

- scheduled GitHub Action;
- branch and PR naming convention;
- summary comment with blockers and warnings;
- safe handling when a PR for the date already exists.

**Acceptance criteria**

- workflow never pushes directly to `develop`;
- failed validation still creates a diagnostic artifact but cannot publish;
- secrets are masked.

### AB-703 — Publish on merge

**Deliverables**

- move approved draft to published edition path;
- update `latest.json` atomically;
- deploy static site;
- smoke test deployed edition;
- rollback command.

**Acceptance criteria**

- latest pointer never references an invalid edition;
- failed smoke test rolls back or leaves the prior edition live;
- historical edition URL remains stable.

### AB-704 — Correction workflow

**Deliverables**

- correction-note schema and command;
- edition version increment;
- visible UI treatment;
- correction history test.

**Acceptance criteria**

- corrections are additive and timestamped;
- old version remains recoverable in Git;
- silent modification of a published factual statement fails CI.

---

## 8. Feedback and observability

### AB-801 — Story feedback UI

**Deliverables**

- categories: factual error, misleading wording, broken source, other;
- optional short detail;
- success, error, and offline states.

**Acceptance criteria**

- no account is required;
- form avoids collecting personal data;
- duplicate rapid submissions are prevented locally.

### AB-802 — Minimal feedback Worker

**Deliverables**

- Hono endpoint (a runtime backend; requires an approved ADR and unlocked milestone; see AGENTS.md sections 6 and 7);
- Zod validation;
- edge rate limiting strategy;
- D1 table or durable zero-cost equivalent (data persistence; requires an approved ADR per AGENTS.md section 34 and an unlocked milestone);
- retention job.

**Acceptance criteria**

- payload and text length are bounded;
- content is escaped in any review output;
- raw IP is not stored as product data;
- abuse does not affect edition availability.

### AB-803 — Health and runbook

**Deliverables**

- health endpoint or static status artifact;
- structured workflow logs;
- runbooks for missed edition, bad summary, source outage, and rollback.

**Acceptance criteria**

- a maintainer can restore the prior edition using documented commands;
- source failure and deployment failure are distinguishable;
- no user content or secret appears in logs.

---

## 9. Quality gates

### AB-901 — End-to-end critical flow

**Scenarios**

1. first open → expand two stories → choose interests → finish;
2. returning reader → viewed state restored;
3. end early → respectful end message;
4. offline open after prior load;
5. corrected edition displays note;
6. broken latest edition falls back safely.

**Acceptance criteria**

- tests run on mobile and desktop viewports;
- no scenario relies on a live third-party feed;
- screenshots are saved on failure.

### AB-902 — Performance budget

**Acceptance criteria**

- launch JavaScript remains under the PRD budget;
- edition JSON remains under the PRD budget;
- no image is required for Largest Contentful Paint;
- CI fails on a material budget regression.

### AB-903 — Security review

**Checklist**

- feed SSRF controls;
- HTML sanitization;
- CSP;
- safe external links;
- secret handling;
- dependency audit;
- feedback abuse controls;
- GitHub Action permissions minimized.

**Acceptance criteria**

- review findings are tracked and resolved or explicitly accepted in an ADR;
- workflow tokens use least privilege;
- production secrets are not exposed to pull requests from untrusted forks.

---

## 10. Pilot backlog

### AB-1001 — Publish seven manual editions

**Goal:** Validate the experience before ingestion automation is considered complete.

**Acceptance criteria**

- seven dated editions are published;
- each contains ten stories and at least six source organizations;
- daily editorial time is recorded;
- all reported issues are triaged.

### AB-1002 — Recruit and onboard pilot cohort

**Acceptance criteria**

- at least 25 target readers consent to the closed pilot;
- no participant is forced to create an account;
- survey questions measure sufficient information, trust, clarity, and replacement potential.

### AB-1003 — Evaluate fourteen-day gate

**Deliverables**

- aggregate metrics;
- factual and correction audit;
- qualitative themes;
- go, revise, or stop recommendation;
- ranked post-v1 requests.

**Acceptance criteria**

- evaluation uses the PRD gates without changing thresholds after seeing results;
- feature requests are separated from demonstrated problems;
- no native app, auth, or search work begins before the decision.

---

## 11. Agent review prompt

Use this checklist during `AGENTS.md` section 32 step 6 self-review, and during human review before merge:

1. Does the change preserve a finite daily edition?
2. Does it add any hidden engagement loop, guilt, urgency, or behavioral ranking?
3. Does it expose or collect more user data than necessary?
4. Are source provenance and correction behavior preserved?
5. Can the same outcome be achieved with less infrastructure or fewer dependencies?
6. Are loading, success, empty, error, stale, and offline states handled?
7. Are keyboard, screen-reader, contrast, and reduced-motion needs covered?
8. Are external inputs validated and sanitized?
9. Do tests prove the acceptance criteria rather than implementation details?
10. Does the change belong in v1?

A “no” or “unclear” answer blocks merge until resolved or documented in an ADR.
