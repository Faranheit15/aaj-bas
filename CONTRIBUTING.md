# Contributing to Aaj, Bas.

Thanks for wanting to help. This is a small, deliberately restrained project, and the fastest way to
have a change accepted is to understand what it refuses to become before you write any code.

## Read this first

Aaj, Bas. is a *finite* daily news product. It is designed so a reader can understand the day, check
the sources, reach an end, and leave. It is explicitly not optimised for time in app, sessions per
day, or anything else that rewards not leaving.

Two documents govern the repository:

- [`docs/PRODUCT_CONSTITUTION.md`](docs/PRODUCT_CONSTITUTION.md) — the product commitments.
- [`AGENTS.md`](AGENTS.md) — the binding engineering rules. It is written for AI coding agents, but
  every rule in it applies to human contributors too.

A change can be well-written, fully tested, and still be declined because it conflicts with these.
That is not a reflection on the work. Please check before you build something substantial.

## What gets a pull request declined

Most declined changes fall into one of these. None of them are judgement calls:

- **A different package manager.** Bun is the only one. Do not use npm, pnpm, or Yarn — not in code,
  not in CI, not in documentation. `bun.lock` is the only permitted lockfile, and `bun run check:pm`
  fails the build if a foreign one appears. (`AGENTS.md` section 8)
- **A new dependency.** Dependencies are architectural decisions here. Anything outside the approved
  baseline needs an accepted ADR *before* the pull request. (section 11)
- **Analytics or tracking of any kind.** No third-party analytics, no pixels, no fingerprinting, no
  session replay. The default is to collect nothing. (section 23)
- **A backend, database, or authentication.** The product is static-first by design. (sections 6 and 7)
- **Engagement mechanics.** No streaks, badges, points, infinite scroll, autoplay, unread counters,
  or anything else that makes leaving harder. (constitution sections 3.1, 3.2, 3.5)
- **Behavioural ranking.** Stories are never ordered by clicks, dwell time, or reading history.
  (section 3.3)

If you think one of these is genuinely warranted, open a proposal issue and make the case. Do not
open a pull request that assumes the answer.

## Getting set up

You need [Bun 1.3.14](https://bun.sh/). `jq` is optional and only powers the local Claude Code hooks.

```bash
git clone https://github.com/Faranheit15/aaj-bas.git
cd aaj-bas
bun ci
```

`bun ci` installs from the committed lockfile without changing it. Use it rather than a plain install
so your tree matches CI.

Run either application locally:

```bash
bun run dev:web       # the reader
bun run dev:landing   # the public landing page
```

`dev:web` stages content into `apps/web/public/content/` before starting Vite, sample data included, so
the reader has an edition to render locally. That directory is a generated build artifact and is
git-ignored — edit editions in `content/editions/`, never the staged copy.

## Making a change

**One issue, one vertical slice, one pull request.** This is the unit of work (`AGENTS.md` section 33).
Please do not bundle unrelated improvements together, and please do not reorganise code you are not
otherwise touching — opportunistic renames and refactors make a change much harder to review
(section 35).

1. Branch off `develop`. It is both the default branch and the production branch.
2. Name the branch for what it does: `feat/edition-schema`, `fix/landing-cta-focus`, `docs/adr-0005`.
3. Make the smallest coherent change that satisfies the task.
4. Add or update tests. Tests must be deterministic — never depend on live RSS feeds, live model
   APIs, or network availability (section 29).
5. Run the check suite (below) and make sure it passes.
6. Open a pull request against `develop`.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`,
`docs:`, `chore:`, `refactor:`, `test:`.

## The check suite

One command has to pass before a pull request can merge:

```bash
bun run check
```

That runs, in order: the agent-instruction size guard, the package-manager guard, formatting, lint,
type checking, edition validation, source-registry validation, tests, and production builds for both
applications. CI runs exactly the same command, so if it passes locally it should pass there.

The first content step is `bun run content:validate`. It checks every edition in `content/editions/`
against `editionSchema` and the editorial rules in `packages/domain`; blocking findings fail the
suite, warnings are printed and do not. It also has a `--publish` mode, which additionally
refuses development sample data; CI runs that mode over the staged editions before deploying the
reader, so sample data cannot reach production.

The second is `bun run sources:validate`. It checks `content/sources.yml`, the list of feeds the
pipeline is permitted to fetch, against the registry contract and rules in `packages/domain`. Adding a
real source is a human procedure — read `docs/runbooks/adding-a-source.md` before touching that file —
and the fields recording that a person read the publisher's terms must be typed by that person, never
by a coding agent.

If formatting is the only complaint, `bun run format` rewrites the files for you.

Please do not weaken a check to make a change pass — no loosened TypeScript settings, no disabled
tests, no suppressed lint rules without an explanation in the diff (sections 12 and 30).

## Review and merge

`develop` is protected. A pull request merges when:

- the `check` job is green, and
- a code owner has approved it.

Code ownership is defined in [`.github/CODEOWNERS`](.github/CODEOWNERS); in practice that means the
maintainer reviews everything. Pushing a new commit dismisses existing approvals, so expect a
re-review after changes.

The maintainer retains an administrative bypass for maintenance and urgent fixes. It exists because
a single-maintainer project would otherwise be able to deadlock itself; it is not a general path
around review.

Every push to `develop` deploys to production, so review is the last gate before users see a change.

## Proposing something larger

Anything that changes runtime architecture, persistence, deployment, a public schema, the security or
privacy model, or a package boundary needs an **architecture decision record** first. Start from
[`docs/architecture/decisions/TEMPLATE.md`](docs/architecture/decisions/TEMPLATE.md) and follow
[`docs/workflows/adr.md`](docs/workflows/adr.md). An ADR is a short document, not a ceremony — it
should explain context, the decision, what else you considered, the consequences, and how to roll it
back.

Open the ADR as its own pull request before the implementation that depends on it.

## Accessibility

Accessibility is treated as correctness, not polish. The target is WCAG 2.2 AA. A user-facing change
should account for semantic HTML, heading order, keyboard operation, visible focus, screen-reader
names, colour contrast, reduced motion, touch targets of at least 44x44 CSS pixels, and light, dark,
and system themes (section 25).

Do not remove a focus outline without replacing it with something clearly visible.

## Privacy

Reader state stays on the reader's device. Do not add anything that transmits reading history or
preferences off-device, and do not log secrets, personal identifiers, IP addresses, or full
third-party article text (sections 17, 23, 38).

## Security

**Do not report a vulnerability in a public issue or pull request.** See [`SECURITY.md`](SECURITY.md)
for the private reporting path.

External content is untrusted input. Never render source-supplied HTML directly, and never commit a
secret to source, tests, fixtures, or logs (sections 18 and 24).

## Using AI coding agents

This repository is set up for agent-assisted development, and agent-assisted pull requests are
welcome. [`AGENTS.md`](AGENTS.md) is the single source of truth for every agent tool; Claude Code
reads it through `CLAUDE.md`, and Codex reads it directly.

You are the author of anything you submit. Please review agent-generated code as carefully as you
would review your own before opening a pull request, and never create a root `AGENTS.override.md` —
Codex reads it *instead of* `AGENTS.md`, silently disabling every rule in this repository.

## Licence

The code in this repository is MIT licensed; see [`LICENSE`](LICENSE). By contributing, you agree
your contribution is released under the same terms.

The licence covers the code. Editorial content, generated summaries, and third-party source material
are governed separately — see `AGENTS.md` section 18 for the rules on provenance, attribution, and
reuse.
