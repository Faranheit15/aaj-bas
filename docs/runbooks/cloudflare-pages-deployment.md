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

Since AB-206 the reader ships a service worker, and rolling it back is no longer the same operation as rolling back a page. Read the next section before touching a deployment that contains one.

## Service worker incidents

A service worker is the one artifact this product ships that a reader keeps. Every other rollback works by serving different bytes on the next request; a worker is code that intercepts the request which would fetch its own replacement. ADR-0010 records the design; this section is what to do at 2am.

### Tier 1 — roll the deployment back

For a bad shell, a bad asset, or a bad edition: roll back in the dashboard exactly as above.

That restores a valid `/sw.js` with a different build id, so a controlled reader installs it and replaces their shell cache. Their saved editions survive, because the content cache is deliberately not keyed by build.

One honest qualification on ADR-0002's promise. A rollback used to change what every reader got on their next request. A reader who already has a worker gets the rolled-back build on their next navigation *after* an update check completes — Pages sends `cache-control: public, max-age=0, must-revalidate` on the worker script, so that bound is one navigation, but it is no longer instantaneous.

### Tier 2 — merge the tombstone

For a fault in the worker's own logic, where serving a different build would not help because the worker is what is wrong: merge a build of the tombstone variant.

```bash
bun scripts/build-service-worker.ts --tombstone
```

It ships as a reviewed pull request through the ordinary deploy path rather than as something written under incident pressure. Its only job is to delete every cache this product created and unregister itself; it is the only worker permitted to reload clients. `apps/web/src/service-worker/tombstone.ts` is the whole of it.

### NEVER delete `sw.js` from the build

This is the intuitive fix and it is unrecoverable. It deserves the space.

Cloudflare Pages answers an unmatched path with **HTTP 200 and `text/html`** — it does not return 404. So removing `sw.js` does not make `/sw.js` missing; it makes `/sw.js` an HTML document served successfully.

The service worker update algorithm requires the script response to carry a JavaScript media type. It gets `text/html`, and **the update fails**. A failed update does not remove the registration. The broken worker stays installed and in control of every device that has it, permanently, with no remote fix left — the tombstone in tier 2 is itself delivered by an update, and updates no longer complete.

Chromium does unregister a worker whose script returns 404. That safety net is real and it never fires here, because this host never returns 404.

Verify before and after any deploy that touches the worker:

```bash
curl -sI https://aaj-bas-web.pages.dev/sw.js | grep -i '^content-type'
```

It must report a JavaScript media type. `text/html` means `/sw.js` is not in the build and the deployment must not go out — or, if it already has, must be rolled back to a deployment that contains one before anything else is attempted.

CI runs `bun scripts/build-service-worker.ts --verify apps/web/dist` after the reader's build for this reason: a deployment without a valid worker, or one that intercepts its own script, fails there rather than on readers' devices.
