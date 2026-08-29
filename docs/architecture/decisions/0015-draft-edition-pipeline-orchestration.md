# ADR-0015: Draft Edition Pipeline Orchestration and Diagnostic Artifacts

## Status

Accepted

## Context

Aaj, Bas. is a finite daily news product that requires automated daily ingestion, deduplication, clustering, candidate ranking, summarization, factual support validation, and human-in-the-loop editorial review before publication.

Earlier architectural decisions established:
- The static-first monorepo and CI/CD topology (ADR-0001, ADR-0002).
- The edition data contracts and validation rules (ADR-0005).
- Source registry security and SSRF safeguards (ADR-0012).
- The provider-neutral summarizer interface and fallback architecture (ADR-0013).
- Factual support validation, containment rules, and diagnostic formatters (ADR-0014).

Issue **AB-701** requires an end-to-end pipeline that connects all upstream domain modules into a single orchestration flow, producing dated draft edition JSON artifacts (`content/drafts/<date>.json`) alongside rich diagnostic Markdown summaries (`content/drafts/<date>-summary.md`) for embedding into daily pull request descriptions.

## Decision

1. **Domain Pipeline Boundary**:
   - Implement the orchestration pipeline as a pure domain function in `packages/domain/src/edition-pipeline/`:
     ```typescript
     export async function generateDraftEditionPipeline(
       input: EditionPipelineInput,
       options?: EditionPipelineOptions,
     ): Promise<DraftEditionPipelineResult>
     ```
   - The domain pipeline executes all 10 stages in sequence:
     1. Ingestion / feed item normalization (`normalizeFeedItems`).
     2. Exact and near-duplicate suppression (`deduplicateFeedItems`).
     3. Story clustering (`clusterFeedItems`).
     4. Deterministic candidate ranking and composition (`rankAndComposeCandidates`).
     5. Story summarization (`StorySummarizer.summarize()`).
     6. Source reference resolution and metadata attachment (`SourceReference[]`).
     7. Edition document construction (`Edition` with `status: "draft"`, `reviewed: false`).
     8. Schema validation (`editionSchema.parse()`).
     9. Factual support validation (`validateFactualSupport()`).
     10. Editorial rule validation (`validateEdition()`).

2. **Artifact Conventions**:
   - Primary artifact: `content/drafts/<date>.json` (conforms to `editionSchema` with `status: "draft"`, exactly 8 core stories, and interest pool candidates).
   - Companion artifact: `content/drafts/<date>-summary.md` (human-readable GitHub Markdown report containing composition statistics, selection rationale tables, factual validation findings, and story cards).

3. **Single CLI Entry Point**:
   - Provide `scripts/generate-draft-edition.ts` and `package.json` script `bun run draft:generate`.
   - The CLI handles filesystem I/O, feed fetching or fixture loading, and artifact writing, while domain business rules remain in `@aaj-bas/domain`.

4. **Fail-Safe & Degradation Policy**:
   - If an external AI provider fails or times out, the pipeline automatically falls back to `DeterministicFallbackSummarizer`.
   - If blocking factual support findings or schema validation errors occur, the artifacts are still written to disk with diagnostic warnings, and the pipeline signals the blocking state so CI and PR workflows can halt automated progression.

## Consequences

### Positive
- Fully automated, reproducible daily draft generation.
- Pure domain logic remains testable in memory with zero external network or LLM API calls in CI unit tests.
- Daily draft PRs (AB-702) receive complete, formatted review summaries directly in the PR description.
- Preserves all constitutional invariants: finite 8-story core editions, strict diversity caps, no engagement tracking, and human-in-the-loop review.

### Negative / Trade-offs
- Writing companion Markdown artifacts adds a small build step, but this is negligible (< 100ms) and provides essential editorial transparency.
