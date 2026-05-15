#!/usr/bin/env bash
#
# Bash-level tests for doc-parity-gate.sh.
# Run with: bash packages/cli/scripts/hooks/doc-parity-gate.test.sh
#
# Fixtures use the real Claude Code PreToolUse payload shape:
#   { session_id, transcript_path, cwd, hook_event_name,
#     tool_name, tool_input: { command } }
# See https://docs.claude.com/en/docs/claude-code/hooks for the contract.
#
# Each gh-pr-create fixture builds a throwaway git repo with a `main` branch
# plus a feature branch, so the hook's merge-base diff has something to walk.
# Topic-doc frontmatter mirrors the real .agents/<topic>.md shape (YAML list
# under `covers:`, single- or double-quoted globs).
#
# Coverage:
#   1. non-gated command (ls)                          → exit 0 (no gate)
#   2. gh pr create + cwd has no .agents/              → exit 0 (no gate)
#   3. covered code changed + doc updated alongside    → exit 0 (parity held)
#   4. covered code changed + doc NOT updated          → exit 1 (warn)

set -euo pipefail

cd "$(dirname "$0")"
HOOK="$PWD/doc-parity-gate.sh"
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
  # $1 = command, $2 = cwd
  jq -n --arg cmd "$1" --arg cwd "$2" '{
    session_id: "test",
    cwd: $cwd,
    hook_event_name: "PreToolUse",
    tool_name: "Bash",
    tool_input: { command: $cmd }
  }'
}

git_quiet() {
  git -c user.email=test@test -c user.name=test -c commit.gpgsign=false "$@"
}

# Builds a repo with a topic doc on `main`, then a feature branch that edits a
# covered file. If $1 is "with-doc", the feature branch also touches the doc.
make_repo() {
  local repo="$1" mode="$2"
  mkdir -p "$repo/.agents"
  cat > "$repo/.agents/architecture.md" <<'EOF'
---
name: architecture
description: layering rules
last_updated: 2026-05-13
covers:
  - 'packages/cli/**'
  - "package.json"
---

# Architecture
EOF
  (
    cd "$repo"
    git init -q -b main
    git_quiet add .
    git_quiet commit -q -m "initial"
    git_quiet checkout -q -b feature
    mkdir -p packages/cli
    echo "export const x = 1;" > packages/cli/foo.ts
    if [[ "$mode" == "with-doc" ]]; then
      printf '\nUpdated.\n' >> .agents/architecture.md
    fi
    git_quiet add .
    git_quiet commit -q -m "edit covered code"
  )
}

# Fixture 1: non-gated command → pass (hook is opt-in to specific commands)
mkdir -p "$TMP/repo1/.agents"
input=$(make_input "ls -la" "$TMP/repo1")
set +e; printf '%s' "$input" | "$HOOK"; assert_exit 0 $? "non-gated command passes"; set -e

# Fixture 2: gh pr create + no .agents/ directory → pass (nothing to check)
mkdir -p "$TMP/repo2"
input=$(make_input "gh pr create --title foo" "$TMP/repo2")
set +e; printf '%s' "$input" | "$HOOK"; assert_exit 0 $? "no .agents dir passes"; set -e

# Fixture 3: covered code changed AND its topic doc updated alongside → pass
make_repo "$TMP/repo3" "with-doc"
input=$(make_input "gh pr create --title foo" "$TMP/repo3")
set +e; printf '%s' "$input" | "$HOOK" 2>/dev/null; assert_exit 0 $? "doc updated alongside code passes"; set -e

# Fixture 4: covered code changed but topic doc untouched → warn (exit 1)
make_repo "$TMP/repo4" "no-doc"
input=$(make_input "gh pr create --title foo" "$TMP/repo4")
set +e; stderr=$(printf '%s' "$input" | "$HOOK" 2>&1 >/dev/null); status=$?; set -e
assert_exit 1 "$status" "stale doc warns"
if printf '%s' "$stderr" | grep -q ".agents/architecture.md"; then
  printf "  ok stale doc named in warning\n"
  pass=$((pass+1))
else
  printf "  FAIL stale doc named in warning (stderr: %s)\n" "$stderr"
  fail=$((fail+1))
fi

# Bonus: CREW_DOC_PARITY_OVERRIDE=1 turns the fixture-4 violation into a pass.
input=$(make_input "gh pr create --title foo" "$TMP/repo4")
set +e
CREW_DOC_PARITY_OVERRIDE=1 bash -c 'printf "%s" "$1" | "$2"' _ "$input" "$HOOK" 2>/dev/null
assert_exit 0 $? "override env var bypasses warning"
set -e

printf "\n%s passed, %s failed\n" "$pass" "$fail"
exit "$fail"
