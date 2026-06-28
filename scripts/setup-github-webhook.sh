#!/usr/bin/env bash
# scripts/setup-github-webhook.sh <owner/repo>
#
# Creates a `pull_request`-only GitHub webhook pointed at the crew Tailscale
# Funnel URL and prints the new hook id. Record that id in the repo's project
# TOML as `[github] webhook_hook_id = "<id>"`, then restart the daemon so it
# pins deliveries to this hook.
#
# The per-repo HMAC secret is read from ~/.config/crew/github-webhook-secrets.toml
# (NOT passed on the command line / argv, so it never lands in shell history or
# the process table). That file must already contain an entry for <owner/repo>:
#
#   ["Owner/repo"]
#   secret = "<openssl rand -hex 32>"
#
# Requires: gh (authenticated with admin:repo_hook scope), python3 (>= 3.11 for
# tomllib), and the secret present for <owner/repo>.
set -euo pipefail

REPO="${1:?usage: setup-github-webhook.sh <owner/repo>}"
# The public payload URL GitHub delivers to — the crew Caddy front door behind a
# dedicated Tailscale Funnel port (CREW-303). Set it explicitly so this script
# isn't pinned to one node/tailnet, e.g.:
#   export CREW_WEBHOOK_PAYLOAD_URL=https://<node>.<tailnet>.ts.net:8443/api/webhooks/github
URL="${CREW_WEBHOOK_PAYLOAD_URL:?set CREW_WEBHOOK_PAYLOAD_URL to the funnel payload URL (https://<node>.<tailnet>.ts.net:8443/api/webhooks/github)}"
SECRETS_FILE="${CREW_GITHUB_WEBHOOK_SECRETS_FILE:-$HOME/.config/crew/github-webhook-secrets.toml}"

if [ ! -f "$SECRETS_FILE" ]; then
  echo "secrets file not found: $SECRETS_FILE" >&2
  echo "create it first (see docs/runbooks/github-webhook-funnel.md, step 3)" >&2
  exit 1
fi

# Resolve the secret for this repo, case-insensitively (GitHub treats owner/repo
# case-insensitively, and the daemon lowercases keys on load).
SECRET="$(python3 - "$REPO" "$SECRETS_FILE" <<'PY'
import sys, tomllib, pathlib
repo = sys.argv[1].lower()
data = tomllib.loads(pathlib.Path(sys.argv[2]).read_text())
for key, val in data.items():
    if key.lower() == repo:
        print(val["secret"])
        break
PY
)"

if [ -z "$SECRET" ]; then
  echo "no secret for '$REPO' in $SECRETS_FILE" >&2
  echo "add an [\"$REPO\"] entry with a 'secret = \"...\"' line, then re-run" >&2
  exit 1
fi

echo "creating pull_request webhook on $REPO -> $URL" >&2
HOOK_ID="$(gh api -X POST "repos/$REPO/hooks" \
  -f "name=web" \
  -F "active=true" \
  -f "events[]=pull_request" \
  -f "config[url]=$URL" \
  -f "config[content_type]=json" \
  -f "config[secret]=$SECRET" \
  --jq '.id')"

echo "hook_id=$HOOK_ID"
echo >&2
echo "next: set [github] webhook_hook_id = \"$HOOK_ID\" in the $REPO project TOML, then restart the daemon." >&2
