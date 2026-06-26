# Dispatch GitHub auth via MCP — multi-channel (MCP-or-token) with fail-fast

**Date:** 2026-06-26
**Status:** Design (brainstormed 2026-06-26) — Epic to be created
**Thread A of three.** This is the first, independent slice of a larger reshaping of crew's GitHub integration. The other two threads — **B** (replace crew's own host-side `gh` CLI calls with a daemon-owned Octokit client) and **C** (reframe the blocked CREW-271 webhook ingress around an outbound delivery channel) — are deliberately deferred to a second, combined brainstorm. A ships on its own and unblocks nothing downstream; B+C share a credential-source question this spec intentionally does **not** try to settle.

## Problem

A dispatched `crew run` agent authenticates to GitHub through a single channel: a per-repo Personal Access Token stored at `<repo>/.claude/secrets/gh-token`. `crew run` copies that file into the worktree and injects it as `GH_TOKEN` into the agent's `claude` process (`packages/cli/src/commands/run.ts:633`). The agent then uses it for `gh pr create` and any other GitHub API calls.

Two costs follow:

1. **A second, drifting copy of the credential.** The token in `.claude/secrets/gh-token` is a hand-maintained copy of the same PAT the operator already holds (the README literally seeds it with `gh auth token > .claude/secrets/gh-token`). Nothing keeps it in sync. A typo or a rotation silently breaks dispatch PR-creation while every other GitHub path keeps working — exactly the failure that motivated this work (a stale gh-token went unnoticed because crew's own `gh` calls use the host CLI's `hosts.yml`, not the secret).

2. **A single point of failure with no redundancy.** If that one token is missing, expired, or wrong, the agent cannot open a PR. There is no fallback path even when the operator has a perfectly good GitHub credential available through another channel (the GitHub MCP server, which a dispatched agent already inherits from user-level `~/.claude.json`).

A live test on 2026-06-26 confirmed the redundancy is *already latent*: with the gh-token deliberately broken, the agent's `gh pr create` failed `HTTP 401`, but the agent transparently opened the PR via `mcp__github__create_pull_request` (authenticated independently through the user-level MCP). The branch push was unaffected — `origin` is SSH (`git@github.com:…`), so `git push` rides the host SSH keys, never the token. Only the GitHub **API** call needs a credential.

The daemon's fast-path `running → pr_open` state flip did **not** fire on that MCP-opened PR, because the `pr_created` hook only recognises a `gh pr create` *command* (`hooks/state-events/pr-create-postuse.mjs`). State only reconciled later via the slow poller.

## Goal

Make a dispatched agent able to open a PR through **either** the GitHub MCP **or** the per-repo gh-token, preferring the MCP, with the daemon's fast state flip firing whichever path is used. Preserve crew's fail-fast guarantee: a run that has **no** GitHub credential at all must fail at pre-flight, before a worktree is created, with a clear message — not mid-run.

## Non-goals

- **Removing the gh-token entirely.** It is *demoted* from mandatory to optional fallback, not deleted. The `.claude/secrets/` slot and gitignore entry remain so dropping a token in stays frictionless.
- **Validating the MCP credential at pre-flight.** The MCP server runs inside the nested `claude` process; the CLI can presence-check that a GitHub MCP is *configured* in `~/.claude.json`, but cannot cheaply prove it is *authenticated* without standing up the server. End-to-end MCP-auth validation is out of scope — runtime + the existing poll/`pr_open` safety nets cover a configured-but-broken MCP.
- **Touching crew's own host-side `gh` calls** (`packages/cli/src/lib/github/client.ts`, `packages/daemon/src/services/github/fetch-pr-state.ts`). Those are Thread B.
- **`fix-pr` / resume.** That path already never injected `GH_TOKEN` (it authenticates via host `gh` auth) and is unaffected by the secret. Steering its GitHub interactions to the MCP for consistency is an optional follow-up, not part of this Epic.
- **Changing the agent's git push.** Push is SSH-based and credential-independent already.

## Design

> **Project-specific:** all code lands in `packages/cli/` — the dispatch command (`src/commands/run.ts`), the run-path preconditions (`src/lib/run/`), the prompt templates (`src/lib/prompts/templates/`), the init scaffold (`src/lib/init/`), the health registry (`src/lib/health/`), and the state-event hook + its injector (`hooks/state-events/`, `src/lib/run/state-event-hook-injection.ts`).

### Credential model — multi-channel OR

A dispatch is "GitHub-authorized" when **at least one** channel is configured:

