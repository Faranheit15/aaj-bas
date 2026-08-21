# Adding a source to the registry

## Purpose

`content/sources.yml` is the list of feeds this product is permitted to fetch.
An entry in it is not a configuration value; it is a record that a person read a
publisher's terms and concluded the product may use their material. Section 18
is explicit that an RSS feed grants nothing by existing, and ADR-0012 records
why the file is shaped the way it is.

`bun run sources:validate` enforces the shape of that record on every run of
`bun run check`. It cannot tell you where to find the information the record
needs. This procedure does, because a blocking rule shipped without the
procedure that satisfies it guarantees that the first person to hit it invents
values.

## Who may do this

**A human, and only a human.**

An AI coding agent must never author `termsUrl`, `termsReviewedOn`,
`termsReviewedBy`, `permittedUse`, `permittedUses`, or `attribution`. Not for a
real publisher, and not for a sample. Writing a plausible permitted-use note
beside a feed URL asserts that a legal review happened, in the very file whose
purpose is to record that it happened, and the fetcher will later read it as
authorisation.
Section 20's "do not fabricate" is not scoped to article text, and this
repository is public, so a fabricated note is also a public claim about a named
third party's terms.

An agent may help with everything else: finding the feed URL, checking the
entry parses, running the validator, drafting the pull request. The six review
fields are typed by the person who read the page.

## Before you edit anything

Gather all of this first. If any line is blank at the end, the source is not
ready to be added.

1. **The exact feed URL.** The document the fetcher will request — the Atom or
   RSS file itself, not the page that links to it. It must be `https:`. It must
   carry no credentials, no port, and no fragment; the schema rejects all three.
2. **The terms page you actually read.** The URL of the terms of use, content
   licence, or syndication policy. Read it. A publisher's home page is not a
   terms page.
3. **The date you read it**, as `YYYY-MM-DD`. The day, not a timestamp.
4. **Your name or handle.** Not an email address — the schema rejects an `@`,
   because an email address in a public repository is personal data the product
   never needed.
5. **What the terms permit, in your own words.** At least forty characters, and
   it must be your sentence about this publisher. Do not copy the note from
   another entry; a rule warns when two entries share one verbatim, because two
   people reading two different terms pages do not write the same sentence.
6. **Which permitted uses apply**, from `headline`, `supplied-description`, and
   `generated-summary`. There is deliberately no value for images.
7. **The credit line the terms require**, written the way the terms require it.
   This is `attribution`, and it is a term rather than a preference: a publisher
   who permits reuse on condition of a credit has granted nothing until the
   credit is given. Do not infer it from the publisher's name — what a masthead
   calls itself and what its terms demand be printed are often different
   strings, and guessing would fabricate the term this field records.
8. **Whether images are permitted — the answer is no.** Nothing in this product
   renders publisher photography and the vocabulary has no value to record it
   with. If a publisher expressly permits image use, that is a product decision
   and a new slice, not a field you add here.
9. **The takedown and correction contact.** The address or form a publisher
   would use to ask for removal. PRD section 10.2 requires that channel to
   exist. The registry has no field for it today, so record it in the pull
   request and in whatever the maintainers use for contacts.

## When the terms are ambiguous

**Do not add the source.**

Ambiguity is not a reason to write a hedged sentence into `permittedUse`; the
field records a conclusion, and "probably fine" is not one. Leave the entry out,
or add it with `active: false` and the review fields absent, which is an honest
drafting state the schema accepts. Ask the publisher. A source nobody is sure
about is a takedown request and a correction the product cannot defend.

## The rules you will hit, and why

- **`https:` only, blocking.** A feed fetched over plain http lets anyone on the
  path choose what a news product reports. There is no per-source override and
  there will not be one.
- **No address literals, blocking.** A feed URL naming an IP address rather than
  a host is a source nobody can attribute. Every spelling is caught, including
  the decimal, octal, hexadecimal, and IPv6-embedded forms.
- **No private-network names, blocking.** `localhost`, `.local`, `.internal`,
  `.home.arpa`.
- **All three of `feedUrl`, `siteUrl`, and `termsUrl` are classified**, by the
  three host rules above. `termsUrl` is the one to expect: a terms page on a
  loopback, private, or reserved host is a page nobody outside the build machine
  could have read, so it is close to a proof that the review it records did not
  happen. Only the host is checked on those two — `siteUrl` and `termsUrl` may
  legitimately be `http:`, and only `feedUrl` is https-only.
- **A real source may not use a reserved name, blocking.** `.invalid`, `.test`,
  `.example`, and the `example.com` family are for samples.
- **A registry may not mix reserved hosts with real ones, blocking.** This is
  the one that will stop you first, and it is deliberate: see below.
- **An active source must carry all six review fields.** The schema has no
  shape in which `active: true` appears without them, so this is not a check you
  can forget to run.
- **Duplicate ids and duplicate feed URLs are blocking; near-duplicates warn.**
  A pair differing only by a trailing slash or a leading `www.` is usually one
  feed entered twice, so it is put in front of you rather than folded silently.

## Adding the first real source deletes the samples

`content/sources.yml` currently holds three invented publishers on `.invalid`
hosts. The mixed-host rule is blocking, so the pull request that registers the
first real publisher must remove all three in the same diff. That is the
intended cost: a whole-file, deliberate, reviewed change rather than a real
entry appearing quietly beside the fixtures.

Until then the samples are what keeps the validator meaningful — a run that
checks nothing exits 3 rather than reporting success.

## The procedure

1. Gather the nine items above.
2. Edit `content/sources.yml`. Add the entry with `active: false` and
   `sample: false`, carrying the review fields you gathered.
3. Run `bun run sources:validate`. Fix what it reports. Blocking findings fail
   the suite; warnings are printed and do not.
4. Set `active: true` only when the review is complete and you intend the
   pipeline to fetch it.
5. Run `bun run check`.
6. Open a pull request. In the description, state which terms page you read, on
   what date, and the takedown contact. A reviewer is reviewing the review, not
   the YAML.

## What this procedure cannot guarantee

No automated check can distinguish a real terms review from a plausible-sounding
sentence. The mechanism guarantees that a human typed a URL, a date, a name, a
paragraph, an explicit list of permitted uses, and the credit line those terms
require, and that all of it is visible in a reviewed diff before anything is
fetched. It does not guarantee that
anybody read the page. That is a human-review gate and nothing in this
repository can replace it.

The registry also validates a **name**, not an address. Nothing about the text
of this file constrains what a hostname resolves to when the fetcher asks. That
limit belongs to AB-402 and is stated in full in ADR-0012.

## Legal standing

From PRD section 10.2, verbatim:

> This is a product risk policy, not legal advice. Formal legal review becomes a
> launch gate before material scale or monetization.
