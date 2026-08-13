# ADR-0003: Shared logging package

Status: Accepted
Date: 2026-08-13
Owners: Aaj, Bas. maintainers
Accepted by: Faran Mohammad, repository maintainer, in the session that proposed this record.

## Context

Core development is beginning. The slices that follow — edition schema, static content access, and
the reader experience — will each need a way to trace behavior while being built and to diagnose a
failure once deployed. Without a shared answer, `console` calls accumulate organically in whatever
shape each slice invents, and section 38's requirement for structured, bounded operational logs
becomes something no code path actually satisfies.

The honest counter-argument was recorded before this decision was taken. At the time of writing the
repository contains no `console` call at all, and both applications are three-file shells, so there
is no measured operational failure driving this. Sections 48 and 50 would ordinarily reject
infrastructure with no current call site, and product constitution rule 13 requires a measured user
problem. The problem here is a developer-experience one, raised explicitly by the maintainer, who
authorized this decision in the session that proposed it. That authorization is what allows the ADR
and its implementation to land together; `docs/workflows/adr.md` otherwise separates them.

The scope is therefore held to the smallest thing that answers the question, and the alternatives
below record what was rejected.

## Decision

This record extends ADR-0001, which names `packages/domain`, `packages/schemas`, `packages/ui`,
and `packages/test-fixtures` as the shared code locations. ADR-0001 is not rewritten; accepted
decisions are additive, and the index in `docs/architecture/decisions/README.md` carries the
annotation, as it already does for ADR-0002.

Add `packages/logger`, published as `@aaj-bas/logger`, with no runtime dependencies. It exports
exactly three things: a `LogLevel` union, a `Logger` type, and `createLogger(scope, threshold)`.
Each of the four level methods takes a message and optional structured fields and writes directly to
the matching `console` method as `[scope] message`.

`threshold` is a required argument. Shared packages carry no `vite/client` types, so the package
cannot read `import.meta.env`, and `@types/node` is installed nowhere, so it cannot read
`process.env` either. The application entry point owns that read, which also keeps `createLogger` a
pure function of its inputs. `apps/web` and `apps/landing` pass `import.meta.env.DEV ? "debug" :
"warn"`, which folds to a constant at build time: development is verbose, production keeps warnings
and errors in the developer's own browser console.

The package deliberately has no output-sink abstraction, no in-memory test sink, no field redaction,
no timestamps, no serializer depth or array caps, no buffering, and no `flush`. Each omission is
justified in the consequences and security sections below.

## Alternatives considered

- **Use `console` directly and add no package.** The smallest possible change and the correct one if
  logging never needs shape. Rejected because every consumer would then invent its own prefix and
  field convention, which is what section 38's "structured" requirement exists to prevent, and
  because unifying them later is a repository-wide edit rather than a one-line one.
- **Keep a `log.ts` inside `apps/web/src` until a second consumer exists.** Genuinely attractive, and
  it would need no ADR. Rejected because both applications need the same behavior today, so the
  second consumer already exists; a file in one application that the other imports would invert
  section 9's rule that shared packages must not depend on applications.
- **Adopt an existing logger such as pino, winston, debug, or loglevel.** Rejected under section 11:
  the requirement is met by roughly sixty lines of platform code, and section 27 names client-side
  libraries for trivial utilities as a specific thing to avoid.
- **A pluggable sink interface now, anticipating AB-803's workflow logs.** Rejected under section 13:
  one implementation exists. AB-803 targets a different runtime with a different output format, and
  that is the change where a second implementation would appear in the same diff and earn the
  abstraction.
- **Redact sensitive field names before writing.** Rejected as a false guarantee; see the security
  section.

## Consequences

Every package and application may depend on `@aaj-bas/logger`; it depends on nothing, so it
introduces no cycle. The root `test` script names workspaces explicitly and was extended, because a
package whose tests are never invoked is worse than no tests.

Because the threshold is a runtime comparison rather than a compile-time constant inside the
package, suppressed `debug` and `info` call sites remain in the production bundle as inert calls.
They were measured rather than assumed. The reader bundle moved from 60.84 kB to 61.10 kB gzip and
the landing bundle to 61.50 kB, against the 200 KB compressed budget in `docs/PRD.md`. Nothing in
CI reports bundle size, so a later change to this figure has to be measured by hand with
`bun run --filter @aaj-bas/web build`; an automated size gate is not part of this decision.

Timestamps are omitted because devtools already stamps every console entry, and because a clock
inside the logger would make each record non-deterministic and force an injected clock to test.
Serializer depth and array caps are omitted because in a browser `console` stores a reference
rather than serializing, so there is nothing to bound. That defense expires the moment this
package is reused in the Node or Workers runtime AB-803 anticipates, where `console` does
serialize and an uncapped object becomes uncapped stdout; caps belong in that change.

The API is small enough that the rollback plan is real. Growing it — child loggers, a default
singleton, formatting options — would make that false, so growth should be resisted absent a
concrete need.

## Security/privacy impact

The package writes to the developer console and nowhere else. It holds no state, buffers nothing,
and accepts no identifier, so it cannot accumulate the behavioral record that section 23 and
constitution rules 3, 4, and 8 prohibit. Console output stays in the reader's own browser and is
never transmitted, so production logging is not telemetry.

The absent sink abstraction is the control inside this package. With output written directly by the
logger, adding a network transport means writing `fetch` here, which is unarguable in review; behind
a sink interface the same change would read as "adding a sink."

That control does not reach callers, and the invariant must be stated to include them. `console` is
itself a replaceable sink: an application that wraps `console.error` to also call `fetch` or
`navigator.sendBeacon` exfiltrates every line this package writes, while `packages/logger` shows a
clean diff. No repository check would catch it — Biome's recommended preset does not include
`noConsole`, and the applications ship no content-security policy. Introducing a transport, a
buffer, an identifier such as a session, device, or correlation id, or a pluggable sink — in this
package or in any caller, including by patching `console` — requires a new ADR.

There is deliberately no redaction. A key denylist catches `token` but not `headers.authorization`,
not a URL carrying a query token, and not a secret already interpolated into the message, so it
would imply a guarantee it cannot keep and would encourage passing sensitive values in the first
place. Sections 24 and 38 bind the caller: secrets, tokens, personal identifiers, and user-provided
private text must never reach a logger. That obligation is stated in the package's own doc comment,
where the next agent to extend it will read it.

## Product-constitution impact

None of the twelve behavioral commitments are affected. The package adds no user-facing surface, no
ranking input, no persistence, and no continuation mechanism. Rule 13 is the one it engages, and
this record is the written architecture decision that rule requires.

This record should not be read as precedent. It documents one case where a maintainer accepted
developer-experience infrastructure ahead of its call sites, with the sections 48 and 50 objection
stated rather than argued away. The next package still has to make its own case.

## Rollback plan

Delete `packages/logger`, remove the dependency from both application manifests, and replace the
call sites in the two entry points with direct `console` calls or with nothing. There is no
persisted data, no schema, and no deployed surface to migrate, and no other package imports it.
