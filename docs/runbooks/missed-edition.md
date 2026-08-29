# Missed Daily Edition Recovery Runbook

## Purpose

This runbook defines the operational protocol when a scheduled daily edition (expected by 06:00 IST / 00:30 UTC) is missing, delayed, or failed validation during draft generation (AB-803).

## Invariants

1. **Never Silently Fabricate**: An edition must never be published with unverified filler or synthetic hallucinations to meet a clock deadline.
2. **Reader Preservation**: The reader UI cleanly degrades to its "no edition" or preserved cached offline state rather than crashing.
3. **Audit Trail**: Every incident resulting in a missed or delayed edition must be documented with root cause and corrective actions.

---

## Detection

A missed edition is detected when:
- GitHub Actions daily draft generation workflow (`daily-draft.yml`) fails or does not open a Draft PR by 00:45 UTC.
- Smoke test `bun run edition:smoke` indicates no edition published for the current date.
- Editorial maintainers observe that the editorial gate was not satisfied before morning publication.

---

## Recovery Steps

### Step 1: Diagnose Daily Pipeline Failure

Check the GitHub Actions run logs for `.github/workflows/daily-draft.yml`:

```bash
# 1. Manually trigger local draft generation to inspect errors
bun run draft:generate --date $(date +%Y-%m-%d)
# Or to run an explicit offline fixture test with synthetic golden data (never production ingestion):
bun run draft:generate --date $(date +%Y-%m-%d) --fixture --dry-run

# 2. Check source fetcher status
bun run sources:fetch

# 3. Check source registry validity
bun run sources:validate
```

### Step 2: Remediate Root Causes

- **If RSS / Source Outage**: If insufficient active sources were reachable, follow `docs/runbooks/source-outage.md`.
- **If Factual Validation Failure**: If LLM draft summarization triggered factual trap warnings or number mismatches, inspect the generated findings in `content/drafts/<date>-summary.md` and adjust prompt/inputs or use human editorial summarization.
- **If Secret / API Key Expiry**: Verify `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in GitHub repository secrets if using Cloudflare Workers AI.

### Step 3: Manual Draft Generation & Publication

Once the root cause is resolved:

```bash
# 1. Generate the draft edition locally or via workflow_dispatch
bun run draft:generate --date <YYYY-MM-DD>

# 2. Review the draft file against editorial criteria
bun run content:validate --file content/drafts/<YYYY-MM-DD>.json

# 3. Publish the approved draft
bun run edition:publish --date <YYYY-MM-DD>

# 4. Update the system health status artifact
bun run status:generate

# 5. Stage and run merge-blocking suite
bun run check
bun run edition:smoke

# 6. Commit and push to develop
git add content/
git commit -m "feat(content): publish daily edition for <YYYY-MM-DD>"
git push origin develop
```

### Step 4: Verify Live Reader

```bash
bun run edition:smoke
```
