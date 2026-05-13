#!/usr/bin/env bash
#
# PreToolUse hook for `gh pr create`. Blocks the call if the active session
# transcript does not contain a Skill tool_use entry for visual-fidelity-check
# AND the project has visual-fidelity wired up. Fail-closed: when the hook
# can't tell, surface a warning rather than silently allowing.
#
# Expected stdin (Claude Code PreToolUse payload shape — see
# https://docs.claude.com/en/docs/claude-code/hooks):
#   { "session_id": "...",
#     "transcript_path": "/path/to/session.jsonl",
#     "cwd": "/path/to/worktree",
#     "hook_event_name": "PreToolUse",
#     "tool_name": "Bash",
#     "tool_input": { "command": "..." } }
#
# The relative path in .claude/settings.json resolves from Claude Code's cwd,
# which `crew run` sets to the worktree root. Sessions started in a subdir of
# the worktree will fail to locate this script.

set -euo pipefail

input=$(cat)

# Only gate gh pr create — let everything else pass.
command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
case "$command" in
  "gh pr create"*) : ;;
  *) exit 0 ;;
esac

cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
if [[ -z "$cwd" ]]; then
  echo "visual-fidelity-pr-gate: hook input missing cwd — failing closed" >&2
  exit 2
fi

# Project must have visual-fidelity config; otherwise no gate.
# Presence-only check — empty `{}` counts as "wired up" intentionally.
if [[ ! -f "$cwd/.crew/visual-fidelity.json" ]]; then
  # Also accept the TOML form: [visual_fidelity] in any .toml under .crew/
  if ! grep -lq '^\[visual_fidelity\]' "$cwd"/.crew/*.toml 2>/dev/null; then
    exit 0
  fi
fi

transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty')
if [[ -z "$transcript" || ! -f "$transcript" ]]; then
  echo "visual-fidelity-pr-gate: cannot read transcript ($transcript) — failing closed" >&2
  exit 2
fi

# Scan the JSONL for any Skill tool_use whose input.skill equals visual-fidelity-check.
# Use any/2 (generator; condition) — any/1 collapses the pipeline incorrectly when
# intermediate selects filter the stream.
jq_err=$(mktemp)
trap 'rm -f "$jq_err"' EXIT
if jq -e --slurp '
  any(
    .[]
    | select(.type == "assistant")
    | (.message.content // [])
    | .[];
    .type == "tool_use"
    and .name == "Skill"
    and .input.skill == "visual-fidelity-check"
  )
' "$transcript" >/dev/null 2>"$jq_err"; then
  exit 0
fi
jq_status=$?

# jq exit codes: 0 (true), 1 (false), 2 (compile error), 3 (usage), 4 (no input), 5 (parse error).
# Anything other than 1 means the transcript was unreadable as JSONL.
if [[ "$jq_status" -ne 1 ]]; then
  echo "visual-fidelity-pr-gate: failed to scan transcript ($transcript) — failing closed" >&2
  if [[ -s "$jq_err" ]]; then
    sed 's/^/  jq: /' "$jq_err" >&2
  fi
  exit 2
fi

cat >&2 <<'MSG'
visual-fidelity-check skill has not been invoked this session.

Per the dispatch workflow (step 8), the visual-fidelity gate must run before
opening a PR. Invoke the skill via the Skill tool, address any high-severity
findings, then retry `gh pr create`.
MSG
exit 2
