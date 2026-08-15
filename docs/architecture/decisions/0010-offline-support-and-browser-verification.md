# ADR-0010: Offline support, and the browser that verifies it

Status: Proposed
Date: 2026-08-15
Owners: Aaj, Bas. maintainers

## Context

AB-206 asks for a manifest, a service worker, a cache of the shell and the edition, and explicit offline and stale states. Its first acceptance criterion is that after one successful load the current edition opens in airplane mode.

This is the first thing this product ships that persists on a reader's device and is not recalled by serving different bytes. Every prior artifact rolls back the way ADR-0002 describes: deploy the previous build, and the next request gets it. A service worker is code that intercepts the request which would fetch its own replacement.

Two facts about the deployment target were verified against the live site rather than assumed, and both shape what follows.

**Cloudflare Pages answers an unmatched path with HTTP 200 and `text/html`.** It does not return 404. A request for a file that does not exist returns the reader's `index.html`.

**Pages sends `cache-control: public, max-age=0, must-revalidate` on everything**, including content-hashed assets. Nothing on this site is `immutable` today. So ADR-0006's rule that editions are never cached as immutable is currently satisfied by the platform default, and the browser's own HTTP cache cannot serve the shell offline — which is what makes a precache load-bearing rather than an optimisation.

## Decision

### The worker is hand-written, and adds no dependency

`vite-plugin-pwa` resolves to 315 packages and `workbox-build` to 310. What they buy is precache revisioning — computing content revisions for files whose names are not content-addressed. Vite already content-hashes every asset this application emits, and it emits one JavaScript file and one CSS file with no code splitting and no dynamic imports. The precache list is four literal URLs.

The stronger objection is not size but idiom. Adopting Workbox means the caching policy becomes a route table inside a plugin's configuration, where ADR-0006's rule that editions are never served stale to an online reader would live as an argument to a strategy constructor. This repository's consistent practice is the opposite: `planStaging`, `planRemoval`, `editionFreshness`, `coreStories` — decisions as pure functions, tested as values. `planRequest` and `mayCacheResponse` fit that; a route table does not.

`scripts/build-service-worker.ts` follows `scripts/stage-content.ts` exactly — discover files, delegate the judgement to `packages/domain`, execute, print, exit. The build id is a hash of the precache list's own contents rather than of a commit, so a content-only deploy produces a byte-identical worker and no needless update, while any asset change produces a different one.

The worker is emitted as a classic script rather than a module. Module service workers reached Firefox only very recently, and a module registration fails silently there — degrading offline support to nothing with no error a reader could see.

### Two caches, and only one of them is scoped to the build

The shell cache carries the build id. The content cache does not, and that is the decision acceptance criterion two turns on: keying editions by build would make every successful deploy delete the reader's saved editions, so a routine deploy would be a violation of the criterion.

Content is **network-first**, never cache-first and never stale-while-revalidate. ADR-0006 records that a correction rewrites a dated edition in place and bumps `editionVersion`; any strategy that serves the cached copy on this load and revalidates for the next would show an online reader the uncorrected text and reveal the correction only afterwards. Section 46 requires corrections to be visible. Network-first is the only strategy that cannot hide one from a reader who has a connection.

The shell and its hashed assets are cache-first, because the hash is the version.

### The `noscript` link is why classification is by path before navigation

`index.html` contains a real link to `/content/latest.json` inside its `noscript` block, for readers without scripting. A reader can click it, and that is a *navigation* to a content path. A worker that checked `mode === "navigate"` before it checked the path would answer it with the HTML shell — reintroducing, inside the service worker, precisely the catch-all bug `_redirects` carries a nine-line comment forbidding.

So requests are classified by path prefix first, and a test asserts it by value.

### The write side needs the content-type guard the read side already has

Because Pages answers a withdrawn edition with 200 and `text/html`, a worker that cached any successful response would overwrite a good cached edition with an HTML document. The reader would go offline the next day and get "We could not display this edition." indefinitely, and nothing would have reported an error at any point. `edition-repository.ts` already guards this on the read side; the same predicate now guards the write side, extracted so there is one definition.

