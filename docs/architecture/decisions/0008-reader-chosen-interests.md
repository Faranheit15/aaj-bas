# ADR-0008: Reader-chosen interests

Status: Proposed
Date: 2026-08-15
Owners: Aaj, Bas. maintainers

## Context

ADR-0007 set the rules for on-device state and named three slices that would extend it. This is the second of them, and the first whose payload is something the reader chose rather than something the product observed.

Adding an optional field needs no record. ADR-0007 already settled that an additive optional field does not bump `schemaVersion`, that writers preserve top-level keys they do not own, and that a document declaring a newer version is never overwritten. A record saying "we added a field the way ADR-0007 said to" would be the bureaucracy section 34 exists to prevent.

Three things in this slice are not covered by that, and each one binds later work:

1. ADR-0007 made a *whole document* replaceable when it fails validation at the current version. This slice carves out an exception for one field, which means the repository now needs a stated criterion for when an exception is allowed. AB-205's `theme` meets the same question next.
2. ADR-0007 delegated a decision here in writing: *"AB-204 must re-argue it for interests, which are choices a reader deliberately made."* An explicit delegation from an accepted record has to come back to the record, or the audit trail it opened is left dangling.
3. ADR-0007's privacy section contains a sentence this slice makes false. Section 34 lists the privacy model as ADR-worthy, and an accepted record left holding a false claim about privacy is the strongest single reason here.

This record covers exactly those three. It does not re-decide the version rule, the eviction rule, or the key layout.

## Decision

**Interests substitute; they never add.** Every reader is shown ten stories: the eight shared core stories, then two from the published interest pools. A reader who has chosen nothing sees ten, selected by the same function with an empty set. Choosing interests changes *which* two, never *how many*.

This is the load-bearing product decision in the slice, and the alternative is worse than it looks. If a reader without interests saw eight, then choosing would take them to ten, and the invitation shown after two expanded stories would be a prompt whose payoff is more content. That is an engagement reward (section 3.2), it prefers volume over context (section 3.4), and it makes leaving harder rather than easier (section 49). It would also make the invitation impossible to word honestly, because any accurate label for it would say "get two more stories". Substitution is the only framing under which section 3.3's permission for explicitly selected interest boosts survives contact with section 3.2.

Mechanically there is no branch for the empty case. An empty selection makes every pooled candidate unchosen and the same ordering produces the default pair, which is what stops the default path drifting away from the interest path.

**Selection is order-independent, so the stored array is sorted.** Candidates are ordered by whether their pool was chosen, then by position within the published pool, then by story id. Membership decides, never the position of a slug in the reader's array. That matters beyond determinism: it means the order two checkboxes were ticked cannot reach the output, so sorting the stored array discards a preference nuance rather than silently rewriting a ranking. Had selection been order-dependent, sorting `["technology-ai", "sports"]` into `["sports", "technology-ai"]` would have inverted a priority the reader was never told they were expressing — an editorial ranking hidden in an interaction detail, which section 22 forbids.

**Per-field leniency, and the criterion for it.** `interests` is stored as an array of identifiers, not of interest slugs, and unknown values are filtered out where the product reads them rather than rejected where the document is validated.

The criterion, which is the part later slices need:

> Strictness is right where the vocabulary is fixed by nature. Leniency is right where the vocabulary is a product decision the product has already said it may change.

An edition date is checked against the calendar, which cannot change, so an invalid one can only be corruption and there is no future in which a valid key becomes invalid. An interest slug is checked against a vocabulary this repository owns, and `slugs.ts` already contemplates renaming one. A value invalid today may have been valid yesterday.

Under strict validation, adding a slug to the vocabulary would be enough to destroy readers' state: a reader picks the new slug, a stale CDN edge or AB-206's service worker serves an older bundle, that bundle sees `schemaVersion: 1` — so the never-clobber rule does not engage — validation fails, and the whole document is replaced. That is the exact hazard ADR-0007's version rule was built for, walking in through the one door the version rule does not watch. Turning an editorial vocabulary change into a device-state wipe is out of all proportion.

Leniency is bounded in three ways. It applies to *element values only*: `interests: "sports"`, `null` or `42` is a shape no build of this product could have written, stays strict, and still makes the document replaceable. It is implemented at the accessor and never as a schema transform, because a transform would strip an unknown value on every read-modify-write and an older bundle would silently delete a preference a newer one had just written. And it never licenses *writing* what we cannot read: the write path validates strictly against the current vocabulary, so leniency is for other builds' data, never for ours.

**The "up to two" cap is not in the schema.** A `.max(2)` there would convert a product parameter into a compatibility parameter: if a later build allowed three, this build would classify that document as corrupt and destroy it — the foreign-version hazard reached through a value instead of a version. The cap is enforced where it belongs: the picker prevents a third selection, the writer refuses an over-long argument rather than truncating it, and the reader takes the first two deterministically without rewriting what is stored.

