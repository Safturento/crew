#!/usr/bin/env bash
#
# PreToolUse hook for `gh pr create` and `git commit`. Walks the active diff,
# finds .agents/<topic>.md docs whose `covers:` globs overlap any changed file,
# and warns when those docs were not touched in the same diff.
#
# Soft gate: exit 1 (warn, non-blocking) on a parity violation, never exit 2
# (block). Override with CREW_DOC_PARITY_OVERRIDE=1 after stating a reason.
#
# Expected stdin (Claude Code PreToolUse payload — see
# https://docs.claude.com/en/docs/claude-code/hooks):
#   { "session_id": "...", "cwd": "/path/to/worktree",
#     "hook_event_name": "PreToolUse", "tool_name": "Bash",
#     "tool_input": { "command": "..." } }
#
# The relative path in .claude/settings.json resolves from Claude Code's cwd,
# which `crew run` sets to the worktree root.

set -euo pipefail

input=$(cat)

# Only gate `gh pr create` and `git commit` — let everything else pass.
command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
case "$command" in
  "gh pr create"*) : ;;
  "git commit"*) : ;;
  *) exit 0 ;;
esac

cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
if [[ -z "$cwd" || ! -d "$cwd/.agents" ]]; then
  # No .agents/ topic docs in this cwd — nothing to check.
  exit 0
fi

cd "$cwd"

# Gather changed files. For `gh pr create`, diff the branch against its
# merge-base with the default branch. For `git commit`, use staged changes.
case "$command" in
  "gh pr create"*)
    base=$(git merge-base HEAD main 2>/dev/null \
        || git merge-base HEAD origin/main 2>/dev/null \
        || true)
    if [[ -z "$base" ]]; then
      echo "doc-parity-gate: cannot determine merge base — skipping" >&2
      exit 0
    fi
    changed=$(git diff --name-only "$base" HEAD)
    ;;
  "git commit"*)
    changed=$(git diff --cached --name-only)
    ;;
esac

if [[ -z "$changed" ]]; then
  exit 0
fi

# `*` already crosses `/` inside [[ == ]]; globstar/extglob keep richer
# patterns (e.g. extended globs) behaving as authors expect.
shopt -s extglob globstar

violations=""
for doc in .agents/*.md; do
  [[ -e "$doc" ]] || continue
  [[ "$doc" == ".agents/README.md" ]] && continue

  # Extract the `covers:` YAML list from the doc's frontmatter. Quotes are
  # stripped via the \042 (") and \047 (') octal escapes so the awk program
  # carries no literal quote of its own.
  covers=$(awk '
    /^---$/ { fm++; next }
    fm == 1 && /^covers:[[:space:]]*$/ { in_covers = 1; next }
    in_covers && /^[[:space:]]+-[[:space:]]/ {
      line = $0
      sub(/^[[:space:]]+-[[:space:]]*/, "", line)
      gsub(/[\042\047]/, "", line)
      sub(/[[:space:]]+$/, "", line)
      print line
      next
    }
    in_covers && /^[^[:space:]]/ { in_covers = 0 }
    fm == 2 { exit }
  ' "$doc")

  [[ -z "$covers" ]] && continue

  # Does any changed file match any of this doc's covers globs?
  doc_overlaps=false
  while IFS= read -r pattern; do
    [[ -z "$pattern" ]] && continue
    while IFS= read -r changed_file; do
      [[ -z "$changed_file" ]] && continue
      if [[ "$changed_file" == $pattern ]]; then
        doc_overlaps=true
        break 2
      fi
    done <<< "$changed"
  done <<< "$covers"

  # Covered code changed but the doc itself was not part of the diff.
  if [[ "$doc_overlaps" == true ]] && ! printf '%s\n' "$changed" | grep -Fxq "$doc"; then
    violations="$violations $doc"
  fi
done

if [[ -z "$violations" ]]; then
  exit 0
fi

{
  echo "doc-parity-gate: warning — these .agents/ docs cover changed code but were not updated:"
  for v in $violations; do
    echo "  - $v"
  done
  echo ""
  echo "Review each: update it (and bump last_updated), or confirm it's still current."
  echo "Override: re-run with CREW_DOC_PARITY_OVERRIDE=1 set, after stating your reason."
} >&2

if [[ "${CREW_DOC_PARITY_OVERRIDE:-}" == "1" ]]; then
  echo "doc-parity-gate: override accepted." >&2
  exit 0
fi

exit 1
