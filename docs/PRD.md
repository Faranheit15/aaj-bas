# Aaj, Bas. — Product Requirements Document

**Version:** 2.0  
**Date:** 10 August 2026  
**Status:** Development baseline  
**Working name:** Aaj, Bas.  
**Tagline:** Today's news. That's enough.

---

## 1. Executive decision

Aaj, Bas. is an India-first, English-language, source-transparent daily news edition. It tells a reader what changed today, why it matters, and where the information came from—in a finite edition of ten stories.

The product is not a live news feed, a social network, a screen-time coach, or a general-purpose RSS reader. Its job is to help a reader feel sufficiently informed in roughly five to eight minutes and then reach a genuine end.

### The v1 bet

People will return to a calm daily edition when it is:

1. finite and predictable;
2. more contextual than social-media headlines;
3. visibly sourced;
4. relevant to India without becoming India-only; and
5. free of engagement mechanics.

### The key differentiation

“Finite news” alone is no longer distinctive. The v1 wedge is:

> **What changed today + why it matters + multiple visible sources + a real finish line.**

---

## 2. Product constitution

The product constitution is binding for every product and engineering decision. It is stated once, canonically, in [`docs/PRODUCT_CONSTITUTION.md`](PRODUCT_CONSTITUTION.md).

It is deliberately not restated here. A second copy would drift, and `AGENTS.md` section 2 ranks these documents by authority, so a divergence would silently change which rule wins.

`AGENTS.md` section 3 lists the concrete engineering prohibitions that follow from the constitution.

---

## 3. Target user

### Primary user

An English-speaking person in India, approximately 20–35 years old, who currently encounters news through social platforms, messaging groups, or scattered publisher links and wants a dependable five-to-eight-minute daily update.

### Primary job to be done

> “Help me understand the important changes since yesterday without opening several apps or getting pulled into a feed.”

### Secondary users

- people intentionally reducing social-media use;
- professionals who want a compact India-and-world briefing;
- students who need context rather than breaking-news fragments.

### Not the target in v1

- breaking-news traders and live-event followers;
- users seeking full articles inside the product;
- users who want a highly personalized recommendation engine;
- readers who require regional-language or hyperlocal coverage;
- users seeking comments, debate, or community.

---

## 4. Positioning

### One-line promise

**Ten stories. About seven minutes. Sources visible. Then you are done.**

### Product description

Aaj, Bas. publishes one calm edition each morning. Each story explains what changed, why it matters, and which sources support the summary. The edition is deliberately finite and has no endless feed.

### Vocabulary

Use these terms consistently:

- **Edition:** the complete set of stories for a date;
- **Story:** one real-world development, potentially supported by several source items;
- **Source item:** one publisher feed entry, official release, or permitted metadata record;
- **Update:** a material change to an existing story;
- **Correction:** a change made because published information was wrong or misleading;
- **Interest boost:** a topic preference that selects optional stories without hiding the shared core edition.

Do not call the product surface a “feed.”

---

## 5. Edition model

### 5.1 Edition size

- Exactly **10 stories** in the standard edition.
- A reader may end early without being told they failed.
- Estimated duration is calculated from visible summary word count at 220 words per minute and rounded up.

### 5.2 Composition

Each edition contains:

- **8 shared core stories** seen by every reader;
- **2 interest stories** selected locally from a small published interest pool.

The shared core normally covers:

- India/public affairs;
- economy or business;
- world affairs;
- science, health, or climate;
- technology;
- culture or society.

Coverage is driven by importance, not by fixed quotas when the news warrants a different balance.

### 5.3 Interest boosts

After experiencing the first edition, a reader may choose up to two:

- Technology & AI
- Business & Economy
- Science, Health & Climate
- Culture & Entertainment
- Sports
- Policy & Geopolitics

Preferences remain on-device in v1. India is part of the shared core and is not an optional topic.

### 5.4 Diversity constraints

Before publication, validation must enforce:

- at least six distinct source organizations across the edition;
- no more than two core stories primarily supported by the same publisher;
- no more than three core stories in one topic unless explicitly overridden;
- no duplicate real-world event presented as separate stories;
- no edition composed entirely of conflict, crime, disaster, or political confrontation;
- reporting, analysis, opinion, and official statements must be labeled distinctly.