### Deleting `sw.js` is the worst possible incident response

This is the operational fact that most needs writing down, because the intuitive fix is actively harmful here.

The service worker update algorithm requires the script response to carry a JavaScript media type. Remove `sw.js` from the build and Pages answers that path with 200 and `text/html`; the update fails on the media type; and **a failed update does not remove the registration**. The broken worker stays installed and in control, permanently. Chromium does unregister a worker whose script returns 404 — but Pages never returns 404, so that safety net does not exist on this host.

The kill switch is therefore a **tombstone worker**: a worker whose only job is to delete every cache this product created and unregister itself. It ships as a build-time variant, so activating it is an ordinary reviewed pull request through the existing deploy path rather than something written under incident pressure. It is the only worker permitted to reload clients; the real worker must never do so, because reloading a reader mid-edition is exactly the interruption section 49 asks about.

`skipWaiting` and `clients.claim` are used, and their cost is that a new worker takes over pages the old build loaded. The classic hazard — a lazily-imported chunk only the old build had — does not exist here, and a build-time assertion now fails if `dist/assets` grows a JavaScript file `index.html` does not reference. If a future slice introduces code splitting, that check forces the question back into the open instead of letting it break silently.

### ADR-0002's rollback plan still holds, but it is now conditional

Two invariants did not exist before this slice and now do: every deployment must contain a valid `/sw.js`, and the worker must never intercept its own script. The first is enforced by the build's `--verify` gate; the second by a value test over `planRequest`, and see the security section for what does *not* enforce it.

One honest degradation: rollback used to change what every reader got on their next request. A controlled reader now gets the rolled-back build on their next navigation after an update check. Pages sends `max-age=0, must-revalidate` on the worker script, so that bound is one navigation — but it is no longer instantaneous, and ADR-0002's promise should be read with that qualification.

### Playwright is added, for Chromium, for four specs

The maintainer chose this after the alternative was put to them.

ADR-0009 declined axe-core, and the shape of that decision is worth restating because it is regularly misremembered. It did not merely state a gap — it substituted something *stronger*: contrast became exact arithmetic over every block discovered in the palette, where axe would have sampled one theme's rendered pairs. The residual gap was marginal and the record said so.

There is no such substitute here. "The edition opens in airplane mode" is not a property of any source text. It is a property of a browser's Cache Storage after a real load, read back by a real fetch handler on a real navigation. jsdom has no service worker, no Cache Storage and no fetch interception — absence, not partial support. Every Node-side alternative investigated is either years unmaintained or a stub that would assert our own stub: a worker that never registers, registers at the wrong scope, throws in `install`, calls `respondWith` after the microtask checkpoint, or reads a response body twice returns correct values from every pure function in the module and fails completely in a browser.

**Offline is produced by stopping a real server, never by `setOffline`.** This is the load-bearing detail and the reason the decision needed a record rather than an install. `browserContext.setOffline(true)` does not apply to service-worker-owned requests in Chromium; the issue is closed as low priority with no fix. Under it, the worker's own `fetch` still reaches the network, so a spec that loads the page, goes "offline", reloads and finds the edition **passes with an empty cache and a worker that caches nothing** — green by construction, which is the exact failure ADR-0009 refused axe over, reintroduced by the tool ADR-0009 pointed at.

So the fixture owns the server and closes its socket, and every offline spec asserts its own precondition: a request to a path that was never cached must fail before any positive assertion is made. That is the same guard `palette.test.ts` carries when it asserts the stylesheet was actually read, and for the same reason — a check that reports success precisely when it failed to run.

The suite is four specs, scoped to this slice's own criteria plus the update path. AB-901 already exists and its fourth scenario is "offline open after prior load"; this record deliberately does not build AB-901. It leaves that slice a suite to extend rather than a runner to introduce.

**It is merge-blocking and it is not in `bun run check`.** Section 31 requires end-to-end tests to pass where a suite exists; it does not require one shell command. `bun run check` is the local inner loop of every slice, and a fresh clone should not need a browser download and a second language runtime to run it. Sections 5 and 30 are amended, because leaving them unamended would make this repository's own documentation false about what blocks a merge.

