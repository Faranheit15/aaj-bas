# Gemini CLI entry point

`AGENTS.md` is the canonical instruction set for this repository. Gemini CLI
loads it through the import below; keep Gemini-specific notes limited to
routing and entry-point behavior.

@AGENTS.md

## Gemini CLI routing notes

- Use the shared workspace skills in `.agents/skills/`; do not copy their
  instructions into this file.
- When a task matches `adr`, `check`, `review`, or `slice`, use that skill's
  `SKILL.md` and follow the shared procedure it references in `docs/workflows/`.
- The project commands in `.gemini/commands/` are thin wrappers around those
  shared skills and workflows. Arguments are passed with Gemini CLI's `{{args}}`
  placeholder.
- Keep package and repository checks on the project's Bun-based command
  surface.
- After changing a project command, run `/commands reload`; use `/commands list`
  and `/skills list` to inspect the active project integrations.