---

## 6. Story design

### 6.1 Collapsed card

Each collapsed story card shows:

- ordinal number, such as “3 of 10”;
- topic label;
- neutral headline;
- one-line “what changed” deck;
- source count, such as “3 sources” or “single source”;
- update marker when applicable.

### 6.2 Expanded card

Tapping a card expands it inline and marks it viewed. It shows:

1. **What changed** — two short factual paragraphs;
2. **Why it matters** — one concise paragraph;
3. **Background** — optional, collapsed by default;
4. **What is uncertain** — shown when sources disagree or facts remain incomplete;
5. **Sources** — publisher name, source type, publication time, and original link;
6. **Metadata** — generated/reviewed time, reporting type, and correction status;
7. **Report an issue** — factual error, misleading wording, broken source, or other.

### 6.3 Source labels

Allowed reporting types:

- Reporting
- Analysis
- Opinion
- Official statement
- Research

An opinion or analysis item may not be summarized as settled fact.

### 6.4 Completion

Progress is descriptive, not judgmental.

- Header: “6 of 10 viewed”
- Persistent action near the end: “End today’s edition”
- Full completion message: “That’s today’s edition. See you tomorrow.”
- Early completion message: “You read 6 of 10. That can be enough for today.”

There is no streak, score, badge, confetti loop, or shame language.

---

## 7. First-use experience

### 7.1 Progressive onboarding

Do not block the first edition with mandatory topic selection.

1. Landing screen states the promise and shows today’s edition immediately.
2. After the reader expands two stories or reaches the end, invite them to choose up to two interest boosts for tomorrow.
3. Ask for PWA installation only after the reader completes or ends three editions.
4. Never request notification permission during first use.

### 7.2 Returning reader

- Open directly to today’s edition.
- Restore local viewed state.
- Show the edition timestamp and whether the cached or latest copy is displayed.
- When offline, use the cached edition and state when it was downloaded.

---

## 8. v1 functional scope

### Required

1. Public daily-edition route with no login.
2. Ten-story finite edition.
3. Expandable story cards.
4. Visible source provenance and original links.
5. Local viewed state and local interest preferences.
6. End-edition state.
7. Offline cache for the current edition.
8. Light, dark, and system themes.
9. Reduced-motion support and keyboard navigation.
10. Story-level feedback.
11. Versioned editions and correction notes.
12. Automated source fetch, deduplication, candidate clustering, draft generation, validation, and edition pull request.
13. Human approval before publication during the pilot.

### Explicitly excluded from v1

- authentication and cross-device sync;
- native iOS or Android apps;
- search;
- bookmarks or reading queues;
- topic tabs;
- “All” and “Others” feeds;
- pull-to-refresh or user-triggered source fetching;
- live breaking-news stream;
- the Daily Brief as a separate product surface;
- Legend, Wildcard, Tech Concept, or Critical Read drops;
- session timer, session limit, forced breathing overlay, or streaks;
- comments, reactions, follows, referrals, or social graph;
- full publisher article text;
- publisher images by default;
- a general-purpose admin dashboard;
- six-provider LLM fallback orchestration;
- behavioral personalization;
- third-party advertising or tracking scripts.

---

## 9. Content pipeline

### 9.1 Content-as-code model

GitHub is the v1 editorial system.

- source registry: versioned YAML;
- prompts: versioned text files;
- draft and published editions: versioned JSON;
- editorial changes and corrections: pull requests and commits;
- source health: generated action report;
- audit log: Git history;
- publication: merge to the production branch, `develop`;
- deployment: automatic static build.

This replaces the proposed CRUD-heavy admin panel during validation.

### 9.2 Daily workflow

1. Scheduled workflow fetches allowed sources.
2. Feed entries are normalized and deduplicated.
3. Candidate items are clustered into real-world stories.
4. Deterministic rules select a candidate pool.
5. One summarization provider drafts only the candidate stories likely to be published.
6. Validators check factual support, numbers, named entities, source diversity, duplication, length, and schema.
7. Workflow opens a dated pull request containing the draft edition and validation report.
8. A human reviews wording, balance, links, and labels.
9. Merge publishes the edition.
10. Corrections use a new commit and a visible correction note; published history is never silently rewritten.

### 9.3 Automation gate

