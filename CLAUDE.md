# CLAUDE.md

Claude Code entry point for this repository.

`AGENTS.md` is the single source of truth for every AI coding agent working here, regardless of which agent tool is used. It is imported below and applies in full.

@AGENTS.md

---

## Claude Code specifics

These notes describe how the rules in `AGENTS.md` map onto Claude Code. They add no new product or engineering rules; where anything here appears to conflict with `AGENTS.md`, `AGENTS.md` wins.

### Instruction files

- `AGENTS.md` — binding rules. Edit rules here only.
- `CLAUDE.md` — this pointer file. Do not duplicate rules from `AGENTS.md` into it.
- A nested `AGENTS.md` may narrow behavior for a subdirectory; nested `CLAUDE.md` files are not used. Keep any nested file short: Codex reads the root file first and gives nested files only the remaining byte budget.

### Work sequence

`AGENTS.md` section 32 defines the required sequence. In Claude Code:

- Step 3 (Plan) — use plan mode for non-trivial work, and get the plan approved before editing.
- Step 5 (Test) — run the checks in section 30 with the Bash tool; never report a check as passing unless its output was seen.
- Step 7 (Report) — end implementation work with the response format in section 51.

### Commands

- `/check` — run the merge-blocking suite.
- `/slice` — carry out one backlog item as a single vertical slice, following section 32.
- `/adr` — draft an architecture decision record from the ADR template.
- `/review` — perform the read-only self-review described by the shared `review` skill.

Each is a thin pointer to a shared procedure in `docs/workflows/`. The same
three procedures are also published as skills in `.agents/skills/`, which Codex,
Gemini CLI, and Antigravity can discover. Every entry point resolves to the same
file. Change a procedure in `docs/workflows/`, never in the wrapper, so the
harnesses cannot drift apart.

### Permissions

`.claude/settings.json` encodes the parts of `AGENTS.md` that a permission rule can enforce:

- The routine Bun install and `bun run` commands from section 8 are allowed without prompting. `bun add` and `bun remove` still prompt, because section 11 makes every dependency a decision. npm, pnpm, and Yarn are denied.
- Deployment commands are denied, per section 47; deployment happens only through CI on `develop`. Because a push to `develop` *is* that deployment, `git push`, `git merge`, and `git rebase` always prompt rather than being denied outright — an approved prompt is the human authorization section 47 asks for.
- Local environment files can be neither read nor written, per section 24. `.env.example` stays readable.
- Creating a root `AGENTS.override.md` is denied. Codex would read it *instead of* `AGENTS.md`, and because the file is git-ignored the change would never appear in a diff.

Permission rules are a safety net, not the rule set. They match the command a session runs, so an equivalent form they do not list — a denied binary invoked from inside a `package.json` script, for example — still reaches the shell. The written rules in `AGENTS.md` bind regardless of whether a permission rule happens to cover the case.

Keep personal overrides in `.claude/settings.local.json`, which is git-ignored.

Gemini CLI and Antigravity have their own native project registrations under
`.gemini/` and `.agents/`. They call the same shared skills, workflows, and hook
adapter; do not duplicate repository rules in those files.

### Hooks

`.claude/settings.json` defines three local hooks. They shell out to tools already in the repo, reach no network, and write nothing into the working tree beyond formatting the file just edited:

- after a write or edit, Biome formats that one file, so formatting drift never reaches `bun run check`;
- after a write or edit, the file is checked for npm, pnpm, Yarn, or npx commands and for a foreign lockfile;
- on stopping, if the session edited files but never ran the blocking suite, it says so. It can tell whether the command was run, not whether it passed; reporting a failing check honestly is still section 30's requirement, not the hook's.

The hooks require `jq`. Without it they exit quietly and enforce nothing, so treat them as fast feedback rather than as the guarantee.

The guarantee is `bun run check`, which every harness and CI can run. `check:agents` measures the instruction files against the Codex budget, and `check:pm` enforces section 8 across every tracked and untracked file — the second hook is only the immediate-feedback copy of that check. Claude Code keeps its existing jq-based hooks; Codex, Gemini CLI, and Antigravity use the shared Bun adapter registered in their native project hook files. Read [the harness map](docs/agent-harnesses.md) for the compatibility contract.

<!-- check-package-manager:allow-names -->
