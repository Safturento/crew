#!/usr/bin/env bash
#
# Bash-level tests for visual-fidelity-pr-gate.sh.
# Run with: bash packages/cli/scripts/hooks/visual-fidelity-pr-gate.test.sh

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

# Fixture 1: gh pr create + no visual-fidelity config → pass (no gate applies)
mkdir -p "$TMP/no-vf-project"
transcript="$TMP/transcript-empty.jsonl"
echo '{"type":"user","message":{"content":"hi"}}' > "$transcript"
input=$(jq -n --arg cwd "$TMP/no-vf-project" --arg t "$transcript" \
  '{tool_use:{name:"Bash",input:{command:"gh pr create --title foo"}},transcript_path:$t,cwd:$cwd}')
set +e; printf '%s' "$input" | "$HOOK"; assert_exit 0 $? "no-vf-config passes"; set -e

# Fixture 2: gh pr create + has visual-fidelity config + transcript without skill → block
mkdir -p "$TMP/vf-project/.crew"
echo '{"figmaFileKey":"x"}' > "$TMP/vf-project/.crew/visual-fidelity.json"
transcript="$TMP/transcript-no-skill.jsonl"
echo '{"type":"assistant","message":{"content":[{"type":"text","text":"hello"}]}}' > "$transcript"
input=$(jq -n --arg cwd "$TMP/vf-project" --arg t "$transcript" \
  '{tool_use:{name:"Bash",input:{command:"gh pr create --title foo"}},transcript_path:$t,cwd:$cwd}')
set +e; printf '%s' "$input" | "$HOOK" 2>/dev/null; assert_exit 2 $? "no-skill blocks"; set -e

# Fixture 3: gh pr create + has visual-fidelity config + transcript WITH skill → pass
transcript="$TMP/transcript-with-skill.jsonl"
echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"visual-fidelity-check"}}]}}' > "$transcript"
input=$(jq -n --arg cwd "$TMP/vf-project" --arg t "$transcript" \
  '{tool_use:{name:"Bash",input:{command:"gh pr create --title foo"}},transcript_path:$t,cwd:$cwd}')
set +e; printf '%s' "$input" | "$HOOK"; assert_exit 0 $? "skill-present passes"; set -e

# Fixture 4: not gh pr create → always pass (hook is opt-in to the command)
input=$(jq -n --arg cwd "$TMP/vf-project" --arg t "$transcript" \
  '{tool_use:{name:"Bash",input:{command:"npm run build"}},transcript_path:$t,cwd:$cwd}')
set +e; printf '%s' "$input" | "$HOOK"; assert_exit 0 $? "non-gh-pr-create passes"; set -e

# Fixture 5: missing transcript_path → fail closed (exit 2)
input=$(jq -n --arg cwd "$TMP/vf-project" \
  '{tool_use:{name:"Bash",input:{command:"gh pr create --title foo"}},cwd:$cwd}')
set +e; printf '%s' "$input" | "$HOOK" 2>/dev/null; assert_exit 2 $? "missing-transcript fails closed"; set -e

printf "\n%s passed, %s failed\n" "$pass" "$fail"
exit "$fail"
