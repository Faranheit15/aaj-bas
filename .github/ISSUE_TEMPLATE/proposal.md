---
name: Proposal
about: Suggest a change, a feature, or a different approach
title: ''
labels: proposal
assignees: ''
---

## What problem does this solve

Describe the reader's or the maintainer's problem, not the solution you have in mind.

## Proposed change

## Why now

What current, concrete problem requires this? "It would be useful later" is not enough on its own —
this project deliberately does not build infrastructure ahead of a real need.

## Constitution check

Aaj, Bas. is a finite product, and some things are ruled out by design rather than by preference.
Please confirm this proposal does not introduce any of them. If it does, say so and make the case —
an honest exception is much easier to discuss than one discovered in review.

- [ ] Does not make the edition endless — no infinite scroll, autoplay, or auto-loading more stories
- [ ] Adds no engagement mechanics — no streaks, badges, points, or reward loops
- [ ] Adds no behavioural ranking — no ordering by clicks, dwell time, or reading history
- [ ] Adds no accumulating obligation — no unread counters or saved-for-later backlogs
- [ ] Adds no tracking, analytics, or off-device reader data
- [ ] Adds no backend, database, or authentication
- [ ] Adds no new runtime dependency (or explains why one is unavoidable)

## Does this need an ADR?

A change to runtime architecture, persistence, deployment, a public schema, the security or privacy
model, or a package boundary needs an architecture decision record before implementation. See
`docs/workflows/adr.md`.

- [ ] This needs an ADR
- [ ] This does not need an ADR

## Alternatives you considered
