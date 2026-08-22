# Agent harness compatibility

`AGENTS.md` is the only binding repository rule set. The files in this document
are adapters for the tools that load it; they are intentionally thin and must
not become a second policy system.

## Shared surface

All supported harnesses should use:

- `AGENTS.md` for product and engineering rules;
- `docs/workflows/` for the three repository procedures;
- `.agents/skills/adr`, `.agents/skills/check`, `.agents/skills/review`, and
  `.agents/skills/slice` for discoverable workflow entry points;
- `scripts/agent-hook.ts` for the small, shared command-policy and formatting
  adapter where the harness supports hooks.

The repository contains no external Claude-only book, private prompt bundle, or
untracked skill manifest to install. The Claude-specific workflow entry points
were the repository's `.claude/commands/` wrappers; those procedures now have
shared skill and workflow adapters for the other harnesses.

## Harness map

| Harness | Entry point | Project customizations |
| --- | --- | --- |
| Claude Code | `CLAUDE.md` | `.claude/commands/`, `.claude/settings.json` |
| Codex | `AGENTS.md` | `.codex/config.toml`, `.codex/rules/team.rules`, `.codex/hooks.json` |
| Gemini CLI | `GEMINI.md` | `.gemini/settings.json`, `.gemini/commands/` |
| Antigravity | `AGENTS.md` plus `.agents/rules/` | `.agents/workflows/`, `.agents/hooks.json`, `.agents/agents/` |

Codex, Gemini CLI, and Antigravity all discover the shared `.agents/skills/`
directory. Claude Code continues to use its existing command wrappers, which
point to the same `docs/workflows/` procedures.

## Hook policy

The native hook files call the same Bun adapter. It blocks commands that would
use a competing package manager, create or mutate a foreign lockfile, deploy,
or mutate secrets and external APIs. It formats an edited Biome-supported file
when the harness exposes a safe path, and Codex receives a stop reminder when
the transcript shows edits without a recorded `bun run check`.

The adapter fails open when a hook payload, transcript, or formatter is
unavailable. `bun run check` and CI remain the authoritative validation gate.
Hooks are local feedback and safety rails, not a replacement for review or
human authorization.

## First-run notes

- Trust the repository project layer in Codex so `.codex/` configuration and
  hooks are loaded.
- In Gemini CLI, reload project commands after changing `.gemini/commands/` with
  `/commands reload`, then inspect `/commands list` and `/skills list`.
- In Antigravity, use `/agents` to discover the workspace reviewer agent. Its
  definition is deliberately limited to `name`, `description`, and read-only
  instructions for compatibility across the CLI and IDE surfaces.
- Do not copy these files into global user configuration. Keeping them in the
  repository makes a fresh clone reproducible and keeps personal settings out
  of source control.

## Official loader references

- [Codex project instructions](https://learn.chatgpt.com/docs/agent-configuration/agents-md), [Codex skills](https://learn.chatgpt.com/docs/customization/overview), and [Codex hooks](https://learn.chatgpt.com/docs/hooks)
- [Gemini CLI configuration](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/configuration.md), [skills](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/using-agent-skills.md), and [hooks](https://github.com/google-gemini/gemini-cli/blob/main/docs/hooks/reference.md)
- [Antigravity rules and workflows](https://antigravity.google/docs/rules-workflows/), [skills](https://antigravity.google/docs/skills/), [hooks](https://antigravity.google/docs/ide/hooks/), and [custom agents](https://antigravity.google/docs/cli/commands/agents/)
