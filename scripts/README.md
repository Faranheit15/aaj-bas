# Scripts

This directory holds repository check scripts and the content validation command.

- `check-agents-md-size.sh` — guards the agent instruction files against silent Codex truncation.
- `check-package-manager.sh` — enforces `AGENTS.md` section 8.
- `validate-edition.ts` — `bun run content:validate`. It reads every `*.json` in `content/editions/` (or the paths named on the command line), hands the text to the rule engine in `packages/domain`, prints a report, and exits non-zero on a blocking finding. `--json` writes a machine-readable report to stdout; `--publish` also treats a not-publishable edition as fatal. It is not wired into CI yet: the only edition in the repository is development sample data, so gating deployment on it today would fail every deploy of applications that do not read `content/` at all. It belongs in the slice that first copies `content/` into a build. The file deliberately holds no rule, severity, or threshold: what is wrong with an edition is a domain question, and this script exists only because the domain package must not touch a filesystem.

`scripts/` is now type-checked. `bun run typecheck` ends with `bunx tsc --noEmit -p scripts/tsconfig.json`; before `validate-edition.ts` there was no TypeScript here and the directory was not covered. `tsconfig.json` extends the repository base with `"types": []`, and `bun-runtime.d.ts` declares the handful of Bun and `process` members the script actually calls. The declarations are hand-written because the repository installs neither `@types/node` nor `bun-types`: a large ambient surface for one small script is the kind of dependency section 11 asks to avoid, and the same call was already made in `packages/test-fixtures`. The risk is a declaration that type-checks but does not exist, and the safety net is that `bun run content:validate` runs in the blocking suite, so a wrong declaration fails on the next run.

The repository still does not fetch sources, generate summaries, or publish editions. This directory is reserved for that deterministic content processing when it arrives.
