# Source Outage and RSS Feed Degradation Runbook

## Purpose

This runbook defines the response protocol when upstream news sources, RSS feeds, or newsroom API endpoints become unreachable, invalid, or return HTTP errors (AB-803, AGENTS.md section 19).

## Invariants

1. **SSRF and Allowlist Security**: Never bypass URL allowlists or private-IP restrictions to fetch from an unvetted endpoint.
2. **Deterministic Source Validation**: Source additions or status toggles must adhere to `content/sources.yml` schema and validation.
3. **Graceful Degradation**: When a source is unreachable, the pipeline logs a warning and proceeds with remaining valid sources.

---

## Triage and Diagnosis

Run source verification and test live fetches:

```bash
# 1. Validate source registry syntax and structure
bun run sources:validate

# 2. Test live source fetching in dry-run mode
bun run sources:fetch --live --dry-run --verbose
```

Inspect output for:
- DNS resolution failures (NXDOMAIN)
- HTTP status codes (403 Forbidden, 404 Not Found, 503 Service Unavailable)
- SSL certificate errors
- Malformed RSS/Atom XML

---

## Remediation Actions

### Scenario A: Temporary Upstream Outage
If a publisher is experiencing temporary downtime:
- Allow remaining active feeds in `content/sources.yml` to satisfy clustering and story selection.
- If at least 5 active sources across distinct domains are reachable, daily draft generation continues safely.

### Scenario B: Permanent URL Migration or Feed Deprecation
If a source changed its RSS URL or deprecated a feed:
1. Update `content/sources.yml` with the new verified feed URL.
2. Run `bun run sources:validate` to ensure format and security constraints pass.
3. Test fetch with `bun run sources:fetch --dry-run`.

### Scenario C: Disabling a Problematic Source
If a feed is emitting toxic formatting or spam:
1. Set `status: inactive` in `content/sources.yml` under the offending source entry.
2. Add a comment documenting why the source was disabled and the date.
3. Run `bun run sources:validate`.
4. Commit change and push to `develop`.

---

## Post-Remediation Verification

```bash
bun run sources:validate
bun run check
```
