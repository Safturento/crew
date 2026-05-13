#!/usr/bin/env bash
#
# Bash-level tests for visual-fidelity-pr-gate.sh.
# Run with: bash packages/cli/scripts/hooks/visual-fidelity-pr-gate.test.sh
#
# Fixtures use the real Claude Code PreToolUse payload shape:
#   { session_id, transcript_path, cwd, hook_event_name,
#     tool_name, tool_input: { command } }
# See https://docs.claude.com/en/docs/claude-code/hooks for the contract.
#
# Coverage:
#   1. gh pr create + no visual-fidelity config           → exit 0 (no gate)
#   2. gh pr create + vf config + transcript w/o skill    → exit 2 (block)
#   3. gh pr create + vf config + transcript with skill   → exit 0 (allow)
#   4. non-gh-pr-create command                           → exit 0 (no gate)
#   5. missing transcript_path                            → exit 2 (fail closed)
#   6. transcript with a different Skill invocation only  → exit 2 (block)
#   7. transcript with malformed JSONL                    → exit 2 (fail closed)
#   8. gh pr create + vf config via .crew/*.toml          → exit 2 (block)

set -euo pipefail

cd "$(dirname "$0")"
HOOK="$PWD/visual-fidelity-pr-gate.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0

assert_exit() {
  local expected="$1"
  local actual="$2"
  local name="$3"
  if [[ "$actual" -eq "$expected" ]]; then
    printf "  ok %s\n" "$name"
    pass=$((pass+1))
  else
    printf "  FAIL %s (expected exit %s, got %s)\n" "$name" "$expected" "$actual"
    fail=$((fail+1))
  fi
}

make_input() {
  # $1 = command, $2 = cwd, $3 = transcript_path (optional)
  local cmd="$1" cwd="$2" transcript="${3-}"
  if [[ -n "$transcript" ]]; then
    jq -n --arg cmd "$cmd" --arg cwd "$cwd" --arg t "$transcript" '{
      session_id: "test",
      transcript_path: $t,
      cwd: $cwd,
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: $cmd }
    }'
  else
    jq -n --arg cmd "$cmd" --arg cwd "$cwd" '{
      session_id: "test",
      cwd: $cwd,
      hook_event_name: "PreToolUse",
      tool_name: "Bash",
      tool_input: { command: $cmd }
    }'
  fi
}

# Fixture 1: gh pr create + no visual-fidelity config → pass (no gate applies)
mkdir -p "$TMP/no-vf-project"
transcript="$TMP/transcript-empty.jsonl"
echo '{"type":"user","message":{"content":"hi"}}' > "$transcript"
input=$(make_input "gh pr create --title foo" "$TMP/no-vf-project" "$transcript")
set +e; printf '%s' "$input" | "$HOOK"; assert_exit 0 $? "no-vf-config passes"; set -e

# Fixture 2: gh pr create + has visual-fidelity config + transcript without skill → block
mkdir -p "$TMP/vf-project/.crew"
echo '{"figmaFileKey":"x"}' > "$TMP/vf-project/.crew/visual-fidelity.json"
transcript="$TMP/transcript-no-skill.jsonl"
echo '{"type":"assistant","message":{"content":[{"type":"text","text":"hello"}]}}' > "$transcript"
input=$(make_input "gh pr create --title foo" "$TMP/vf-project" "$transcript")
set +e; printf '%s' "$input" | "$HOOK" 2>/dev/null; assert_exit 2 $? "no-skill blocks"; set -e

# Fixture 3: gh pr create + has visual-fidelity config + transcript WITH skill → pass
transcript="$TMP/transcript-with-skill.jsonl"
echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"visual-fidelity-check"}}]}}' > "$transcript"
input=$(make_input "gh pr create --title foo" "$TMP/vf-project" "$transcript")
set +e; printf '%s' "$input" | "$HOOK"; assert_exit 0 $? "skill-present passes"; set -e

# Fixture 4: not gh pr create → always pass (hook is opt-in to the command)
input=$(make_input "npm run build" "$TMP/vf-project" "$transcript")
set +e; printf '%s' "$input" | "$HOOK"; assert_exit 0 $? "non-gh-pr-create passes"; set -e

# Fixture 5: missing transcript_path → fail closed (exit 2)
input=$(make_input "gh pr create --title foo" "$TMP/vf-project")
set +e; printf '%s' "$input" | "$HOOK" 2>/dev/null; assert_exit 2 $? "missing-transcript fails closed"; set -e

# Fixture 6: transcript has Skill but for a different skill → still block
transcript="$TMP/transcript-other-skill.jsonl"
echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"bruno-collection-maintenance"}}]}}' > "$transcript"
input=$(make_input "gh pr create --title foo" "$TMP/vf-project" "$transcript")
set +e; printf '%s' "$input" | "$HOOK" 2>/dev/null; assert_exit 2 $? "other-skill blocks"; set -e

# Fixture 7: malformed JSONL → fail closed with clear warning
transcript="$TMP/transcript-malformed.jsonl"
printf 'this is not json\n{"type":"assistant"}\n' > "$transcript"
input=$(make_input "gh pr create --title foo" "$TMP/vf-project" "$transcript")
set +e; stderr=$(printf '%s' "$input" | "$HOOK" 2>&1 >/dev/null); status=$?; set -e
assert_exit 2 "$status" "malformed-jsonl fails closed"
if ! printf '%s' "$stderr" | grep -q "failed to scan transcript"; then
  printf "  FAIL malformed-jsonl emits 'failed to scan transcript' warning (stderr: %s)\n" "$stderr"
  fail=$((fail+1))
else
  printf "  ok malformed-jsonl emits clear warning\n"
  pass=$((pass+1))
fi

# Fixture 8: vf config supplied via .crew/*.toml [visual_fidelity] (not JSON) → still gates
mkdir -p "$TMP/vf-toml-project/.crew"
cat > "$TMP/vf-toml-project/.crew/config.toml" <<'TOML'
[visual_fidelity]
snapshot_path = ".crew/snap"
component_dir = "packages/dashboard/src/components"
TOML
transcript="$TMP/transcript-no-skill.jsonl"
input=$(make_input "gh pr create --title foo" "$TMP/vf-toml-project" "$transcript")
set +e; printf '%s' "$input" | "$HOOK" 2>/dev/null; assert_exit 2 $? "toml-config blocks"; set -e

printf "\n%s passed, %s failed\n" "$pass" "$fail"
exit "$fail"
