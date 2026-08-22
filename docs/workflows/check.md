# Workflow: run the merge-blocking checks

This procedure is shared. Claude Code reaches it through `/check`, Codex through
`$check`, and Gemini CLI through `/check`. Antigravity can run the same procedure
from its `check` workflow. No harness-specific entry point restates it.

Run the merge-blocking suite defined in `AGENTS.md` section 30:

```bash
bun run check
```

`bun run check` is not the whole of what blocks a merge. `bun run e2e` is merge-blocking too, and is
deliberately outside `check`: it needs a browser and a Node runtime, which `check` must not require
(ADR-0010). Run it as well when the change touches the reader's shell, the service worker, the
manifest, or anything about offline behaviour, and before opening a pull request:

```bash
bun run e2e
```

It builds `apps/web/dist` itself, serves it, and stops the server mid-spec to produce a genuinely
offline browser. It leaves the published build in `dist` when it finishes. CI runs it as its own
`e2e` job, in parallel with `check`, and both are required status checks on `develop`.

If either fails, report the failing stage and its actual output. Do not suppress, skip, or work around a failing check to make the suite pass. Do not claim a command passed unless its output was seen.

If the failure is inside the change currently being worked on, fix the cause and re-run. If the failure is unrelated to the current work, report it and stop rather than fixing it here — `AGENTS.md` section 35 forbids unrelated refactors.
