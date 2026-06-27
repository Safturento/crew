# Runbook: GitHub PR-merge webhook via crew Caddy + Tailscale Funnel

Operator setup for the GitHub `pull_request` webhook that flips an agent
`pr_open → pr_merged` near-instantly (vs. the 30-minute `PrPoller` backstop).

**Topology (CREW-303):** GitHub delivers over the public internet to a **dedicated
Tailscale Funnel port**, which proxies to a **crew-owned Caddy** front door that
allow-lists *only* `POST /api/webhooks/github` and 404s everything else, then on
to the daemon's receiver. The daemon's other (unauthenticated) routes are never
exposed. Tailscale Funnel is **port-level, not path-level** — Caddy is what does
the path scoping.

```
GitHub ──POST https://<node>.<tailnet>.ts.net:8443/api/webhooks/github──▶
  Tailscale Funnel :8443 (public) ──▶ crew Caddy :8081 (allow-list) ──▶ daemon:7773
    └▶ GithubWebhookService (HMAC + hook-ID pin) ──▶ PrTransitionService.markMerged
```

## Prerequisites

- **Tailscale Funnel enabled in the tailnet ACL** for the node. Add a `nodeAttrs`
  grant in the admin **Access Controls** policy file:
  ```jsonc
  "nodeAttrs": [
    { "target": ["autogroup:member"], "attr": ["funnel"] },
  ],
  ```
  HTTPS certs must be enabled for the tailnet (they are if any `svc:` already
  serves HTTPS).
- **`gh` authenticated with the `Webhooks: Read and write` repo permission**
  (fine-grained PAT) or `admin:repo_hook` (classic). Webhook *creation* needs it;
  the daemon's runtime poller does not.
- **`python3 ≥ 3.11`** (the setup script uses `tomllib`).

## Steps

### 1. Per-repo HMAC secret

The daemon verifies `X-Hub-Signature-256` against a per-repo secret; the same
value is set on the GitHub webhook so GitHub signs deliveries with it.

```bash
mkdir -p ~/.config/crew
# generate + write WITHOUT echoing the secret
SECRET=$(openssl rand -hex 32)
printf '["Owner/repo"]\nsecret = "%s"\n' "$SECRET" > ~/.config/crew/github-webhook-secrets.toml
chmod 600 ~/.config/crew/github-webhook-secrets.toml
```

> **⚠️ Footgun:** this path is bind-mounted into the daemon. It **must exist as a
> file before `docker compose up`** — Docker silently creates a *directory* in its
> place if the file is missing, and the secrets loader then can't read it. If you
> find a directory there, `docker compose stop daemon`, `rmdir` it, write the file,
> then bring the daemon back up.

### 2. Bring up the daemon + Caddy proxy

The daemon's Octokit poller and the webhook delivery both need a token; the proxy
is gated behind the `webhook` compose profile.

```bash
export CREW_GITHUB_TOKEN=$(gh auth token)
docker compose --profile webhook up -d daemon dashboard webhook-proxy
```

Verify the allow-list boundary locally (Caddy on `:8081`):

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8081/api/webhooks/github -d '{}'  # daemon code (proxied)
curl -s -o /dev/null -w '%{http_code}\n' localhost:8081/api/agents                            # 404 (Caddy refused)
```

### 3. Funnel the dedicated port → Caddy

Run this **in a native Windows terminal** (Tailscale runs on Windows; the command
needs a real TTY — it hangs under a non-interactive / WSL-sandbox shell):

```
tailscale funnel --bg --https=8443 http://127.0.0.1:8081
```

It provisions a TLS cert (a few seconds, one-time) and reports
`https://<node>.<tailnet>.ts.net:8443/`. `--bg` persists it across reboots.
Confirm with `tailscale funnel status`.

### 4. Create the GitHub webhook

```bash
CREW_WEBHOOK_PAYLOAD_URL="https://<node>.<tailnet>.ts.net:8443/api/webhooks/github" \
  scripts/setup-github-webhook.sh Owner/repo
```

It reads the secret from the secrets file (never argv), creates a `pull_request`
webhook, and prints `hook_id=<id>`.

### 5. Pin the hook id + restart

```bash
# add to ~/.config/crew/projects/<project>.toml under [github]:
#   webhook_hook_id = "<id>"
docker compose restart daemon   # keeps the injected CREW_GITHUB_TOKEN
```

### 6. Verify

```bash
# GitHub fires a ping on creation; redeliver one cleanly and check it's 200:
gh api repos/Owner/repo/hooks/<id>/deliveries   # find the ping delivery id, then:
gh api -X POST repos/Owner/repo/hooks/<id>/deliveries/<delivery_id>/attempts
gh api repos/Owner/repo/hooks/<id>/deliveries --jq '.[0] | {event, status_code}'  # expect 200
```

Then the real test: merge a PR for an agent in `pr_open` and confirm it flips to
`pr_merged` within a second or two (not the 30-min poll).

## Gotchas seen in the field (CREW-303 live pass)

- **`ping` 504 right after creation** is usually benign — it lands while you're
  restarting the daemon (Step 5). Redeliver it; a stable daemon answers `200`.
- **GitHub delivers to the `:8443` port fine** — a non-443 port in the payload URL
  works (verified live).
- **Don't run `tailscale funnel` through the sandbox / WSL** — it blocks on its TTY.
  Native Windows terminal only.

## Teardown

```bash
tailscale funnel reset                         # stop exposing the port
gh api -X DELETE repos/Owner/repo/hooks/<id>   # remove the webhook
docker compose --profile webhook down          # stop the proxy + daemon
```
