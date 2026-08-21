# ADR-0012: The source registry, and what it cannot promise

Status: Proposed
Date: 2026-08-15
Owners: Aaj, Bas. maintainers

## Context

AB-401 creates `content/sources.yml`: the list of feeds this product is permitted to fetch, with the licensing and review fields that make each permission auditable. It is the first file in this repository whose contents decide what code will later reach out to on the network, and the last point before AB-402 at which a human reads that decision in a diff.

Two facts were verified rather than assumed, and both shape the design.

**Bun 1.3.14 parses YAML natively.** `Bun.YAML.parse` exists, so the file needs no dependency. But `Bun` is undefined under Vitest, so parsing must live in the command and judgement must live in `packages/domain` — the same split `stage-content.ts` and `planStaging` already use.

**The WHATWG URL parser normalises more than expected, and less than needed.** Every classic IPv4 obfuscation — decimal `2130706433`, octal `0177.0.0.1`, hex `0x7f.0.0.1`, short form `127.1`, percent-encoded, unicode digits, a trailing dot — arrives as exactly `127.0.0.1`. So a check on the parsed hostname is sound, and reimplementing `inet_aton` would only add bugs. But the same parser re-spells embedded IPv4 in hexadecimal: `::ffff:169.254.169.254` becomes `[::ffff:a9fe:a9fe]`, which defeats every string comparison. And `file:`, `javascript:` and `data:` all parse *successfully* with an empty hostname, so a private-address check alone passes them vacuously.

## Decision

**The registry's contract lives in `packages/domain`, not `packages/schemas`.** ADR-0007 fixed the criterion: that package is the source of truth for what the product *publishes*. This file is never served, never fetched by a reader, and appears in no build artifact. It fails that test. It also fails ADR-0007's other clause in the opposite direction — several packages will read it — which is why it does not live beside the command either, in `scripts/`, where the merge-blocking test runner does not reach.

**A discriminated union on `active`, not a boolean with a cross-field check.** Both reject the same values; only the union makes the invalid state unrepresentable. With a boolean, every consumer sees `permittedUse?: string` and writes `?? ""`, and the acceptance criterion is enforced once at the parser and forgotten everywhere after. With the union, `if (source.active)` narrows to a type where the review fields are present, so the criterion travels into AB-402 and AB-404 as a type and a future slice cannot construct an active source without supplying them. That difference is invisible to every value test, so it has a type-level test of its own.

**A `sample: true` entry may not carry a terms review at all.** This is the mechanism that makes a fabricated legal review structurally impossible rather than merely discouraged: a sample must name a reserved host, must not be active, and must not carry `termsUrl`, `termsReviewedOn`, `termsReviewedBy`, `permittedUse`, `permittedUses` or `attribution` — the sample branch has no such keys at all, so `strictObject` rejects them rather than a rule catching them afterwards. A registry mixing reserved and real hosts is a blocking finding, so the pull request that adds the first real source has to delete the samples — a whole-file, deliberate, reviewed diff rather than a field quietly filled in.

That matters because the alternative is the worst artefact this slice could produce. Writing a plausible permitted-use note beside a real publisher's feed would be an agent asserting a legal review that did not happen, **in the very file whose purpose is to record that the review happened** — and AB-402 would read it as authorisation. Section 18 forbids assuming a feed grants reuse rights; section 20's "do not fabricate" is not scoped to article text; and this repository is public, so the fabrication would also be a public claim about a named third party's terms.

**`https:` only for a feed URL, and blocking.** A plain-http feed means an on-path attacker chooses the content of a news product, and everything downstream — the summariser's inputs, the editorial guarantees, the correction record — is downstream of text the attacker wrote. The cost is zero today because no entry exists to grandfather, and it is expensive to impose after twenty do. There is deliberately no per-source override: a flag that silences a security control in a file nobody re-reads is the mechanism section 47 forbids, and `report.ts` already refuses a silenceable severity. A source that genuinely requires http is a reviewed pull request changing the rule.

Note the deliberate asymmetry with `url/https-only`, which is a *warning* on published editions. An edition's source URL is a link a reader clicks, pointing at content already published elsewhere; a registry feed URL is a document this product fetches, parses, and turns into news. Same shape, different threat.

**Every URL in an entry is host-classified, not only the one that gets fetched.** `feedUrl` is the SSRF surface, and it is the obvious one. `termsUrl` is the valuable one: it records the terms page a human says they read, so a terms page on `127.0.0.1`, on `wiki.internal`, or on a reserved name is close to a proof that nobody outside the machine that wrote the entry could have read it. That is the fabrication this file exists to make hard, the classifier already answers it, and leaving it unasked would have meant a registry that refuses a fabricated feed and accepts a fabricated review beside it. `siteUrl` is the same argument one step weaker — a publisher whose home page is an address literal is one no reader could verify and no takedown request could reach.

Only the host is classified on those two. They may legitimately be `http:`, because a terms page is a page a human opened rather than a document this product fetches and turns into news, and imposing the feed's https rule on them would refuse real publishers for no security gain.

