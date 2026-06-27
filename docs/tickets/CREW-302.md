# CREW-302 — C-code: crew-owned Caddy webhook front door

Jira: https://safturento.atlassian.net/browse/CREW-302

Epic: CREW-300. Plan: `docs/superpowers/plans/2026-06-27-daemon-github-client-webhook-ingress.md` — **Task C1**.

## Goal

A crew-owned Caddy reverse proxy whose Caddyfile is the _entire_ public exposure boundary: it allow-lists exactly `POST /api/webhooks/github` → `daemon:7773` and 404s everything else, so the daemon's tailnet-only routes stay invisible even when the port is funnelled.

## Relevant files

- `packages/daemon/webhook-proxy/Caddyfile` (new) — the allow-list boundary; one `@webhook` matcher (method POST + path) → `reverse_proxy daemon:7773`, catch-all `respond 404`.
- `docker-compose.yml` (modify) — `webhook-proxy` service: `profiles: [webhook]` (opt-in, not part of `dev` bringup), `caddy:2-alpine`, publishes `${CREW_WEBHOOK_PROXY_PORT:-8081}:8081`, `depends_on` daemon healthy, `mem_limit: 128m` / `cpus: 0.25`.

## Decisions

- **`profiles: [webhook]`, not part of the default `dev` stack** — the front door is only needed where the funnel runs; opt-in keeps normal worktree bringup unchanged.
- **`reverse_proxy daemon:7773` (container port, not host)** — Caddy reaches the daemon over the compose network, so the proxy target is independent of per-worktree host-port hashing.
- **Allow-list is method + path** — a GET to the same path still 404s; only `POST /api/webhooks/github` is exposed.

## Verify (plan Task C1 Step 3)

Brought the profile up in this worktree's compose project and exercised the boundary from inside the daemon container (host curl is sandboxed → ECONNREFUSED; the daemon container has curl and shares the network):

- `POST /api/webhooks/github` via Caddy → **500** (daemon receiver), identical to hitting the daemon directly — proves the request was _proxied_, not Caddy-404'd. (The 500-vs-clean-401 is a pre-existing receiver gap, filed as a followup — out of scope here.)
- `POST /api/agents` via Caddy → **404** (Caddy refused; never proxied), while the daemon serves `/api/agents` directly with **200** — confirms the 404 is Caddy's, not the daemon's.
- `GET /api/webhooks/github` via Caddy → **404** (wrong method; not allow-listed).

## Notes

Branch cut from `origin/main`; the Epic's plan doc (PR #432) is not yet merged, so the plan was read from the PR branch for Task C1 detail. Deliverables match the ticket + plan verbatim.
