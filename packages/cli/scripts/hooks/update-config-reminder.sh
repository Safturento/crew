#!/usr/bin/env bash
# PreToolUse hook — Edit|Write matcher.
# When the file being edited is settings.json / settings.local.json, inject a
# reminder to consult the update-config skill. Non-blocking: emits
# additionalContext only, never a permission decision; always exits 0.
#
# Rationale: settings.json changes have a skill (update-config) that carries the
# schema + the array-merge rule, but a plain description doesn't reliably get
# noticed mid-flow. This hook is the deterministic backstop.

file=$(jq -r '.tool_input.file_path // empty' 2>/dev/null || true)
base=${file##*/}

case "$base" in
  settings.json | settings.local.json)
    printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"This edits a settings.json file. Consult the update-config skill if you have not — it has the settings schema and the array-merge rule: merge into existing arrays, never replace them."}}'
    ;;
esac

exit 0