Do not enable unattended publication until all conditions hold:

- 30 consecutive editions reviewed;
- zero severe factual errors in that window;
- fewer than 2% of stories require factual correction;
- all critical validators have demonstrated useful precision on the golden dataset;
- a rollback procedure has been tested.

Even after automation, low-confidence, single-source, disagreement, health, conflict, and election stories may require review.

---

## 10. Source policy

### 10.1 Source registry fields

Every source entry must include:

- stable ID;
- display name;
- homepage URL;
- feed or API URL;
- topic and region;
- source type;
- active flag;
- terms or licensing reference;
- permitted-use notes;
- attribution requirement;
- last manual terms check date;
- fetch interval;
- health state;
- takedown/contact notes.

### 10.2 Launch rules

- Use only public feeds, official APIs, or primary-source releases whose intended use has been reviewed.
- Do not scrape full article pages.
- Store only needed metadata, supplied snippets, and generated summaries.
- Link prominently to originals.
- Do not assume a feed is “unlimited” or permanent.
- Do not use Reddit content in a commercial product without confirming applicable API permission.
- Do not seed AP or Reuters content unless the specific feed and usage are expressly permitted or licensed.
- Do not display publisher photography unless its use is expressly allowed.
- Maintain a publisher removal and correction channel.

This is a product risk policy, not legal advice. Formal legal review becomes a launch gate before material scale or monetization.

### 10.3 Retention

- Published edition JSON and correction history: retained indefinitely.
- Raw fetched metadata: retain 30 days unless needed for an active correction investigation.
- Failed fetch logs: retain 14 days.
- User preferences and reading progress: local device only in v1.

---

## 11. AI summarization policy

### 11.1 Provider strategy

Use one provider behind a small `Summarizer` interface. Provider replacement must be configuration, not a new orchestration system.

Recommended pilot order:

1. Cloudflare Workers AI for the integrated zero-cost path;
2. source-supplied description as deterministic fallback.

A second external provider is introduced only after measured quality or capacity requires it.

### 11.2 Input

The model receives only:

- source titles;
- source-supplied descriptions/snippets;
- publisher names and source types;
- timestamps;
- prior published story context when producing a “what changed” update.

Do not send user data, feedback text containing personal information, secrets, or unpublished private material to a free-tier model.

### 11.3 Output contract

The model must return strict JSON containing:

- neutral headline;
- what changed;
- why it matters;
- optional background;
- optional uncertainty;
- extracted people, organizations, locations, dates, and numbers;
- reporting type;
- support mapping from each sentence to one or more source item IDs.

### 11.4 Programmatic validation

Block a draft when:

- a person, organization, location, date, or number appears in output but not input;
- a sentence lacks a source mapping;
- the model merges unrelated events;
- the headline uses unsupported certainty;
- opinion language is presented as reporting;
- output exceeds length limits;
- fewer than the required fields validate against the schema.

### 11.5 Fallback behavior

When generation fails or evidence is insufficient:

- publish a normalized source description only if it is clear and permitted;
- otherwise publish a headline-and-links card;
- never fabricate a summary to preserve layout consistency.

---

## 12. Technical architecture

### 12.1 Architecture decision

Use one TypeScript monorepo and a static-first deployment.

| Concern | Decision |
|---|---|
| Frontend | React + Vite PWA |
| Styling | Plain CSS and CSS custom properties; no utility-CSS framework and no component-library dependency |
| Validation | Zod schemas shared by content scripts and UI |
| Content | Versioned JSON in Git |
| Automation | TypeScript scripts in GitHub Actions |
| Hosting | Cloudflare Pages static hosting |
| Optional API | Small Hono Worker for feedback and aggregate events (a runtime backend; requires an approved ADR and unlocked milestone per AGENTS.md sections 6 and 7) |
| Optional database | Cloudflare D1 only for feedback and aggregate counters (data persistence; requires an approved ADR per AGENTS.md section 34 and an unlocked milestone) |
| ORM | Drizzle only if D1 is introduced (a significant dependency; requires an approved ADR per AGENTS.md sections 11 and 34) |
| Testing | Vitest and schema validation today; Playwright, axe-core, and golden content tests when the milestone that needs them is unlocked (each requires an ADR; see AGENTS.md section 5) |
| Package manager | Bun (Bun workspaces) |