**Discarding a document is still acceptable, but the argument has changed and now carries a condition.** ADR-0007 accepted discard because losing which cards were open costs a reader one recoverable count. That reasoning does not transfer: an interest cannot be reconstructed by looking at the page, the device is the only copy, and re-asking is precisely the nag this product avoids.

Discard remains acceptable for one reason, and it is not a property of the data — it is a property of this slice shipping a settings control. That control is what converts "lost" into "re-choosable in two taps". **If the settings control were removed, this argument would fail**, and a reader who lost their document would have no route back except an invitation the product deliberately never repeats.

Two rules follow, and both bind the next version bump rather than this one:

- a V1-to-V2 migration that cannot bring a document forward **must still carry `interests` forward if it can read them**. Discard-the-whole-document stops being the acceptable default; a slice that wants it must justify losing interests specifically;
- the fallback on a lost document must be the first-time-reader state, never a half-personalised one. A reader shown an edition shaped by half a choice has no way to tell. Note what that state is under this record's own ten-for-everyone decision: it is the edition a reader who has chosen nothing sees, which is ten stories — the eight shared core plus the default pooled pair — and not the eight-story core alone. The acceptance criterion's phrase "falls back to the shared core" names the core's ordering being untouched by a preference, not an edition truncated to eight.

No salvage code is written now. The path is unreachable — version 1 is the only version this product has ever written — and building a partial-salvage reader for a version 2 that does not exist would mean partially trusting a document this build cannot understand, which is the hazard the version rule exists to prevent, arriving from the inside. It would also be testable only against a fabrication.

**Nothing new is written about when the reader was asked.** Whether the reader has answered is carried by the field's presence: absent means never asked, an empty array means asked and answered with nothing. That distinction removes the need for a dismissal flag or a timestamp, and it is why "No thanks" writes an empty array rather than writing nothing. ADR-0007 rejected least-recently-used eviction on the grounds that storing *when* a reader did something is a behavioural timestamp; the same objection rules out recording when the invitation was answered.

**The settings control is a disclosure at the end of the edition, not a route.** A `/settings` route would need an affordance the shell has deliberately tested away — no navigation landmark, no footer links, no links at all on a ready page — and ADR-0006 records that no route is reachable from the end of an edition. AB-205 adds a second setting; that is the slice at which a settings surface earns its own record.

## Alternatives considered

- **Eight stories for a reader who has chosen nothing.** Rejected above: it makes interest selection an unlock and the invitation a reward.
- **Strict `z.array(interestSlugSchema)`.** Rejected: one unknown value destroys the reader's viewed sets and ended editions along with their interests, and a vocabulary addition becomes a mass state wipe.
- **`z.array(interestSlugSchema).catch([])`.** Rejected, and it is the subtle one. It keeps the document alive but collapses a partly-valid selection to empty — which under the presence rule above means "asked and answered none". A reader who chose one known slug and one unknown one would be silently recorded as having declined, and would never be asked again.
- **A separate `interestsPromptDismissedAt` field.** Rejected: it stores a fact about the reader's refusal and needs a clock, and the presence rule already answers the question for free.
- **Interleaving the two pooled stories among the core eight.** Rejected: the core is shared, and interleaving makes the editorial ranking of shared stories reader-dependent. Pools carry no rank, so any interleave position would be a ranking invented in code (section 22).
- **Persisting the two selected story ids.** Rejected: it caches a per-reader edition manifest that a correction could invalidate, for no gain over recomputing.
- **Dropping the oldest selection when a third is ticked.** Rejected as a dark pattern: an invisible destructive effect on a deliberate choice, which also requires storing tick order.
- **A `/settings` route.** Rejected above on affordance grounds, and under section 48: it serves none of this item's acceptance criteria.
- **Amending ADR-0007 in place.** Rejected: `decisions/README.md` retains superseded decisions for the audit trail, and 0002/0004 and 0005/0006 are annotated as extended rather than rewritten.

## Consequences

Ten stories now render for every reader, so the counter's denominator becomes ten and the card ordinals run to ten. A degraded edition still counts itself honestly — the pooled count is a fixed two, never "however many are needed to reach ten", so a six-core edition renders eight rather than pulling extra pool stories to hit a number.

The selection is snapshotted once per edition. Saving a choice updates the stored document and the picker's own display and changes nothing else on the page. Recomposing the edition in view would change the list under a reader who has already read it, flip the counter, and flip the ending message from "That's today's edition." back to unfinished — which is an unlock mechanic however it is labelled.

A slug rename or removal now has a cost on readers' devices as well as across the archive, which neither `slugs.ts` nor ADR-0005 contemplated. Leniency caps that cost at one silently lost boost instead of a destroyed document. A future rename must either ship an alias map or record that it accepts the loss.

