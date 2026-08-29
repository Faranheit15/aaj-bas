# ADR-0013: Summarizer interface and deterministic fallback architecture

Status: Accepted
Date: 2026-08-22
Owners: @aaj-bas/lead-agent

## Context

Aaj, Bas. drafts concise, finite daily news stories based on multi-source clustered feed items. While LLM summarization (e.g. Cloudflare Workers AI) assists in transforming noisy source texts into structured, neutral draft summaries, Section 20 and Section 21 of `AGENTS.md` establish binding constraints:

1. **Untrusted AI output**: Model output is untrusted data and must never deploy without validation.
2. **Provider neutrality**: Architecture must use a single narrow interface rather than a complex multi-provider framework.
3. **Graceful degradation**: Provider failure (timeout, network outage, rate limit, invalid JSON) must degrade honestly to permitted normalized source text rather than crashing the staging or publishing pipeline.
4. **Secret isolation**: AI provider API tokens and account credentials must never enter client bundles, logs, or pull request comments (Section 24).
5. **Hermetic testing**: Tests must not depend on live external networks or LLMs (Section 29).

## Decision

We introduce the pure domain module `packages/domain/src/summarization/`:

1. **Narrow Provider Interface (`StorySummarizer`)**:
   Defines a single contract `summarize(input: StorySummarizerInput): Promise<StorySummarizerOutput>`.

2. **Deterministic Source-Description Fallback (`DeterministicFallbackSummarizer`)**:
   A zero-network, offline-first fallback summarizer that synthesizes a reviewable draft `Story` directly from normalized item titles and descriptions conforming strictly to `storySchema`.

3. **Cloudflare Workers AI REST Adapter (`CloudflareWorkersAiSummarizer`)**:
   An adapter targeting Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct` by default) with configurable timeouts, retries on transient HTTP 429/503 statuses with exponential backoff, credential scrubbing, and automatic delegation to the fallback summarizer on any failure.

4. **Summarizer Factory (`createSummarizer`)**:
   A single entry point resolving the active summarizer from configuration without coupling callers to concrete provider implementations.

## Alternatives considered

- **Complex multi-provider LLM orchestration framework (e.g. LangChain, LlamaIndex)**: Rejected per Section 6 and Section 21. Adds excessive dependencies, abstractions, and complexity where a narrow REST boundary is sufficient.
- **Fail-fast pipeline without fallback**: Rejected per Section 20. Transient AI outages must not halt the daily news staging workflow.

## Consequences

- The daily staging pipeline can run seamlessly in fully offline/local environments using the fallback summarizer.
- Cloudflare Workers AI or future pilot providers can be switched via environment configuration without modifying pipeline callers or reader applications.
- Story outputs conform strictly to `storySchema`.

## Security/privacy impact

- API keys and tokens are supplied at runtime via environment variables (`CLOUDFLARE_API_TOKEN`) and never bundled into client applications.
- Error handlers sanitize and redact authorization headers and credentials.
- No user data or reading habits are ever transmitted to AI providers.

## Product-constitution impact

- Upholds Section 20 (Better context over more content, graceful degradation).
- Generates structured stories that link directly to source provenance without inventing unsupported claims.

## Rollback plan

- Configure `createSummarizer({ provider: "fallback" })` to disable external AI generation immediately.
- Revert the module commit if necessary without impacting earlier clustering or ranking stages.
