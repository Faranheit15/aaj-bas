# ADR-0014: Factual support validation and hallucination containment

- **Status**: Accepted
- **Date**: 2026-08-22
- **Author**: Codex / Antigravity Lead Agent
- **Governing PRD Section**: Section 6.3 (Summary generation and provenance), Section 11 (Editorial integrity and trust), Section 13.2 (Confidence and source attribution)
- **Extends**: [ADR-0005: Edition content contract](0005-edition-content-contract.md), [ADR-0013: Summarizer interface and deterministic fallback architecture](0013-summarizer-interface-and-fallback.md)

---

## 1. Context

AI-assisted news summarization introduces significant risk of hallucination, false certainty, ungrounded statistics, and misattributed sources. In journalism, fabricated numbers (e.g., casualty tolls, financial figures, percentages, dates) and ungrounded named entities destroy reader trust (PRD Principle 5: *"Trust is a feature"*).

Product Constitution Principle 11 states:
> *"Automation may assist; it may not invent. A generated statement must be supported by supplied source material. Generated content is untrusted, must validate against supporting sources, and must degrade to publisher descriptions or simple headlines on failure."*

AGENTS.md Section 20 requires:
> *"Model output is untrusted data... Model output must be: 1. constrained to a schema; 2. parsed; 3. validated; 4. checked against source inputs; 5. mapped to supporting sources; 6. blocked on validation failure..."*

Backlog item **AB-603** requires a factual support validation subsystem that checks entity, date, and number containment, verifies source attribution, enforces uncertainty on conflicting source reports, and distinguishes blocking errors from advisory warnings.

---

## 2. Decision

We introduce a pure, zero-dependency factual support validation engine in `@aaj-bas/domain/factual-validation` with the following architectural commitments:

### 2.1 Dual-Tier Severity Model
1. **`blocking`**: Halts draft publication (`publishable = false`), preventing draft editions from deploying or merging until resolved.
   - Triggers on:
     - Unseen numbers (integers, floats, percentages, currency, spelled-out numbers) absent from all source cluster items.
     - Unseen named entities (proper nouns, capitalized organizations, acronyms) absent from source cluster items.
     - Unseen dates or temporal references conflicting with source timestamps.
     - Missing or unknown `sourceIds` cited in story sentences.
     - Unresolved factual/numeric conflicts between cluster items where the generated story fails to state uncertainty or declare `confidence: "disputed"`.
     - Misclassification of pure opinion/editorial or official press release clusters as objective `"reporting"`.
2. **`warning`**: Advisory diagnostic signal that does not halt publication (`publishable = true`).
   - Triggers on:
     - Mild lexical attribution gaps (cited source has low token overlap for a sentence, but cluster as a whole supports it).
     - Ambiguous temporal phrasing (relative weekday mentions).

### 2.2 Pure Deterministic Fact Extraction & Containment
- All fact extraction (numbers, currencies, percentages, dates, proper noun sequences) runs locally and deterministically using pure regex, string normalization, and linguistic tokenizers.
- Number containment handles format variances (e.g., Indian comma system `1,00,000` vs Western `100,000`, `15%` vs `15 percent`, `$10B` vs `10 billion`).
- Zero reliance on external network or runtime LLM calls during validation.

### 2.3 Comprehensive Diagnostic Formatters
The validation subsystem produces three deterministic output formats:
1. **JSON (`toFactualValidationReportJson`)**: Machine-readable artifact for CI and automated release checks.
2. **Markdown (`formatFactualValidationMarkdown`)**: Summary table with status badges and collapsible `<details><summary>Diagnostics</summary>` sections designed to be embedded in daily draft pull requests (AB-701/AB-702).
3. **Plain Text (`formatFactualValidationText`)**: Human-readable terminal output using repository standard `OK:`, `WARN:`, and `FAIL:` indicators.

---

## 3. Consequences

### Positive
- **Guaranteed Epistemic Integrity**: No fabricated statistics, false suspects, unverified casualty counts, or phantom sources can reach published editions.
- **Inspectable & Auditable**: Every blocking finding provides the exact offending token, field location, and cluster context in PR review comments.
- **Deterministic & Fast**: Validation executes in milliseconds without network calls or API costs.
- **Fail-Safe Degradation**: If an AI summary is blocked by factual validation, the workflow falls back to `DeterministicFallbackSummarizer`, preserving pipeline continuity.

### Negative / Trade-offs
- Strict entity and number containment may occasionally flag legitimate paraphrasing or synonym expansions as ungrounded tokens, requiring fallback or explicit editorial review. This is an intentional tradeoff prioritizing factual accuracy over automated throughput.

---

## 4. Compliance & Invariants

- **Bun Only**: Package scripts use Bun.
- **Zero Runtime Backend**: Implemented as pure domain logic within `@aaj-bas/domain`.
- **Zero Telemetry**: No validation metrics or diagnostics leave the build/CI environment.
