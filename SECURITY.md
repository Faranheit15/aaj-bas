# Security policy

## Reporting a vulnerability

**Please do not report security issues in a public issue, pull request, or discussion.**

Report privately through GitHub: open the
[Security tab](https://github.com/Faranheit15/aaj-bas/security/advisories/new) and choose **Report a
vulnerability**. That opens a private advisory visible only to the maintainer.

Please include what you can — affected files or URLs, the impact you believe it has, and the steps to
reproduce it. A proof of concept helps, but a clear description is enough to start.

This is a small project maintained by one person. Expect an initial response within a week. If a
report is valid, the fix and the disclosure are handled in the private advisory until a patch ships.

## Scope

In scope:

- the two deployed applications, `aaj-bas-web` and `aaj-bas-landing`;
- the shared packages under `packages/`;
- the GitHub Actions workflow in `.github/workflows/`, including secret handling and permissions;
- the agent guardrails in `AGENTS.md`, `.claude/`, and `.codex/` — a way to bypass them is a valid
  report.

Out of scope:

- vulnerabilities in Cloudflare Pages or GitHub themselves; report those to the respective vendor;
- findings that require a compromised maintainer device or account;
- missing hardening headers with no demonstrated impact.

## What this project does not do

Some classes of vulnerability do not apply here by design, and that is deliberate rather than
accidental:

- there is no runtime backend, database, or server-side session;
- there is no authentication and there are no user accounts;
- no reader data leaves the reader's device;
- no third-party analytics, advertising, or tracking is loaded.

If you find evidence that any of these statements is false, that is itself a security report and we
would very much like to hear about it.

## Secrets

Deployment credentials live only in GitHub Actions secrets and are exposed only to deployment jobs on
pushes to `develop`. Pull requests never receive them. If you believe a secret has been exposed in
source, logs, build output, or a bundle, report it privately using the process above rather than
opening an issue.
