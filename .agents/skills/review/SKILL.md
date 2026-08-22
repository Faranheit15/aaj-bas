---
name: review
description: Review the current diff against Aaj, Bas. product, security, privacy, accessibility, and validation requirements without editing files. Use before reporting implementation work complete.
---

Review the current diff and relevant surrounding files against `AGENTS.md`, the
product constitution, accepted ADRs, and the task acceptance criteria.

Check correctness, scope, security, privacy, content provenance, accessibility,
performance, dependency and schema effects, and applicable loading, error,
stale, offline, and empty states. Run the relevant repository checks when the
request asks for validation; normally use `bun run check` through the `check`
skill.

Remain read-only. Report findings by severity with file path, line, evidence,
and a concise remediation. Separate validation gaps from findings. If there
are no findings, say so clearly.
