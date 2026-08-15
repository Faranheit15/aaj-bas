# Verifying offline reading by hand

## Purpose

CI verifies offline reading in one browser: Chromium, headless, on Linux, on
localhost, with a fresh profile and unmetered storage. That is what
`apps/web/e2e/offline.spec.ts` covers and it is all it covers.

This procedure is the other half. It takes about five minutes in a real browser
on a real profile, and it is the only check that sees Firefox, Safari, a phone,
a profile that already has a worker installed, or a person deciding whether the
result reads honestly.

Run it before merging a change to `apps/web/src/service-worker/`,
`scripts/build-service-worker.ts`, `apps/web/public/manifest.webmanifest`, or
`apps/web/src/register-service-worker.ts`. Run it in at least one browser that
is not Chromium.

**Do not run this against `bun run dev`.** The development server has no
`/sw.js` and registration is disabled outside a production build
(`register-service-worker.ts` says why). There is nothing to verify there.

## 1. Build and serve

```bash
bun run --filter @aaj-bas/web build
bun scripts/serve-dist.ts apps/web/dist
```

The server prints the port it bound. Leave this terminal alone; you are going
to kill this process on purpose in step 4, and that is the whole point of the
procedure.

If no edition is published yet, the reader will show its no-edition state and
there is nothing to verify. Stage the sample content first:

```bash
bun scripts/stage-content.ts --include-sample-data
bun run --filter @aaj-bas/web build
```

Then run `bun scripts/stage-content.ts` again when you are finished, so the
build in your working tree goes back to publishing only publishable editions.

## 2. Load the reader

Open `http://127.0.0.1:<port>/` — not `localhost` with a different spelling
each time. A service worker, its caches and its scope all belong to an origin,
and `localhost` and `127.0.0.1` are two origins with nothing in common.

Read the edition. Wait a couple of seconds after it renders: the worker
registers after the `load` event, and its install fetches the shell, the
pointer and today's edition.

## 3. Check Cache Storage, and stop if it is empty

DevTools → **Application** → **Cache Storage**. In Firefox this is
**Storage** → **Cache Storage**; in Safari, **Storage** → **Cache Storage**
with the develop menu enabled.

You should see two caches:

- `aaj-bas-shell-<build id>` — `/index.html`, the two hashed `/assets/` files,
  and `/manifest.webmanifest`;
- `aaj-bas-content-v1` — `/content/latest.json` and one
  `/content/editions/<date>.json`.

**If Cache Storage is empty, or the content cache holds no edition, STOP.**
Nothing after this point proves anything: a reader with an empty cache and a
browser that is still reaching the network will show you a perfect edition in
step 5, and you will have verified the network. Find out why the worker did not
install — the console will usually say — and start again.

Also check **Application → Service Workers**: exactly one worker, status
**activated and is running**, source `/sw.js`.

## 4. Stop the server, not the browser's offline checkbox

In the terminal from step 1, press `Ctrl-C`.

**Do not use DevTools' Offline throttling, and do not use aeroplane mode as the
first check.** DevTools' offline mode does not reliably apply to requests the
service worker makes itself — it is the same defect that rules out Playwright's
`setOffline` and it is recorded in ADR-0010. Under it, the worker's own `fetch`
can still reach the network, so an application that caches nothing looks
identical to one that caches everything. Ending the server is the only stop
that is a stop for every request in the browser.

Aeroplane mode on a phone is a genuine test and worth doing — but do it *after*
this one, so you already know the cache is populated.

## 5. Confirm the network really is down, from the console

Before reading anything on the page, in the DevTools console:

```js
await fetch(`/__never-cached-${Date.now()}`).then(() => "reachable", () => "unreachable");
```

It must print `"unreachable"`. That path matches nothing in either cache and
the worker deliberately does not intercept it, so a `"reachable"` answer means
something is still serving — a second server on the same port, a proxy, or a
browser extension — and everything below is meaningless until it is not.

## 6. Reload, and read the notice

Reload the page. The edition should render in full.

The notice under the heading should name the copy, not your connection. For an
edition that is not today's, it reads:

> This is the most recent edition saved on this device. It is not today's
> edition. Downloaded <date and time>.

Check what it does **not** say. None of "You are offline", "Check your
connection", "Offline mode", "Showing cached content", "Some content may be
missing", or "Update available" belongs anywhere on this page —
`apps/web/src/edition/edition-notice.ts` lists each one with the reason it is
excluded. The operating system already tells the reader about their network;
a second, quieter claim can contradict it on a captive portal.

Confirm the "Downloaded" time is plausible — it is read from the response's
`date` header, so it is when this copy arrived, not now.

## 7. The update path

Restart the server:

```bash
bun scripts/serve-dist.ts apps/web/dist
```

Reload once. The page will still be the old build; the update check is what
that navigation started. Reload again. The document's script tag should now
point at the new build's `/assets/` file, **Application → Service Workers**
should show one worker with a new script, and Cache Storage should hold one
`aaj-bas-shell-<build id>` with the new id and no other.

`aaj-bas-content-v1` must still hold the edition it held before. If a deploy
emptied it, the reader lost editions they had saved, which is the failure
`apps/web/src/service-worker/cache-names.ts` is named the way it is to prevent.

To see this properly you need two different builds. Rebuild with a source
change between the two loads, or use the same lever the end-to-end suite uses:

```bash
bunx --bun vite build --minify false   # from apps/web; different asset hashes
bun scripts/build-service-worker.ts    # from the repository root
```

## 8. Unregister and clear storage before going back to work

This step is not optional and it is not tidiness.

DevTools → **Application** → **Service Workers** → **Unregister**, then
**Application** → **Storage** → **Clear site data**.

A worker registered from a production build on `127.0.0.1` outlives the server
that installed it and keeps its scope. Start `bun run dev` on that port
afterwards and the worker answers navigations from a cache of a build that no
longer exists: edits appear not to take, the shell is stale, and nothing in the
terminal says why. It reliably costs somebody an afternoon.

Then, if you staged sample content in step 1:

```bash
bun scripts/stage-content.ts
```

## What this still does not cover

- **iOS Safari.** No CI job runs it, and it is where this product's offline
  behaviour diverges most: stored data is evicted after roughly seven days of
  non-use, so a reader who opens the product weekly may never have a cached
  edition when they need one. Worth checking on a real device before any claim
  about offline reading is made in the landing copy.
- **Quota exhaustion.** A device with no room refuses the write, and nothing
  here fills a disk.
- **Lie-fi.** A connection that hangs rather than refuses is more common and
  more damaging than aeroplane mode, and stopping a server does not simulate
  it. The worker has no fetch timeout today.