- **Channel 1 — per-repo token:** `<repo>/.claude/secrets/gh-token` present and non-empty.
- **Channel 2 — user-level MCP:** `~/.claude.json` contains a GitHub MCP server entry.

Both can be configured at once, in which case the agent gets both capabilities and prefers the MCP. Resolution table:

| gh-token | user MCP | Dispatch result |
|---|---|---|
| ✓ | ✓ | Agent gets **both**; prompt prefers MCP, `gh` works if MCP fails |
| ✗ | ✓ | MCP only |
| ✓ | ✗ | `gh` only (token injected as `GH_TOKEN`) |
| ✗ | ✗ | **Fail fast** at pre-flight (before worktree) |

### Pre-flight gate — `requireGithubAuth`

`requireGhToken` (`src/lib/run/preconditions.ts`) is replaced by `requireGithubAuth({ repoPath })`:

```
requireGithubAuth({ repoPath }):
  hasToken = exists(repoPath/.claude/secrets/gh-token) && size > 0
  hasMcp   = userMcpHasGithubServer(~/.claude.json)   // presence check, parse-and-look
  if (hasToken || hasMcp): return
  throw "no GitHub credential configured for dispatch. Configure one of:
         • a GitHub MCP server in ~/.claude.json (preferred), or
         • a PAT at <repo>/.claude/secrets/gh-token (chmod 600)."
```

`userMcpHasGithubServer` reads `~/.claude.json`, tolerates a missing/unparseable file (→ `false`), and checks for an MCP server whose entry targets GitHub (matched defensively — server key containing `github`, or URL host under `githubcopilot.com` / `github`). The exact match predicate is settled in the plan against the real config shape; presence, not validity.

> **Optional liveness (plan-time call):** when the token is the *only* configured channel, the gate may additionally validate it cheaply (`gh api user` with that token) so a present-but-broken sole credential still fails fast. Recommended but not load-bearing; the MCP channel can't be symmetrically validated, so this stays a token-only nicety.

The gate runs in `run.ts` where `requireGhToken` is called today (around `run.ts:247`), before worktree creation.

### Conditional `GH_TOKEN` injection

The copy-into-worktree (`run.ts:333-335`), the read (`run.ts:565`), and the env injection (`run.ts:633`) become **conditional on the token existing**:

- Token present → copy into worktree (chmod 600), read, inject `GH_TOKEN` into the agent env (unchanged behavior).
- Token absent → skip all three; the agent runs with no `GH_TOKEN` and uses the MCP.

The agent thus always has the MCP (ambient, when configured) and *additionally* has `gh` working when a token is present.

### Steering the agent to the MCP

The dispatch prompt instructs PR creation at `src/lib/prompts/templates/ticket.md:44`:

```
gh pr create --base main --head {{key}} --title "<title>" --body "<Summary + Test Plan>"
```

This becomes an instruction to open the PR via the GitHub MCP (`mcp__github__create_pull_request`, with the same base/head/title/body), noting `gh pr create` as the fallback if the MCP is unavailable. The `builders.test.ts` prompt snapshots are regenerated. (`resume.md` / `fix-pr.md` are not in scope — see Non-goals.)

### Dual-path detection hook

`hooks/state-events/pr-create-postuse.mjs` gains a second recognized shape, keeping the first:

- **Branch 1 (existing):** `tool_name === 'Bash'` + command matches `\bgh pr create\b` + a PR URL appears in `tool_response.stdout`. Unchanged — the fallback channel's detector.
- **Branch 2 (new):** `tool_name === 'mcp__github__create_pull_request'` + a PR URL extracted from the structured `tool_response` (`html_url`). The MCP-channel detector.

Both branches emit the identical `pr_created` event (`source: 'hook-pr-create'`, `prUrl`) to `~/.crew/state-events/<key>.jsonl`. The MCP `tool_response` shape is **verified empirically during implementation** (mirroring how CREW-261 pinned the Bash payload), since the hook keys success off the parsed URL and must read the right field.

The injector `src/lib/run/state-event-hook-injection.ts` registers the PostToolUse hook against matcher `Bash` today; it broadens to fire on the MCP tool too (matcher `Bash|mcp__github__create_pull_request`, or a second hook entry — settled in the plan). Idempotency is already handled downstream: a second `pr_created` while the agent is already `pr_open` is a no-op in `reduceState`, so the (impossible-in-practice) both-paths-fire case is safe.

### Health check — `github-auth-present`

