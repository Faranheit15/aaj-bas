---
description: Run the merge-blocking check suite
allowed-tools: Bash(bun run check), Bash(bun run format:check), Bash(bun run lint), Bash(bun run typecheck), Bash(bun run test), Bash(bun run build)
---

Run the merge-blocking suite defined in `AGENTS.md` section 30:

```bash
bun run check
```

If it fails, report the failing stage and its actual output. Do not suppress, skip, or work around a failing check to make the suite pass. Do not claim a command passed unless its output was seen.

If the failure is inside the change currently being worked on, fix the cause and re-run. If the failure is unrelated to the current work, report it and stop rather than fixing it here — `AGENTS.md` section 35 forbids unrelated refactors.
