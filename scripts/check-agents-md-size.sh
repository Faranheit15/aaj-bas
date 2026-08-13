#!/usr/bin/env bash
# Guards the agent instruction files against silent truncation by Codex.
#
# Codex reads at most project_doc_max_bytes of project instructions (32 KiB by
# default) and truncates mid-file, reporting it only as a log warning that never
# reaches the interface. Whatever falls past the cutoff -- the end of the file,
# working backwards from the closing rules -- stops binding with no visible
# signal, while Claude Code continues to honor all of it.
#
# Nested AGENTS.md files draw on the same budget: the root file is read first and
# a nested file receives only what remains, so they are measured together.
#
# .codex/config.toml raises the budget, but that applies only once a user has
# trusted the project, so this check deliberately assumes the default.
set -euo pipefail

limit=32768
warn_at=$(( limit * 85 / 100 ))

mapfile -t files < <(git ls-files -z 'AGENTS.md' '*/AGENTS.md' | tr '\0' '\n')

if [ "${#files[@]}" -eq 0 ]; then
  echo "FAIL: no tracked AGENTS.md found." >&2
  echo "AGENTS.md is the binding rule set for every agent tool; it must exist and be tracked." >&2
  exit 1
fi

size=0
for f in "${files[@]}"; do
  if [ ! -f "$f" ]; then
    echo "FAIL: $f is tracked but missing from the working tree." >&2
    exit 1
  fi
  size=$(( size + $(wc -c < "$f") ))
done

if [ "$size" -eq 0 ]; then
  echo "FAIL: the tracked AGENTS.md files are empty." >&2
  exit 1
fi

names="${files[*]}"
pct=$(( size * 100 / limit ))

if [ "$size" -gt "$limit" ]; then
  echo "FAIL: instruction files ($names) total $size bytes, over the ${limit}-byte Codex default budget." >&2
  echo "Codex would truncate mid-file, silently dropping the end of the rules." >&2
  echo "Shorten them, or move reference material into docs/." >&2
  exit 1
fi

if [ "$size" -gt "$warn_at" ]; then
  echo "WARN: instruction files ($names) total $size bytes (${pct}% of the ${limit}-byte Codex default budget)."
  echo "Only $(( limit - size )) bytes of headroom remain."
else
  echo "OK: instruction files ($names) total $size bytes (${pct}% of the ${limit}-byte Codex budget)."
fi