The invitation is shown at most once per device and is never repeated. Two mechanical paths would re-ask — a discarded document and a corrupt one — and both are named here so they are not rediscovered as bugs.

`packages/domain` is untouched and `apps/web` gains no workspace dependency: selection has exactly one consumer, and the validator's superficially similar calculation answers a different question. Its `length/estimated-minutes` rule measures the core plus the two *longest* pooled stories, an upper bound over every possible reader, and that is deliberately not the same function.

That upper bound has a latent consequence worth recording. A reader whose interests select two shorter pooled stories now sees a smaller edition than the published `estimatedMinutes` describes. The number never understates, and nothing renders it today, so nothing is broken; the slice that first displays a duration must decide whether the published figure means "the longest this edition can be" or "what you will read".

## Security/privacy impact

**One sentence in ADR-0007 becomes false, and this is the reason that record needed extending.** It reads: *"Every value stored is already public — edition dates and story ids are served to every reader in the published edition. The only non-public fact is the correlation."*

An interest slug is drawn from a public vocabulary, but the *selection* is not a fact about the edition. It is a stated preference of a person, volunteered rather than observed. **Chosen interests are more sensitive than which public stories were opened, not less**, and the intuition that a topic tag is a smaller thing than reading history is exactly backwards. Depending on the choice it can be sensitive by proxy: `policy-geopolitics` is closer to a political interest than anything this product has previously stored.

What follows is a hard rule rather than a preference: **no interest slug may be logged, on any path, in any field** — nor the count of interests chosen, which is a coarse but real preference signal with no diagnostic value, nor whether the reader has chosen at all. The existing closed vocabulary of a fixed reason, plus the stored version for a foreign document, is unchanged. ADR-0007 already forbids emitting validation paths for this document because the path is the private part; here the *value* is, and the rule is the same.

That prohibition is executable rather than promised: the store's test sweeps every warning this module can emit for the interest vocabulary, built from the shared slug list so that a slug added later cannot slip past a hand-written pattern.

The structural guarantees, each checkable rather than asserted:

- the selection function takes an edition and a set of slugs and nothing else. It cannot see reading history because it has no parameter that could carry it and no import that could supply one, and a test walks the module graph from that function — every relative import, followed transitively, with each file read — to keep it that way. The graph rather than the file, because one file's own source is not where a second input would appear: `core-stories.ts` is on the selection's import allowlist and is one hop from the device store, so a purity test that reads only the selection's text leaves the ranking one edit away from what the reader has already opened;
- `coreStories` still takes an edition and nothing else, so a preference cannot reach the ordering of the shared eight;
- interests are read as a set, never by position, so even a future slice that recorded tick order could not turn it into a ranking;
- no network path exists in the new code — no fetch, beacon, socket, or dynamic import — and the only dependency with I/O is the logger, which ADR-0003 confines to the console;
- nothing identifies the reader. No id is minted and no timestamp is stored, which is a direct consequence of the presence rule replacing a dismissal timestamp;
- one key, one document, asserted by a test.

Two things must never happen to this field, and both are more tempting than they look. It must never be joined to the viewed set to infer an interest the reader did not state — that is behavioural profiling assembled out of two individually permitted fields, and it is what the next person to read this file will think of first. And it must never leave the device: PRD section 15 contemplates future aggregate first-party measurement, and interests must be out of scope for it by default, because any aggregate requires the value to leave the device, which section 17 and PRD section 5.3 both forbid in v1.

## Product-constitution impact

Section 3.3 permits interest boosts that a reader explicitly selects and forbids behavioural personalisation. This slice sits exactly on that line, and the line holds because the input is a stated choice, the mechanism is inspectable, and the code that ranks cannot see behaviour.

The edition stays finite and stays the same size for everyone. No content follows the ending, the invitation renders before the ending block rather than inside or after it, and once answered it never appears again.

Nothing accumulates. There is no count of editions until the invitation, no record of a refusal, no badge for choosing, and no obligation created by declining — an empty array is a real answer, not a snooze.

The invitation arrives silently: nothing moves, nothing is announced, nothing takes focus, and nothing scrolls. A reader who never scrolls to the end of the edition never sees it at all, which is the correct behaviour for a question the product asks once and does not need answered.

## Rollback plan

Revert the commit. Every reader returns to the eight core stories, the counter's denominator returns to eight, and the picker disappears.

Documents already holding `interests` become inert. The field is optional and unknown top-level keys are preserved, so a reverted build reads those documents as valid, ignores the field, and does not strip it — a reader who rolls forward again finds their choice intact. That is the whole cost of being wrong, and it is the strongest argument that this decision is reversible.

If instead the stored shape is wrong, the version rule is the escape: ship a version 2, and every older build in the wild will decline to overwrite it.