**The address classifier is extracted, not duplicated.** `isIpLiteral`, `canonicalHostname` and `isPrivateHost` were private to the edition validator. Two definitions of "private network address" would drift, and `rules.ts` says so about its own rules: a duplicated rule "would eventually disagree with its twin, and the disagreement would be silent". Section 35 permits the move because the task requires the predicate, so the choice was extract or duplicate. The proof it is behaviour-preserving is that the edition validator's own 1,100-line test file passes unedited.

The predicate takes an **address**, not a URL, because AB-402 will hand it a resolved address from a DNS lookup, which was never a URL. A URL-shaped signature would have been unusable there and would have guaranteed a second copy.

**No clock, anywhere in the rules.** A terms-review staleness check would make `bun run check` fail on an untouched commit as time passes, and the failure would look like a code defect. ADR-0006 refused a clock in staging for the same reason. If staleness is wanted later it is a warning with the date passed in as an argument, not a schema rule.

## The honest limit

This section is the reason the record exists, and its substance belongs in the pull request and in AB-402's brief.

A hostname is a **name**, not an address. AB-401 validates the text of a committed file, and nothing about that text constrains what the name resolves to when AB-402 fetches it. `feeds.publisher.example` may have an address record pointing inside a private network today and a public one tomorrow, and a hostile resolver can answer differently on each lookup with a zero-second cache lifetime. **No schema-time validation can prevent that.** It is not a gap a longer denylist closes; it is a category error to try.

What this slice can guarantee, exactly, and about which URL:

- **`feedUrl`, the document a fetcher will request:** the scheme is `https:`; there are no credentials, no port, and no fragment; the host is not an address literal, in any spelling; the host is not a name under a known-private suffix; the host is not a reserved name unless the entry is a sample, and is a reserved name if it is; no two entries name the same feed.
- **`siteUrl` and `termsUrl`:** the host is not an address literal, is not a name under a known-private suffix, and is not a reserved name on a non-sample entry. The scheme is http or https and is not narrowed further — both are pages a human opens rather than documents this product fetches, so the feed's https rule deliberately does not reach them. `termsUrl` is classified for a reason distinct from SSRF: a terms page on a loopback, private, or reserved host is a page nobody outside the build machine could have read, which is a fabrication tell about the review the entry claims.
- And every one of those facts is visible in a reviewed diff before anything is fetched.

The address-literal rule is also broader than "non-public", in the one direction worth stating: it blocks **every** address literal, a public one included. A feed URL naming `93.184.216.34` is refused not because it is unreachable but because a source addressed by number is a source no reader can attribute and no takedown request can find. The finding says which class the address is in, so the reason is legible either way.

What it cannot guarantee, and must never be described as guaranteeing: that fetching any entry stays inside the public internet. Not for one entry, not for one request.

The suffix denylist illustrates the limit rather than closing it. `metadata.google.internal` is caught by `.internal`; `metadata.goog` is a real name on a real public suffix that resolves to the cloud metadata address inside one provider, and no denylist catches it, because the attacker chooses the name. There is a test asserting `metadata.goog` classifies as an ordinary name, so the limit is a tested fact rather than a hope.

**Therefore AB-402's fetcher must**, at request time: resolve the hostname itself over both address families; check *every* returned address and refuse if any is non-public — never pick the public one, because a mixed answer set is what an attack looks like and choosing the good one hands the attacker a retry; and connect to the address it checked rather than re-resolving the name, or the check and the connection perform two independent lookups and the window between them is the whole vulnerability.

That last requirement is a constraint on AB-402's transport choice and it should be recorded now rather than discovered: `fetch()` exposes no hook for supplying a resolved address, so **a fetcher built on `fetch()` cannot pin and cannot claim to be safe against this.** If pinning turns out to be unavailable in the runtime, the correct outcome is a record stating plainly that the check is advisory against non-adversarial failure — a publisher aliased to an internal host, a typo, an expired domain re-registered by someone else — and that the timing gap remains open. What is not acceptable is a repository that believes it is protected when it is not.

Finding messages therefore state what is true about the file — "entry x names the loopback address 127.0.0.1" — never "private networks are blocked". Read literally, AB-401's third acceptance criterion is unachievable for hostnames; it is delivered as "a private-network *literal*, in any spelling, and any unsupported protocol fail validation", and the rest is handed to AB-402 in writing.

## Alternatives considered

- **The schema in `packages/schemas`.** Rejected on ADR-0007's criterion. It would also attach section 16's published-contract ceremony — version consideration, compatibility analysis, migration — to a file with no reader to protect.
- **A boolean `active` with a cross-field check.** Rejected above: it rejects the value and loses the guarantee at every consumer.
- **Real publishers with invented review fields.** Refused outright, and the reasoning is in the Decision.
- **Real publishers, inactive, with the review fields blank.** Clears the fabrication bar and still loses: it puts real organisations into a machine-read file in a state two blank fields away from live, where those two fields are the most tempting to fill in casually. A list of candidate publishers is editorial planning and belongs in an issue.
- **A YAML dependency.** Unnecessary: Bun parses it natively. `js-yaml` or similar would need an ADR under section 11 for a capability the runtime already has.
- **Duplicating the address helpers rather than extracting them.** Rejected: forking a security control.
- **A second host-allowlist file.** Rejected: the registry *is* the allowlist, and a second one drifts silently — an entry in one and not the other either blocks a legitimate source or permits a removed one, and nobody notices until a takedown request goes unhonoured.
- **A staleness rule on the review date.** Deferred: it needs a clock.