### The manifest carries no icons, and that is a mechanism

`display: minimal-ui` rather than `standalone`, decided as a product question: `standalone` removes the browser's reload control, and this slice's entire self-service recovery story is a reader being able to reload out of a bad cached shell.

No `icons` array. Section 27 forbids unnecessary images and this application ships zero image bytes today — a structural achievement of AB-202 and the PRD's own budget, not an accident. Omitting icons also makes the application non-installable in Chromium **by construction**, which is what keeps "no install prompt in this slice" true mechanically rather than by our restraint.

The install prompt is deferred with its reasons: the gate PRD section 7.1 specifies cannot be computed today, `local-state.ts` already says so in writing, and counting editions across days is close enough to the mechanic section 3.2 forbids that making the distinction is the work, not a footnote in a caching slice. This slice therefore adds no field to the stored document, no `beforeinstallprompt` listener, and no `appinstalled` listener — the last of which would be telemetry in shape even if it went nowhere.

### The download time is read, never minted

PRD section 7.2 wants the reader told when a cached copy was downloaded. ADR-0007's privacy argument states that no timestamp of reading is stored, and rejected least-recently-used eviction on exactly that ground.

Both are satisfied by reading the `date` header the response already carries. Nothing new is stored, nothing is minted on the device, and the fact is deleted with the copy it describes. When the header is absent or unparseable the sentence is dropped rather than faked from the device clock, and that behaviour has its own test — it is the point where a well-meant edit would quietly turn a property of the copy into a record of the reader.

## Alternatives considered

- **`vite-plugin-pwa` / Workbox.** Rejected above on dependency surface and on where the decisions live. Noted in passing: `workbox-build`'s tree includes a package whose purpose is queuing Google Analytics hits offline. It never reaches the bundle, so this is not a privacy breach — but installing it into a repository whose section 23 prohibits Google Analytics by name is the kind of thing that should be said out loud.
- **Runtime discovery of the assets to precache.** Rejected: on a reader's first visit the worker is not yet controlling, so nothing that load fetched passed through a fetch handler. `clients.claim` fixes control but not history. The criterion says *after one successful load*, so the shell must be precached during `install`, which means knowing the hashed names at install time.
- **Publishing Vite's build manifest for the worker to fetch.** Rejected: it publishes build internals and makes install depend on a second network round trip.
- **Caching editions from the page after `useEdition` resolves.** Rejected: it either costs an extra request on every load or forces the repository to hand back a `Response`, widening a boundary ADR-0006 argued for.
- **`setOffline(true)`, and `context.route()` with the experimental service-worker network flag.** Both rejected above; the second is the documented workaround and its failure mode is silent.
- **`service-worker-mock`, `sw-test-env`, MSW, `@vitest/browser`, workerd.** Rejected: unmaintained, or a mock of the subject, or — for `@vitest/browser` — not an alternative at all, since it requires Playwright as its provider.
- **Deferring the browser entirely to AB-901.** Rejected on sequencing rather than principle. AB-901 sits behind the whole ingestion and generation backlog, so the worker would be on production devices, unverified, while content shipped to readers.
- **`standalone` display, and shipping icons now.** Rejected above.
- **A "check for a new edition" control.** Rejected, and not on judgement: PRD section 8 explicitly excludes pull-to-refresh and user-triggered source fetching from v1.

## Consequences

The repository gains a second test runner, a browser binary, and — the one worth stating loudly — a second language runtime. Playwright's CLI carries a Node shebang, and running it under Bun is documented as hanging. The CI workflow already warns in prose that it "pins only Bun and inherits the runner's Node"; that hazard now applies to a merge-blocking check, so the end-to-end job pins Node explicitly. `bun run check` is deliberately unaffected, so the fresh-clone contract still holds for everything else.

`npx` cannot appear anywhere — `scripts/check-package-manager.sh` fails on it and every upstream Playwright document uses it. All invocations are `bunx`.