Do not introduce FastAPI, NextAuth, React Native, PostgreSQL, or a second application language in v1.

### 12.2 Repository layout

The tree below shows the directories and instruction files that exist today. Workspace manifests, tool configuration, and per-directory `README.md` files are omitted for brevity.

```text
/
├── AGENTS.md
├── CLAUDE.md
├── README.md
├── .agents/
│   └── skills/                   # shared agent skill definitions
├── .claude/                      # Claude Code commands and settings
├── .codex/                       # Codex agent configuration
├── apps/
│   ├── landing/                  # marketing surface, React + Vite
│   └── web/                      # reader application, React + Vite
├── content/
│   ├── editions/
│   ├── drafts/
│   └── corrections/
├── packages/
│   ├── domain/
│   ├── logger/
│   ├── schemas/
│   ├── ui/
│   └── test-fixtures/
├── prompts/
├── scripts/
│   ├── check-agents-md-size.sh
│   └── check-package-manager.sh
├── docs/
│   ├── PRD.md
│   ├── BACKLOG.md
│   ├── PRODUCT_CONSTITUTION.md
│   ├── architecture/
│   ├── editorial/
│   ├── runbooks/
│   └── workflows/
└── .github/
    └── workflows/
        └── ci.yml                # validation and deployment
```

Deployment lives inside `.github/workflows/ci.yml` by decision of ADR-0002. Do not add a
separate `deploy.yml`; a second deployment workflow would contradict an accepted ADR.

The following are not in the repository yet. Create each only in the backlog item that needs it:

- `content/sources.yml`;
- content automation scripts in `scripts/` (`fetch-sources.ts`, `normalize-items.ts`,
  `cluster-stories.ts`, `rank-candidates.ts`, `generate-draft.ts`, `validate-edition.ts`,
  `publish-edition.ts`);
- prompt files in `prompts/` (`summarize-v1.md`, `classify-v1.md`);
- a scheduled draft-edition workflow, only when generated-content automation is unlocked;
- `apps/feedback-worker/` — a runtime backend. It requires both an approved ADR and an
  explicitly unlocked product milestone before it may be created (AGENTS.md sections 6 and
  7). Do not scaffold it speculatively.

### 12.3 Public content API

The static application reads versioned JSON:

```text
/content/latest.json
/content/editions/YYYY-MM-DD.json
```

No authenticated user API is required.

### 12.4 Optional feedback API

```text
POST /v1/feedback
POST /v1/events/aggregate
GET  /v1/health
```

The feedback endpoint accepts no account identifier. Rate limits and abuse controls are applied at the edge.

---

## 13. Content contracts

### 13.1 Edition

```ts
interface Edition {
  schemaVersion: 1;
  date: string;
  editionVersion: number;
  status: "draft" | "published" | "corrected";
  publishedAt: string;
  updatedAt: string;
  estimatedMinutes: number;
  coreStoryIds: string[];
  interestPools: Record<InterestSlug, string[]>;
  stories: Story[];
  correctionNotes: CorrectionNote[];
}
```

### 13.2 Story

```ts
interface Story {
  id: string;
  slug: string;
  topic: TopicSlug;
  reportingType: "reporting" | "analysis" | "opinion" | "official" | "research";
  headline: string;
  deck: string;
  whatChanged: string[];
  whyItMatters: string;
  background?: string;
  uncertainty?: string;
  sourceIds: string[];
  sourceCount: number;
  confidence: "single-source" | "multi-source" | "disputed";
  firstPublishedAt: string;
  updatedAt: string;
  generatedBy?: string;
  promptVersion?: string;
  reviewed: boolean;
}
```

### 13.3 Source reference

```ts
interface SourceReference {
  id: string;
  publisher: string;
  title: string;
  url: string;
  sourceType: "publisher" | "primary" | "research" | "official";
  publishedAt: string;
}
```

The JSON schema is the contract. Content that fails validation cannot deploy.

---

## 14. Local user state

Use versioned on-device state only:

```ts
interface LocalStateV1 {
  schemaVersion: 1;
  interests: InterestSlug[];
  theme: "light" | "dark" | "system";
  viewedByEdition: Record<string, string[]>;
  endedEditions: string[];
  installPromptDismissedAt?: string;
}
```