## Consequences

`bun run sources:validate` joins the blocking suite, so a registry naming a private address or granting itself `active` without a review fails a merge. Because the validator refuses to call a run that checked nothing a success, the repository must carry at least one entry — which is what forces the sample-entry question to be answered rather than deferred.

The sample entries are unfetchable by construction, and reuse the invented universe of the AB-102 sample edition, so the two sample artefacts are one coherent fiction under one disclaimer.

AB-402 inherits three obligations in writing: consume the validated registry value rather than re-parsing the file; take a validated entry rather than a URL string as its input, so no code path can fetch an arbitrary address; and treat `fetchable` as computed here rather than recomputing it — the discipline ADR-0006 set with `publishable`.

**A conflict reported rather than resolved:** PRD section 10.1 requires each entry to carry a health state, and AB-404 makes source health a *generated* report. A machine-updated field inside a human-reviewed file means automation writing to a reviewed file, which section 44 forbids, and every fetch run would produce a diff on the registry. This slice omits the field. A maintainer should decide whether health becomes an author-maintained editorial statement distinct from the generated report, or stays out entirely.

**The remaining deviations from PRD section 10.1, stated in full.** That section asks an entry to carry fifteen things. The schema carries eleven: id, publisher, `siteUrl`, `feedUrl`, region, source type, active flag, `termsUrl`, the permitted-use note and its enumeration, the review date, and `attribution`. Health state is the conflict recorded immediately above. `attribution` is one this ADR previously failed to count and now carries: AB-401's own deliverables name it, a permission granted on condition of a credit is not a permission until the credit is recorded, and AB-402 and AB-404 would have had nothing to render beside a story without it. It is required on the active branch, optional on the inactive one, and absent from the sample branch, exactly like the rest of the review.

Three are still missing, and each is a decision rather than an oversight:

- **`fetchInterval`** — omitted because AB-402 owns fetching and will know what values it needs. Guessing now would put a number in a reviewed file that nothing reads.
- **`topic`** — omitted because the product has no topic vocabulary yet. `region` and `sourceType` are closed enums drawn from PRD section 13.3; the interest slugs ADR-0008 introduced are a *reader's* vocabulary, chosen on a device, and are not the same thing as an editorial classification of a publisher. Inventing a third vocabulary here, with no consumer, would fix it before anything has an opinion. AB-403's clustering is the slice that will have one.
- **`takedown/contact`** — omitted, and this is the one with a real cost: PRD section 10.2 requires a publisher removal and correction channel to exist. The runbook therefore requires the contact to be gathered and recorded in the pull request, which is a procedure rather than a mechanism. A maintainer should decide whether it becomes a field here or lives in whatever the maintainers use for contacts; what must not happen is the requirement quietly disappearing because no field asked for it.

And one thing no field can deliver: no automated check can verify that a terms review actually happened. The mechanism guarantees a human typed a URL, a date, a name, a paragraph, an explicit list of permitted uses, and the credit line those terms require; it cannot guarantee they read the page. That is a human-review gate, and the runbook says so.

## Security/privacy impact

This slice adds no network code. The command reads one file, validates it, prints, and exits.

The security-relevant output is the address classifier, and its scope is stated above rather than overstated. It closes the accident — a typo, a copied localhost URL, a test entry left behind — and the obfuscation surface, which is the part a hand-written check reliably gets wrong. It does not close an adversary who controls a name's resolution.

Credentials in a feed URL are a blocking finding: a committed file is exactly where a secret must not be, and a URL with a userinfo component is also the classic way to make a hostile host look innocuous in review.

No personal data is recorded. `termsReviewedBy` is a name or handle and rejects anything containing an at sign, so a reviewer's email address cannot enter a public file.

## Product-constitution impact

The registry is where provenance starts. Constitution commitments about verifiable sourcing and honest attribution are only as good as the record of what this product was permitted to use, and the terms-review fields are that record.

Nothing here is reader-facing and nothing changes what an edition looks like.

The `permittedUses` vocabulary deliberately has no value for images. Section 18 forbids displaying publisher photography without permission, nothing in this product renders an image, and a recordable permission the product cannot exercise is an invitation to build the feature. The slice that displays an image adds the value and re-reviews every entry, which is the correct cost.

## Rollback plan

Delete `content/sources.yml`, the `source-registry` module, the command, and its line in the blocking suite. The address classifier would stay, because the edition validator now imports it; reverting that is a separate, mechanical change proven by the same untouched test file.

Nothing is deployed, nothing is served, and no reader is affected. The registry has no consumer until AB-402, so withdrawing it breaks no contract.
