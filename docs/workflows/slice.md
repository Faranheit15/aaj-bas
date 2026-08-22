# Workflow: implement one vertical slice

This procedure is shared. Claude Code reaches it through `/slice`, Codex through
`$slice`, and Gemini CLI through `/slice`. Antigravity can run the same procedure
from its `slice` workflow. No harness-specific entry point restates it.

Implement the requested backlog item as one vertical slice, following the work sequence in `AGENTS.md` section 32 exactly.

1. **Understand** — read the task, `AGENTS.md`, `docs/PRODUCT_CONSTITUTION.md`, the relevant accepted ADRs in `docs/architecture/decisions/`, `docs/PRD.md`, and the surrounding implementation. Read `docs/BACKLOG.md` if the task names a backlog item.
2. **Scope** — state the smallest vertical change that satisfies the task, and state explicitly what is out of scope. Apply the scope-creep test (section 48), the product decision test (section 49), and the engineering decision test (section 50).
3. **Plan** — present the plan for approval before editing: files likely to change, contracts affected, tests required, failure states, risks.
4. **Implement** — make the smallest coherent implementation. No unrelated cleanup.
5. **Test** — add or update tests, then run `bun run check`.
6. **Self-review** — review the diff for correctness, scope creep, accessibility, privacy, security, performance, dependency changes, schema changes, and product-constitution violations.
7. **Report** — respond in the format required by `AGENTS.md` section 51.

Stop after this slice. Do not begin another backlog item.

If the task requires anything in `AGENTS.md` section 47, prepare the change and ask for authorization instead of doing it.