Migration code must preserve older local state. A corrupt local state must reset safely without breaking access to the edition.

---

## 15. Privacy-preserving measurement

The original “no analytics” promise is incompatible with retention and completion targets. Replace it with **minimal first-party measurement**.

### Allowed

- aggregate edition loads;
- aggregate edition completions and early endings;
- aggregate source-link opens by story;
- aggregate issue-report counts;
- optional anonymous installation ID with 30-day rotation during the closed beta only;
- short in-product satisfaction survey after the third edition.

### Prohibited

- third-party analytics scripts;
- advertising identifiers;
- cross-site tracking;
- sale or sharing of behavioral data;
- storing raw IP addresses as product analytics;
- behavioral ranking or personalization.

Publish a plain-language privacy page before inviting public users.

---

## 16. Success criteria and gates

### 16.1 Fourteen-day closed pilot

Recruit at least 25 target readers. Continue building only if:

- at least 50% return on four or more days during the first week;
- at least 60% of opened standard editions are ended or completed;
- at least 70% say the edition left them sufficiently informed;
- median trust rating is at least 4/5;
- no severe factual error is published;
- fewer than 5% of stories receive a substantiated clarity or accuracy complaint;
- median active session remains between four and ten minutes.

### 16.2 North-star outcome

**Percentage of readers who finish or intentionally end the edition and answer “Yes” to “Do you feel sufficiently informed for today?”**

### 16.3 Guardrails

- severe factual errors: zero;
- broken source links: below 1%;
- page load p75 on mobile: below 2.5 seconds on a typical 4G connection;
- accessibility: no serious or critical automated violations;
- edition deploy failures: below 2% of scheduled runs.

### 16.4 Anti-metrics

Do not optimize:

- time in app;
- pages per session;
- returns per day;
- story count consumed;
- notification opens;
- streak length.

---

## 17. Non-functional requirements

### Performance

- Static application shell under 200 KB compressed JavaScript at launch.
- Edition JSON under 150 KB compressed.
- No client-side image payload in the default story list.
- Current edition available offline after one successful load.

### Reliability

- A failed source may not block the edition.
- A failed summarizer may not block manual publication.
- The last published edition remains available if the daily workflow fails.
- Deployment supports one-command rollback to the prior edition version.

### Accessibility

- WCAG 2.2 AA target.
- Semantic headings and landmarks.
- Full keyboard operation.
- Visible focus states.
- Screen-reader labels for progress and source lists.
- Reduced motion honored.
- Light, dark, and system themes.
- Minimum touch target 44 by 44 CSS pixels.

### Security

- Strict Content Security Policy.
- No secrets in the client bundle.
- RSS HTML sanitized; no raw `innerHTML` rendering.
- Source URLs are allowlisted.
- Fetcher blocks private-network addresses, excessive redirects, and oversized responses.
- Dependency changes require review.
- Secret scanning and dependency audit run in CI.
- Feedback endpoint has schema validation, rate limiting, and content-length limits.

---

## 18. AI-agent operating model

### 18.1 Required repository instructions

`AGENTS.md` must state:

- the product constitution is binding;
- no infinite-scroll component may be introduced;
- no new dependency without an architecture decision record;
- no database or authentication system without a gated milestone;
- no schema change without migration and compatibility tests;
- every UI slice needs loading, success, empty, error, stale, and offline behavior where applicable;
- all public content must validate against shared schemas;
- generated summaries must never deploy when validators fail;
- tests, accessibility checks, and build must pass before merge;
- agents may not access production secrets directly.

### 18.2 Work sequence per issue

Follow the seven-step work sequence defined in `AGENTS.md` section 32: understand, scope,
plan, implement, test, self-review, report.

Those stages may be performed by one agent in sequence or by separate agents. The repository
does not define Planner, Builder, Test, and Reviewer roles, and no arrangement removes any
stage.

Either way, a human approval gate before merge is required.

An agent that discovers a larger architectural need opens an ADR; it does not silently broaden the task.

### 18.3 Definition of done

A feature is done only when:

- acceptance criteria are demonstrably met;
- type check, lint, unit, integration, and relevant end-to-end tests pass;
- accessibility has been checked;
- loading, success, empty, error, stale, and offline behavior are handled where applicable;
- no unsupported product metric or tracking identifier was added;
- documentation and schemas are updated;
- the feature stays inside the v1 constitution;
- visual review has been completed at mobile and desktop widths.

