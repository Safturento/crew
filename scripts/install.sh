#!/usr/bin/env bash
# Install the crew CLI for the current user.
#
# Symlinks ~/.local/bin/crew → <repo>/packages/cli/bin/crew so the command
# resolves regardless of which Node version fnm has active. Also installs
# the system packages crew's sandboxed agent runtime depends on
# (bubblewrap + socat). Idempotent: safe to re-run after a fresh clone.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BIN_SOURCE="$REPO_ROOT/packages/cli/bin/crew"
BIN_TARGET="$HOME/.local/bin/crew"

if [[ ! -f "$BIN_SOURCE" ]]; then
  echo "error: $BIN_SOURCE not found — is the workspace layout correct?" >&2
  exit 1
fi

# System deps for `crew run` — bubblewrap is the sandbox runtime, socat
# is the network-allowlist proxy that runs alongside it. Chromium libs
# are required for headless Playwright runs in projects that enable
# [playwright] in their crew config.
if command -v apt-get >/dev/null 2>&1; then
  missing_pkgs=()
  command -v bwrap  >/dev/null 2>&1 || missing_pkgs+=(bubblewrap)
  command -v socat  >/dev/null 2>&1 || missing_pkgs+=(socat)
  # Chromium runtime libraries (Playwright --with-deps list for linux).
  # Probe one canonical lib via ldconfig; if missing, install the full set.
  if ! ldconfig -p 2>/dev/null | grep -q libnss3.so; then
    missing_pkgs+=(
      libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2
      libdbus-1-3 libxcb1 libxkbcommon0 libxcomposite1 libxdamage1
      libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2
      libatspi2.0-0
    )
  fi
  if [[ ${#missing_pkgs[@]} -gt 0 ]]; then
    echo "Installing system deps via apt: ${missing_pkgs[*]}"
    sudo apt-get install -y "${missing_pkgs[@]}"
  fi
else
  if ! command -v bwrap >/dev/null 2>&1 || ! command -v socat >/dev/null 2>&1; then
    echo "warning: apt-get not found. Install 'bubblewrap', 'socat', and Chromium runtime libs (libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libdbus-1-3 libxcb1 libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 libatspi2.0-0) via your package manager before running 'crew run'." >&2
  fi
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
