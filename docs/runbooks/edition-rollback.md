# Published Edition Rollback and Index Restoration

## Purpose

This runbook defines the operational procedure for withdrawing a defective, inaccurate, or accidentally published edition and safely repointing the reader's `latest.json` pointer to an earlier known-good edition (AB-703, AB-803).

## Invariants

1. **Atomic Pointer Safety**: The reader loads `/content/latest.json` to discover the current edition. The latest pointer must never reference an edition that is unparseable or unpublished.
2. **Historical Persistence**: Historical edition URLs remain stable at `/content/editions/<date>.json`. Rolling back the latest pointer does not destroy the archive or delete git history.
3. **No Downtime / Fallback Preservation**: A reader with offline cached state preserves the last known good edition.

---

## Procedure

### Option 1: Fast CLI Rollback (Recommended)

To rollback the `latest.json` index to the immediately preceding published edition:

```bash
# 1. Preview the rollback plan
bun run edition:rollback --to-previous --dry-run

# 2. Execute the rollback and withdraw the problematic edition
bun run edition:rollback --to-previous --withdraw-current

# 3. Stage the updated index and editions
bun run content:stage

# 4. Verify the built index pointer
bun run content:stage --verify-index apps/web/public/content/latest.json

# 5. Run the merge-blocking checks
bun run check

# 6. Commit and push to develop to trigger automated static deployment
git add content/
git commit -m "fix(content): rollback published edition to prior date"
git push origin develop
```

### Option 2: Target a Specific Historical Edition

To rollback to a specific known-good date (e.g. `2026-08-28`):

```bash
bun run edition:rollback --target-date 2026-08-28 --withdraw-current
bun run content:stage
bun run check
```

---

## Post-Rollback Smoke Verification

After deployment to Cloudflare Pages:

```bash
# Smoke test live production reader endpoint
bun run edition:smoke --url https://aaj-bas-web.pages.dev
```

Verify that:
- `latest.json` is reachable (HTTP 200) and returns valid JSON.
- The returned latest edition has 8 core stories and valid source citations.
- Readers navigating to `/` load the restored edition immediately.
