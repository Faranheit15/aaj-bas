# ADR-0009: Theme, and accessibility verification without a browser

Status: Proposed
Date: 2026-08-15
Owners: Aaj, Bas. maintainers

## Context

AB-205 asks for five things: light, dark and system themes; reduced-motion behaviour; focus styles and a skip link; contrast tokens; and an automated axe check. Its first acceptance criterion is "no serious or critical axe violations in the main flow".

Four of those five are ordinary work. The fifth is not, and it is why this record exists.

`AGENTS.md` section 5 lists axe-core and Playwright together as tools this repository has deliberately not installed, each requiring an ADR. So AB-205 as written cannot be executed at all without a decision first — the backlog item assumes tooling the repository chose not to buy. Section 2 ranks issue acceptance criteria below `AGENTS.md`, and requires a material conflict to be reported rather than guessed at.

The theme half brings its own decision. It is the third and last field PRD section 14 declares that this product had not yet stored, and it is the first stored value whose effect is visible on the page the instant it changes.

## Decision

### The reader is themed by an attribute, and "system" is the absence of it

`data-theme` on the document element, holding `light` or `dark`. A reader who has chosen **system carries no attribute at all**.

That is the load-bearing choice, and it is what makes the hard part free. "System must keep following the operating system, live, after the reader has explicitly chosen it" costs zero code: a document with no attribute is byte-for-byte the document this product served before this slice, so the existing `prefers-color-scheme` media query keeps doing the work — with no `matchMedia`, no listener, no subscription, and nothing React owns. There is nothing there to regress.

The rejected alternative is the common one: resolve "system" in JavaScript and always write a concrete `data-theme`. It converts a property the browser maintains for free into application state needing a change listener, a cleanup and a test, and it makes the operating system changing under a backgrounded tab depend on our event handling rather than on the cascade.

The system selector is `:root:not([data-theme="light"]):not([data-theme="dark"])` rather than `:not([data-theme])`, so that any *other* value — a newer build's, a typo, a stale attribute — still means "the operating system decides", which is the product's default rather than an error state.

### The theme is pinned before the first paint, by a synchronous script

The stylesheet is render-blocking and the application bundle is a module, therefore deferred. A reader who pinned dark on a light system would watch the page paint cream and then repaint. No React hook can prevent that at any cost; only something synchronous in the document head can.

So the reader's HTML carries a small classic script that reads the stored document and pins the attribute. Three properties of it are deliberate and each is load-bearing:

- it **refuses to read a document whose `schemaVersion` it does not recognise**, because ADR-0007 says of a newer document "read nothing from it". Without that check the script would apply a theme the store simultaneously reports as absent, producing the very flash the script exists to remove;
- it applies **only** `light` or `dark`, so its failure mode for every other input is identical to its success mode — an unreadable device, an unknown value, a blocked storage API and a reader who chose system all leave the attribute off, which is the system state;
- its single `try` replaces five guards, and covers the case `device-storage.ts` already documents: reading the storage *property* can itself throw in private browsing.

The duplication this introduces is four facts — the key, the version, the field name, and the two values — and it is unavoidable, because a head script cannot import the bundle. It is held against drift **behaviourally rather than structurally**: a test extracts the script's own text from the HTML, seeds the device through the store's real writer, evaluates the script, and asserts the attribute. Renaming the key, renaming the field, bumping the version or deleting the script turns it red. That is a stronger guarantee than sharing a constant would give, because sharing a constant is impossible here and asserting the string alone would not catch a changed document *shape*.

One divergence is accepted rather than hidden: a version-1 document corrupt in some *other* field reads as replaceable in the store — theme "system" — while the script still applies a theme it can read. The cost is one repaint at mount, on a device whose state is already being discarded. Exact parity would mean duplicating schema validation in a head script, which is out of proportion to it.

**This script constrains a future Content Security Policy.** Cloudflare Pages serves static headers, so a per-request nonce is impossible; a strict policy must carry this script's `sha256` hash. It is written down here so that the slice adding the policy does not reach for `unsafe-inline` — defeating the policy for the whole application to accommodate two hundred bytes.

### The theme vocabulary is validated leniently, by ADR-0008's criterion

ADR-0008 set the rule: strictness where the vocabulary is fixed by nature, leniency where it is a product decision the product has already said it may change. Applied honestly, `light | dark | system` is **ours**. Nothing outside this repository fixes it at three, and a fourth value is plausible — the operating system already exposes `prefers-contrast`, and AB-205's own deliverable list names contrast as a separate concern.