`gh-token-present` (`src/lib/health/checks/gh-token-present.ts`, registered in `src/lib/health/registry.ts`) is replaced by `github-auth-present`, applying the same OR logic as the gate: `ok` when either channel is configured; `fail` (soft, surfaced by `crew doctor`) when neither. Its `fix()` no longer force-scaffolds a token; it points the operator at both setup options.

### Scaffold softening

`scaffoldGhToken` (`src/lib/init/scaffold-gh-token.ts`, called from `run-init.ts`) keeps creating the `.claude/secrets/` gitignore entry and the `0600` placeholder so a token can be dropped in frictionlessly — but the empty placeholder **no longer represents a blocking requirement**. The `crew init` message shifts from "paste a PAT here — dispatch can't authorize without it" to "configure a GitHub MCP server (preferred), **or** paste a PAT here." The placeholder's emptiness is no longer load-bearing for any gate (the gate now ORs in the MCP channel).

## Error handling

- **No credential at all** → `requireGithubAuth` throws at pre-flight; `run.ts` renders it as a `crew_startup_preflight` failure (same path as the current `requireGhToken` failure), no worktree created.
- **Token present but broken, MCP absent** → agent's `gh pr create` fails mid-run; surfaces as the agent erroring. (Optionally pre-empted by the token-liveness nicety above.)
- **MCP present but broken, token absent** → agent's MCP call fails mid-run. Not catchable at pre-flight by design (Non-goals).
- **Both present, MCP broken** → agent falls back to `gh pr create`; Bash branch of the hook flips state. The broken MCP goes unnoticed — acceptable, since the token is the explicit fallback and the MCP the preferred-but-redundant primary.
- **Hook can't read the MCP response field** → no `pr_created` emitted; state reconciles via the existing poll backstop (same failure mode as a missed Bash detection today). The empirical field-check in implementation guards against shipping this silently.

## Testing

- **`requireGithubAuth`** — token-only → pass; MCP-only → pass; both → pass; neither → throw with the dual-option message. `userMcpHasGithubServer` against present / absent / malformed `~/.claude.json`.
- **`run.ts` injection** — token present → worktree copy + `GH_TOKEN` set; token absent → no copy, no `GH_TOKEN`, run proceeds.
- **Hook** — MCP payload with `html_url` → `pr_created` emitted; MCP payload without a URL → no-op; existing Bash-branch tests unchanged. (`hooks/state-events/pr-create-postuse.test.mjs`, `npm run test:hooks`.)
- **Hook injection** — emitted `settings.local.json` matcher fires on both `Bash` and `mcp__github__create_pull_request`.
- **`github-auth-present` health check** — ok on either channel; fail on neither; `fix()` messaging.
- **Init** — scaffold still writes the gitignore + placeholder; empty placeholder no longer reported as blocking.
- **Prompt snapshots** — `builders.test.ts` regenerated for the MCP-first PR instruction.
- **Bruno** — N/A (no HTTP route change).

## Scope (one Epic)

| Logical grouping | Covers |
|---|---|
| **A. Gate + injection** | `requireGithubAuth` (+ `userMcpHasGithubServer`), conditional `GH_TOKEN` copy/read/inject in `run.ts`, optional token-liveness nicety; tests. |
| **B. Prompt + hook** | MCP-first PR instruction in `ticket.md` + snapshot refresh; dual-path `pr-create-postuse.mjs`; broadened hook-injection matcher; tests + empirical MCP-response field check. |
| **C. Health + init + docs** | `github-auth-present` health check (replaces `gh-token-present`); scaffold/init message softening; README "GitHub token" → "GitHub MCP (or token)" section; `.agents/dispatch.md` steps 4 / 11 / 61 / 123 / 131. |

**Follow-up (separate, post-Epic):** steer `fix-pr` / resume GitHub interactions to the MCP for channel consistency.

## Open questions

- **MCP-server match predicate in `~/.claude.json`** — exact key/URL shape to recognise a "GitHub MCP" entry; settled in the plan against the real config. Defensive (presence, not validity) either way.
- **`mcp__github__create_pull_request` response field** — confirm `html_url` (vs nested) carries the PR URL in the PostToolUse `tool_response`; verified empirically in grouping B.
- **Hook injection: one broadened matcher vs. two entries** — cosmetic; settled in the plan.
- **Token-liveness nicety** — include the `gh api user` check for token-only dispatches, or leave the gate presence-only? Recommended to include; not load-bearing.
