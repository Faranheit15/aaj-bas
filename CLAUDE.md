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
- A nested `AGENTS.md` may narrow behavior for a subdirectory; nested `CLAUDE.md` files are not used.

### Work sequence

`AGENTS.md` section 32 defines the required sequence. In Claude Code:

- Step 3 (Plan) — use plan mode for non-trivial work, and get the plan approved before editing.
- Step 5 (Test) — run the checks in section 30 with the Bash tool; never report a check as passing unless its output was seen.
- Step 7 (Report) — end implementation work with the response format in section 51.

### Commands

- `/check` — run the merge-blocking suite.
- `/slice` — carry out one backlog item as a single vertical slice, following section 32.
- `/adr` — draft an architecture decision record from the ADR template.

### Permissions

`.claude/settings.json` encodes the parts of `AGENTS.md` that a permission rule can enforce:

- Bun commands from section 8 are allowed without prompting; npm, pnpm, and Yarn are denied.
- Production deployment commands are denied, per section 47; deployment happens only through CI on `develop`.
- Local environment files are not readable, per section 23 and section 24.

Permission rules are a safety net, not the rule set. The written rules in `AGENTS.md` still bind in cases no permission rule covers.

Keep personal overrides in `.claude/settings.local.json`, which is git-ignored.