So the stored field is validated as a string and resolved to the vocabulary at the accessor, never by a schema transform. Under a strict enum, shipping a fourth theme later would be enough to destroy readers' state: a reader picks it, a stale edge or AB-206's service worker serves this bundle, `schemaVersion` is still 1 so the never-clobber rule does not engage, validation fails, and the next expanded story takes a month of viewed sets, the ended editions and the interests with it — over a colour. The leniency stays bounded by shape: a theme that is not a string is still a document this build may replace.

### The theme control lives in the banner, and the settings surface is deferred with its reason

ADR-0008 predicted this moment in writing: "AB-205 adds a second setting; that is the slice at which a settings surface earns its own record." This record declines to build one, and says why rather than leaving it as an accident.

The theme control goes in the shell's banner, not beside AB-204's interest disclosure at the end of the edition. A theme is wanted **on arrival**, not after ten stories; a reader who never scrolls to the end would never find it; and it must exist on the three load states that have no edition at all, which a control inside the edition view cannot do. Section 3.1 constrains content that continues the edition — a preference control is chrome, not content, so the placement pressure that decided AB-204 does not apply.

The consequence is that preferences now sit in two places. Unifying them would mean moving AB-204's block, which is unrelated refactoring (section 35), and would move the interest invitation away from where PRD section 7.1 puts it.

The control wears the bordered idiom `.edition-action` and the revealed skip link already use, rather than the underlined word it was first drawn as. That first form put the appearance of a link on the one control this record argues hardest must never be one — on the three load states with no edition it was the only underlined thing on the page — so the semantics and the styling disagreed while a test enforced only the semantics. It is still the quietest thing in the banner: no fill, no hover state, and the smallest type on the page.

The landing application gets the restructured palette and **no control**. It cannot have one: the two applications are separate Cloudflare Pages projects on separate origins, and device storage is origin-scoped, so a landing control could not read or write the reader's answer. It would be a second, unsynchronised preference — two identical-looking controls that disagree, which is worse than one.

### Reduced motion is satisfied by absence, and by the assertions that keep it that way

There is no motion in any stylesheet or document this product ships, and it is asserted rather than observed. `@keyframes`, `animation`, `transition` and `scroll-behavior: smooth` are forbidden in both applications' stylesheets, in the shared palette, and in the content of any `<style>` either `index.html` carries; `position: sticky` and `position: fixed` are forbidden alongside them in both stylesheets.

The documents are named in that list deliberately. The reader's already ships a `<style>` block for its `noscript` rule, which makes it an established home for CSS rather than a hypothetical one — and a `transition` written there is read by no stylesheet test at all. What remains uncovered is motion written as an inline `style` attribute or driven from JavaScript. Nothing does either, and this record does not claim an assertion where there is none.

Adding a `prefers-reduced-motion` block would be worse than doing nothing, for two reasons. The conventional global reset **contains** `animation-duration` and `transition-duration`, so it cannot be added without deleting an assertion this repository argued for — the codebase refusing the change is the codebase answering the question. And a global reset *legitimises* motion: the next person finds it, concludes reduced motion is handled, and adds an animation. The current arrangement is stronger, because there is no way to add motion that forgets the query — adding motion fails outright and forces the argument into the open.

Three real gaps are closed instead: the no-motion assertions now cover the shared palette, which is where a theme cross-fade would most naturally be written; they cover both `index.html` documents, which is where CSS can be written outside every stylesheet; and `scroll-behavior: smooth` is now forbidden by name. It is motion, it is exactly what the media query exists for, it passed all three existing patterns, and the shell already scrolls on route change.

### Accessibility is verified by arithmetic and by source text, not by axe

**axe-core is not added.** The maintainer chose this after the finding below was put to them.

Deque's own documentation states that the `color-contrast` rule does not work under jsdom; the reference wrapper for that environment disables it outright. The mechanism was verified against the exact jsdom this repository already installs: `getBoundingClientRect` returns hard-coded zeros, `getClientRects` returns an empty list, and `elementsFromPoint` is not implemented at all. `target-size` is worse than unavailable — it is disabled by default in axe, needs the same missing layout, and tests against 24 pixels where section 25 requires 44.

Those two rules are exactly AB-205's contrast-tokens deliverable and its touch-target criterion. And the rule that sounds like it covers the skip link, `bypass`, is satisfied by the presence of a `main` landmark — which this reader already had, so axe would have reported the skip link delivered before it was written.

An axe run here would therefore report zero violations today and keep reporting zero, not because the reader is verified but because the rules that could fail are off and the rules that remain are already asserted more specifically by the existing suite: not merely that a button has a name, but that it is named "End today's edition". A gate that cannot fail on the deliverable it is named for is the first test in this repository that would be satisfied vacuously by construction, and this repository writes tests specifically against that failure. Adding it would make the guardrail true in a way that is technically accurate and materially misleading.

What replaces it:

- **contrast becomes arithmetic over the palette.** WCAG relative luminance, computed over every theme block discovered in the stylesheet, asserting the pairings that carry meaning. This turns a prose instruction that already existed — "re-check all four before changing it" — from a convention into a mechanism, which is the same upgrade ADR-0006 made when it refused "remember not to copy the sample edition". Because the assertions are driven by the blocks *discovered* in the file, a third theme added later without contrast clearance fails here rather than shipping;
- **one token is deliberately out of scope, and the test says so.** `--rule` is 2.94:1 on the light surface. It is correct: it is only ever a divider, and the non-text contrast criterion does not apply to purely decorative boundaries. A blanket "every token clears 3:1" rule would fail on the day it was written, and the temptation would then be to lower the threshold — which is worse than having no test at all. It becomes in-scope the moment `--rule` is used as a control boundary, and that trigger is armed rather than written down: the reader's `styles.test.ts` fails if `--rule` appears in any rule naming a control or the fieldsets that group them, so the exemption's condition is a check rather than a note to a future reviewer;
- **touch targets are asserted as declarations**, read out of the stylesheet, with the limitation stated in the test itself: this proves the rule exists, not that the rendered box is 44 pixels, and a target defeated by a parent's overflow or a transform would pass. Only a browser can assert the box;
- **keyboard operability is asserted structurally, over the main flow, in two stages**: every control is a natively focusable element carrying no `tabindex`, and buttons, links, checkboxes and radios are all collected. This matters more than it sounds, because `getByRole("button")` also matches a `div` with a role — which is not keyboard operable — and almost every existing control test would have stayed green through that substitution.

  Two stages rather than one, and the correction is worth recording because the single-stage version read as though it covered everything and did not. A walk has to press things, and pressing the end-edition control unmounts it, so an inventory taken only after the walk said nothing about the one control this slice's own acceptance criterion is named for: re-implementing it as a `div`, or giving it `tabIndex={-1}` so a keyboard reader could never end the edition at all, both passed. The resting page is therefore examined before anything is pressed, and the walked page after. What is still outside the claim is the failed-load view's two controls, which their own tests render and name but do not hold to this property.

The honest summary is that this closes the gap where it can be closed and leaves it visible where it cannot, rather than covering it with a green check.

**Focus styles stop being an enumeration.** Every control had a ring, but only because seven class names were remembered; the eighth — this slice's own theme control — would have inherited nothing. One base rule keyed on what the platform makes focusable replaces the lists, so the next control added inherits the treatment instead of waiting to be added to one.

Each application asserts its own copy of that rule — width, colour token, and the positive `outline-offset` the contrast arithmetic depends on — and the landing page's test compares the two blocks as text, so the two cannot drift apart on focus. That comparison is the only place either application reads the other's source, and it is there because the claim it makes is about the pair.

## Alternatives considered

- **axe-core in jsdom with `color-contrast` disabled.** Rejected above: a gate that cannot fail on the two things AB-205 is for.
- **axe-core with Playwright, now.** Substantively the right answer and structurally the wrong slice. It is the only configuration in which the acceptance criterion is genuinely checkable, and it is roughly 350 MB of browser binaries, a second test runner, a development server inside the blocking suite and the full end-to-end decision — arriving inside a theming change. Sections 33 and 48 both refuse that. Deferred, and the deferral is recorded below so the option is closed with a reason rather than left open.
- **`vitest-axe`.** Rejected on maintenance alone before any other argument: its only release predates the Vitest generation this repository runs by several major versions.
- **`@axe-core/react`.** Rejected: it is a development-time console overlay, not a gate — nothing fails — and it would become a second console writer outside `packages/logger`, which ADR-0003 exists to keep singular.
- **Resolving "system" in JavaScript** and always writing a concrete attribute. Rejected above.
- **`light-dark()` in the palette**, which would state each colour once and delete the media query. Rejected on support: where it is unavailable the declaration is invalid at computed-value time, so the custom property resolves to nothing and the page loses its background *and* its text colour. Re-open when this repository states a browser-support floor. The cost accepted instead is one duplicated block, pinned by a test asserting the two declare identical values.
- **A global `prefers-reduced-motion` reset.** Rejected above.
- **A `/settings` route** for the theme. Rejected as ADR-0006 rejected it for interests: no route is reachable from the end of an edition, and the shell deliberately has no navigation landmark.
- **A theme control on the landing page.** Rejected: it is a different origin and could not read the reader's answer.

## Consequences

The reader now honours light, dark and system, with no flash on any of them, and the choice survives a reload.