---

## 19. Delivery milestones

### Milestone 0 — Manual proof

- Build the static edition UI from hand-written JSON.
- Publish seven consecutive manual editions.
- Recruit 15–25 readers.
- Validate the promise before investing in automation.

**Exit:** readers understand the proposition, finish editions, and trust the format.

### Milestone 1 — Product shell

- PWA shell, themes, accessibility, local state, offline cache, edition completion.
- Public deployment on the free hosting subdomain.

**Exit:** a manually authored edition is reliable on mobile and desktop.

### Milestone 2 — Content automation

- source registry;
- fetch/normalize/deduplicate scripts;
- clustering and ranking;
- one-provider draft generation;
- validation report;
- daily draft pull request.

**Exit:** automation reliably produces a reviewable draft without publishing it.

### Milestone 3 — Trust and pilot

- source provenance;
- correction history;
- feedback flow;
- aggregate metrics;
- golden dataset and prompt evaluations;
- fourteen-day closed pilot.

**Exit:** pilot gates are met.

### Milestone 4 — Public beta

- harden runbooks and rollback;
- review source rights;
- publish privacy, editorial, correction, and source policies;
- introduce custom domain only when a small budget exists;
- open the product publicly.

### Deferred milestones

- editorial web console when GitHub review takes more than 30 minutes a day;
- authentication only when at least 20% of active readers explicitly request sync;
- native apps only after the PWA has meaningful weekly retention, store fees are budgeted, and native-only capabilities solve a measured problem;
- regional languages after the English edition demonstrates retention and a sustainable review process;
- email or messaging delivery after the web edition succeeds;
- paid supporter tier only after trust and operating costs are understood.

---

## 20. Primary risks

| Risk | Mitigation |
|---|---|
| AI invents or distorts facts | source-mapped output, validators, human review, correction history |
| Publisher terms do not allow intended use | source registry with terms review; metadata-only use; removal channel |
| Product feels too small | position completion as the benefit; improve context, not quantity |
| Edition selection feels biased | publish editorial rules, source diversity, reporting labels, and corrections |
| Daily manual review becomes burdensome | content-as-code automation; gate auto-publish only after evidence |
| Free tiers change | static-first architecture; provider interface; deterministic fallback |
| Users still want breaking news | state clearly that Aaj, Bas. is a daily briefing, not an emergency alert service |
| Name cannot be cleared | treat Aaj, Bas. as a working name until trademark and domain review |
| Feature creep recreates a feed | enforce product constitution and ADR review |

---

## 21. Decisions replacing the original PRD

| Original direction | Final decision |
|---|---|
| Signal / Zero / Zerod | Use **Aaj, Bas.** as the working name; perform formal clearance before public branding |
| Gen Z globally | Start with English-speaking India, roughly 20–35 |
| Topic tabs and chronological articles | One coherent daily edition of story clusters |
| 25–50 articles per tab | Ten stories total |
| Daily brief plus feed | The edition is the brief; remove duplication |
| Mandatory onboarding | Show value first; progressive interest selection |
| Search and Others | Remove from v1 |
| Pull/deep refresh | Remove; edition changes only through publication/correction |
| Four daily drops | Remove; reconsider one optional curiosity story only after validation |
| Timer, limit, breathing lock, streak | Remove; the finite structure is the intervention |
| Optional auth and sync | Remove from v1 |
| Next.js + FastAPI + React Native + PostgreSQL | Static React PWA + TypeScript content scripts; a tiny Worker or D1 only behind an approved ADR and an unlocked milestone |
| Full admin dashboard | GitHub pull requests, YAML, JSON, and Actions |
| Six free LLM providers | One provider plus deterministic fallback |
| Summarize every article | Cluster first; summarize only likely edition stories |
| No analytics | Minimal first-party, privacy-preserving measurement |
| Dark-only | Light, dark, and system themes |
| Purge everything after 30 days | Purge raw fetches; retain published editions and corrections |

---

## 22. Launch statement

Aaj, Bas. succeeds when a reader can open it once, understand the important changes of the day, verify where they came from, and leave without feeling that something else is waiting below.
