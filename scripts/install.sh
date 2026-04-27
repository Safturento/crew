#!/usr/bin/env bash
# Install the crew CLI for the current user.
#
# Symlinks ~/.local/bin/crew → <repo>/packages/cli/bin/crew.js so the
# command resolves regardless of which Node version fnm has active.
# Idempotent: safe to re-run after a fresh clone or dependency reset.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_SOURCE="$REPO_ROOT/packages/cli/bin/crew"
BIN_TARGET="$HOME/.local/bin/crew"

if [[ ! -f "$BIN_SOURCE" ]]; then
  echo "error: $BIN_SOURCE not found — is the workspace layout correct?" >&2
  exit 1
fi

if [[ ! -d "$REPO_ROOT/node_modules" ]]; then
  echo "Installing npm dependencies..."
  (cd "$REPO_ROOT" && npm install)
fi

mkdir -p "$HOME/.local/bin"
chmod +x "$BIN_SOURCE"
ln -sf "$BIN_SOURCE" "$BIN_TARGET"
echo "linked: $BIN_TARGET -> $BIN_SOURCE"

if ! echo ":$PATH:" | grep -q ":$HOME/.local/bin:"; then
  echo
  echo "warning: $HOME/.local/bin is not on PATH."
  echo "Add this to your shell rc, then start a new shell:"
  echo '  export PATH="$HOME/.local/bin:$PATH"'
  exit 0
fi

echo "done. try: crew --help"
