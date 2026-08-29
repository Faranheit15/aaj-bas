# Defective Summary and Factual Inaccuracy Runbook

## Purpose

This runbook defines the procedure for responding when an AI-generated or human-edited summary in a published edition contains a factual error, hallucination, misleading wording, or broken source attribution (AB-803, AGENTS.md section 22).

## Invariants

1. **No Silent Rewriting**: Never overwrite history or silently mutate published factual text in git without an explicit version increment and correction note.
2. **Immediate Additive Correction**: Every factual correction must increment `editionVersion >= 2` and append an immutable `CorrectionNote`.
3. **Public Transparency**: Readers must see the visible correction badge and updated text on the affected story.

---

## Severity Levels

| Severity | Description | Immediate Action |
|---|---|---|
| **P1 — Critical Factual Error** | Substantial factual error, legal exposure, or false claim attributed to a source. | Publish immediate correction note within 30 minutes, or rollback edition if correction cannot be drafted immediately. |
| **P2 — Moderate Inaccuracy** | Minor numerical discrepancy or misleading phrasing. | Publish additive correction note via `bun run content:correct`. |
| **P3 — Typos / Minor Broken Link** | Typo in non-factual prose or dead source URL. | Apply correction note with updated source reference. |

---

## Remediation Procedure

### Step 1: Draft the Additive Correction

Use the correction tool to update the story text and generate a timestamped audit record:

```bash
bun run content:correct \
  --date <YYYY-MM-DD> \
  --story-id <story-id> \
  --summary "Corrected the monetary figure in paragraph 1 from 500 cr to 600 cr." \
  --detail "Official ministry release confirmed the revised allocation." \
  --updated-why-it-matters "Revised text explaining the corrected context."
```

### Step 2: Validate Content Integrity

```bash
bun run content:validate --file content/editions/<YYYY-MM-DD>.json
bun run check
```

Verify that:
- `editionVersion` is incremented.
- `status` is set to `"corrected"`.
- `correctionNotes` array contains the new note.
- `content/corrections/<correction-id>.json` was created.

### Step 3: Stage, Commit, and Deploy

```bash
bun run content:stage
git add content/
git commit -m "fix(content): apply correction to story <story-id> in <YYYY-MM-DD> edition"
git push origin develop
```

### Step 4: Verify Deployment

```bash
bun run edition:smoke --url https://aaj-bas-web.pages.dev
```
Open the live reader in a browser and verify that the story card displays:
- "Updated" timestamp
- Visible "Correction" badge and explanatory paragraph
