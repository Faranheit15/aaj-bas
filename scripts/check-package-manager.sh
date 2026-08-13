#!/usr/bin/env bash
# Enforces AGENTS.md section 8: Bun is the only package manager, and npm, pnpm,
# and Yarn commands must not appear in documentation, CI, scripts, or code.
#
# Nothing else covers this. Permission rules and command policies see commands a
# session runs, not text it writes, and Biome does not read Markdown or YAML --
# which is most of this repository's prose. Running it here binds Claude Code,
# Codex, and CI equally rather than only the tool that happens to have hooks.
#
# A file that must legitimately name these tools (to prohibit or test for them)
# opts out by containing the marker: check-package-manager:allow-names
set -euo pipefail

marker='check-package-manager:allow-names'

lead='(^|[^[:alnum:]_-])'
verbs='(install|add|ci|run|exec|test|start|build|create|init|i|publish|uninstall|remove|audit|update|upgrade|link|unlink|version|ls|list|pack|dedupe|rebuild|outdated|config|why|workspace|workspaces|dlx)'
pattern="${lead}(npm|pnpm|yarn)[[:space:]]+${verbs}([^[:alnum:]_-]|\$)|${lead}(npx|pnpx)[[:space:]]+[^[:space:]]|${lead}yarn[[:space:]]*$"

status=0
scanned=0

while IFS= read -r f; do
  [ -f "$f" ] || continue
  case "$f" in
    package-lock.json|pnpm-lock.yaml|yarn.lock|npm-shrinkwrap.json|\
*/package-lock.json|*/pnpm-lock.yaml|*/yarn.lock|*/npm-shrinkwrap.json)
      echo "FAIL: $f -- bun.lock is the only permitted lockfile (AGENTS.md section 8)." >&2
      status=1
      continue
      ;;
  esac
  grep -qF "$marker" "$f" 2>/dev/null && continue
  scanned=$(( scanned + 1 ))
  if hits=$(grep -inE "$pattern" "$f" 2>/dev/null); then
    echo "FAIL: $f names a forbidden package manager (AGENTS.md section 8):" >&2
    printf '%s\n' "$hits" | head -5 | sed 's/^/  /' >&2
    status=1
  fi
done < <(git ls-files; git ls-files --others --exclude-standard)

if [ "$status" -eq 0 ]; then
  echo "OK: no npm, pnpm, or Yarn commands and no foreign lockfile in $scanned files."
else
  echo "Use bun install, bun add, bun ci, bun run, or bunx instead." >&2
fi
exit "$status"
