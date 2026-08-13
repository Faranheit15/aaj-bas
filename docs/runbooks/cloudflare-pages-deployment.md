# Cloudflare Pages deployment

## Purpose

`develop` is the production branch. Every successful push to it runs the full Bun check suite and then deploys the reader followed by the landing page. Pull requests run checks only and never receive Cloudflare credentials.

The deployment uses Cloudflare Pages Direct Upload. Do not connect these projects to Cloudflare Git integration: Cloudflare does not support converting a Direct Upload project to Git integration later.

## One-time setup

**Human only. Agents must not run this section.** Creating the Cloudflare projects, the API token, and the GitHub secrets is paid-infrastructure and secret handling, which AGENTS.md section 47 reserves for an authorized human. `.claude/settings.json` denies `Bash(bunx wrangler *)` and `Bash(gh secret *)`, and `.codex/rules/team.rules` forbids the same for Codex, so an agent that runs these commands is denied without further explanation. An agent following this runbook starts at **Delivery flow**.

Create two Cloudflare Pages Direct Upload projects in the intended Cloudflare account:

- `aaj-bas-web`
- `aaj-bas-landing`

Set each project's production branch to `develop`. With an authenticated Cloudflare account, the equivalent Bun commands are:

```bash
bunx wrangler pages project create aaj-bas-web --production-branch=develop
bunx wrangler pages project create aaj-bas-landing --production-branch=develop
```

Create a Cloudflare API token with only `Account > Cloudflare Pages > Edit` permission for that account. In the GitHub repository, add these Actions secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Do not add either value to a local `.env` file, source file, test, or GitHub Actions variable.

## Delivery flow

1. Push a reviewed commit to `develop`.
2. The `check` job runs `bun ci` and `bun run check`.
3. If it succeeds, `aaj-bas-web` is built and deployed.
4. The landing page is built with the reader's stable production alias in `VITE_APP_URL` and then deployed to `aaj-bas-landing`.

The landing CTA points at `https://aaj-bas-web.pages.dev`, the alias Cloudflare keeps pointing at the reader's current production deployment. It is set as `READER_PRODUCTION_URL` in `.github/workflows/ci.yml`.

It deliberately does not use the per-commit deployment URL wrangler emits. That URL is immutable: a landing page built against it keeps serving a withdrawn reader build after a rollback, and the CTA is the only link a reader follows. The per-commit URL is still recorded as the GitHub deployment URL for `deploy-web`, where pointing at one exact build is what you want.

Renaming the `aaj-bas-web` Pages project, or moving the reader to a custom domain, means updating `READER_PRODUCTION_URL` in the same commit.

## Rollback

In Cloudflare Dashboard, open **Workers & Pages**, select the affected project, open its deployment history, select the last known-good production deployment, and choose **Rollback**. Roll back the reader first if both applications must return to an earlier state, then roll back the landing page.

Rolling the reader back is enough to change what the CTA serves, because the landing page links to the project alias rather than to a single deployment. The landing page only needs its own rollback when the landing page itself is at fault.

Record the incident and the reverted deployment in the relevant pull request or issue. Do not remove deployment history.
