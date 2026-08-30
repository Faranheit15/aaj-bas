# Source Feed Outage and Degradation Runbook

## Purpose

This runbook defines the response protocol when an upstream source feed becomes unreachable, invalid, or returns HTTP errors (AB-803, AGENTS.md section 19).

## Invariants

1. **SSRF and Allowlist Security**: Never bypass URL allowlists or private-IP restrictions to fetch from an unvetted endpoint.
2. **Deterministic Source Validation**: Source additions or active-flag changes must adhere to the `content/sources.yml` schema and validation.
3. **Graceful Degradation**: When a source is unreachable, the pipeline logs a warning and proceeds with remaining valid sources.

---

## Triage and Diagnosis

Run registry validation, live transport checks, and (when needed) live feed parsing:

```bash
# 1. Validate source registry syntax and structure
bun run sources:validate --json

# 2. Test HTTPS transport, response status, content type, latency, parsing, and item counts
bun run sources:fetch --json

# 3. Test the complete live RSS/Atom/JSON draft pipeline without writing a draft artifact
bun run draft:generate --date <YYYY-MM-DD> --dry-run
```

Inspect output for:
- DNS resolution failures (NXDOMAIN)
- HTTP status codes (403 Forbidden, 404 Not Found, 503 Service Unavailable)
- SSL certificate errors
- Missing or unsupported response content types
- Feed parsing failures or a parsed item count of zero

---

## Remediation Actions

### Scenario A: Temporary Upstream Outage
If a publisher is experiencing temporary downtime:
- Leave unaffected entries with `active: true` in `content/sources.yml`; the ingestion pipeline isolates a failed source and continues with the remaining validated entries.
- A successful fetch alone does not make an edition publishable. Confirm that feeds parse into items and that the generated draft passes its editorial validation, including the six-publisher citation requirement.

### Scenario B: Permanent URL Migration or Feed Deprecation
If a source changed its RSS URL or deprecated a feed:
1. Update `content/sources.yml` with the new verified feed URL.
2. Run `bun run sources:validate` to ensure format and security constraints pass.
3. Test transport and parsed item counts with `bun run sources:fetch --json`.
4. Test the complete draft pipeline with `bun run draft:generate --date <YYYY-MM-DD> --dry-run`.

### Scenario C: Disabling a Problematic Source
If a feed is emitting toxic formatting or spam:
1. Set `active: false` in `content/sources.yml` under the offending source entry. Keep `sample: false`; an inactive real source may retain its review metadata, but it is no longer fetched.
2. Add a comment documenting why the source was disabled and the date.
3. Run `bun run sources:validate`.
4. Commit the change on a branch and open a pull request. Do not push directly to the protected `develop` branch.

---

## Post-Remediation Verification

```bash
bun run sources:validate
bun run check
```