What is verified: Chromium, on Linux, on localhost, with a fresh profile and unmetered storage. What is not, and what the pull request must say rather than imply: iOS Safari, where stored data is evicted after roughly seven days of non-use and where this product's offline behaviour will diverge most; quota exhaustion; and lie-fi — a hanging connection rather than a refused one, which is both more common and more damaging than airplane mode, and which stopping a server does not simulate.

ADR-0009's deferred browser-based accessibility check now has its enabler, and this record deliberately does not take it. The two rules that mattered there are still answered more precisely by the palette arithmetic than axe would answer them. What changes is that the option is no longer blocked on tooling.

A new sequencing constraint follows from precaching the shell: a future bump of the published edition `schemaVersion` will be fetched by readers still running an older bundle. `editionSchema`'s literal version makes that refuse cleanly rather than half-render, but it turns a content schema change into a visible outage for those readers unless the worker update lands first. Any future section 16 change to published content must sequence the worker first.

This record is `Status: Proposed` above code that will merge, which makes three consecutive records in that state. That is worth a maintainer's attention independently of this decision.

## Security/privacy impact

No dependency reaches a shipped bundle: `@playwright/test` is a development dependency and appears in no build output. The end-to-end job needs no secrets and is therefore safe on pull requests from forks, which section 44 requires.

The worker never intercepts a cross-origin request. Source links go to publishers, and a worker positioned to observe that traffic would be a data-collection surface this product has no use for. It also never intercepts a non-GET request.

Nothing new is written to the reader's device beyond cached copies of already-public content: the shell, the assets, the pointer, and editions the reader loaded. No field is added to the stored document. No identifier is minted. The one timestamp displayed is read from a response header rather than generated.

The update path is the security-relevant part, and one claim here was corrected by testing rather than reasoning, so it is stated as it actually is.

A worker that could serve its own script from cache would never be replaceable remotely, turning any future security fix into a fix that never arrives. The worker therefore refuses `/sw.js` explicitly, and a value test asserts it. **But the fourth end-to-end spec does not catch that failure, and an earlier draft of this record claimed it did.** The claim was checked by patching the worker to precache and self-serve its own script: the spec still passed, because Chromium fetches a worker's script with the fetch handler bypassed, so a worker cannot answer for itself. The hazard is not reachable in Chromium.

The refusal stays, as defensive hygiene and because the specification does not guarantee that bypass everywhere. What the fourth spec actually proves is narrower and still worth having: that a new build reaches a reader who already has a worker — it fails if `skipWaiting` is removed, which was verified the same way.

Browser binaries are downloaded from Microsoft's CDN by a pinned package version and cached by lockfile digest. That is a new supply-chain surface in CI and is stated rather than waved past.

## Product-constitution impact

An edition that opens on a train is an edition that can be finished and left, which is the constitution's own claim about the reader's day.

Nothing here continues the edition. The worker caches what the reader already loaded and never prefetches an adjacent one, which ADR-0006 forbids by name. There is no refresh control, no update toast, no install prompt, and no notification capability — push, notifications, background sync and periodic sync are excluded from the worker by decision, not by omission.

The offline copy describes the copy, never the reader's network. The product does not tell a reader they are offline while it has something to show them: the operating system already does, and a second quieter claim can contradict it on a captive portal. Where there is nothing to show, the existing failure copy already says it, and stays.

## Rollback plan

The service worker's rollback is the reason this record exists, and it has three tiers.

For a bad shell or a bad asset: roll the Pages deployment back, per ADR-0002. That restores a valid worker with a different build id, so controlled readers update to it on their next navigation and their shell cache is replaced.

For a fault in the worker's own logic: merge the tombstone variant. Readers unregister and clear on their next navigation.

**Never delete `sw.js` from the build.** Pages answers the missing path with 200 and HTML, the update fails on the media type, and the broken worker stays installed forever.

For the Playwright half: remove the dependency, delete the suite, the config and the CI job, and restore the two amended sentences. Nothing shipped depends on it and no reader is affected; the cost of reverting is the coverage itself.