The browser chrome follows the operating system through a pair of `theme-color` metas **in both applications**, which fixes a bug that predates this slice — a single light value was painting cream chrome above a dark page for every dark-system reader. Both documents are held to it the same way, each by its own test reading the palette's two `--surface` values, because this consequence is stated for the product and a fix asserted in one application only is a fix in one application only. It follows the *operating system*, not a pinned theme: a reader who pins dark on a light system still gets light chrome. Closing that would need a subscription to system changes purely for browser furniture, reintroducing the listener this design deleted, and no acceptance criterion asks for it.

The two applications' stylesheets no longer declare `color-scheme`; the palette owns it per theme. That is not tidying — the application declarations are imported after the palette and won at equal specificity, so leaving them would have left the system case wrong while the pinned cases looked right. Both stylesheets assert the absence, the reader's for the case where it decides something: it is the application with pinned themes and with AB-204's six native checkboxes.

Each application also asserts that it imports the palette at all, and that every token it spends is one the palette declares. The contrast arithmetic is computed over `palette.css`, and until that assertion existed nothing obliged either shipped page to consume the file it was computed over — deleting one `@import` line loses the background and the text colour together, which is exactly the failure `light-dark()` was rejected for.

Whether `color-scheme` belongs in `packages/ui` at all is a re-reading of section 10, which says that file is colours only. It is neither spacing, type, nor a component style: its entire effect is which colours the user agent paints for form controls, scrollbars and the canvas — the same fact the block it sits in states, addressed to the browser instead of the page. It is needed because AB-204 shipped six native checkboxes, which would otherwise render light on a pinned-dark page. **Flagged for the reviewer as a judgement call**, with the alternative being that the three selectors live twice, once per application.

The reader's shell now renders one link, where an assertion previously required zero. The assertion is replaced rather than loosened, and the replacement is stronger in three ways: the edition itself still carries no link, so every case the original protected against still fails; the document's link inventory is now an exact list rather than a count; and the skip link's destination is asserted, which "zero links" could never say.

A future Content Security Policy inherits one constraint, recorded above.

PRD section 14 is now at its most stale, and this is the last slice that could have changed that. All three of the fields it declares required — interests, ended editions, and now theme — are optional in the implementation, because required would invalidate every document already on a reader's device. **What is exhausted is the list of slices; the divergence itself is wider than ever.** It closes only when a maintainer amends section 14 to show the optional fields and state the additive rule, or records that the interface is an intent sketch rather than a shape. An agent editing the PRD to match the code would be rewriting a lower-priority document to match the implementation, which section 2 forbids.

ADR-0008 is still `Status: Proposed` while its code is merged. This record leans on its leniency criterion, so it inherits an unratified premise. Noted rather than assumed — and this record is the same case, not an observer of it: it is `Status: Proposed` above its own merged code, so a reader arriving later finds two consecutive records in that state and no ratification for either.

## Security/privacy impact

The theme is a preference, and it is the least sensitive thing this document holds — any stylesheet on any origin can already read `prefers-color-scheme`. It is nonetheless kept to the same rule as the rest: it never appears in a log line, and the store's field vocabulary stays closed and asserted so that adding it would have to be a deliberate act.

The pre-paint script **reads and never writes**. It touches one key, applies one attribute, and swallows every failure into the state a first-time reader is in. It sends nothing, mints no identifier, and reads no clock. Its refusal to parse a document from a newer build is a privacy-adjacent property as well as a correctness one: it is the same never-read-a-foreign-document rule the store obeys, extended to the one piece of code that runs outside the store's reach.

No network path is added anywhere in this slice. The claim originally made here — that "the existing assertion covering that continues to hold" — overstated its own coverage: the assertion it pointed at named four files by hand, and this slice's own modules were not among them, so the property was true of the code and unasserted by the test it cited. ADR-0011 closes that gap with a sweep over the whole reader, and the property is now checked rather than reviewed.

## Product-constitution impact

A theme makes the product easier to read and does nothing to make it harder to leave. There is no preference the reader must set, no prompt asking them to set one, and no state that accumulates: the control is present, it is operable, and a reader who never touches it is in the same position as one who does.

The skip link is the first thing in the tab order and leads to the edition. It is not a way out of the edition — it moves focus to the landmark the edition is already in — so the shell still offers no route anywhere, which is what section 3.1 protects.

Nothing here counts, scores, congratulates or rewards. The theme control shows three options and the reader's current answer, and stops.

## Rollback plan

Revert the commit. Every reader returns to following their operating system, which is what the product does today, and the palette returns to the two-block form.

Documents already holding a theme become inert: the field is optional and unknown top-level keys are preserved, so a reverted build reads those documents as valid, ignores the field, and does not strip it. A reader who rolls forward again finds their choice intact.

The pre-paint script is the only piece with a footprint outside the bundle. Removing it removes the future policy constraint with it.

The accessibility assertions are pure tests and one CSS rule; reverting them loses coverage and changes no rendered pixel.
