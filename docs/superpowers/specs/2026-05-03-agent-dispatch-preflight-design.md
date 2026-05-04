# Agent dispatch preflight — design

> **Purpose of this document.** A scoped design for a startup preflight that runs before every agent dispatch (`crew run` / `resume` / `fix-pr`) to catch sandbox / docker-stack misconfigurations that today silently waste agent-minutes and produce misleading PR claims. The driving incident is Recipes [PR #49 (KAN-17)](https://github.com/Safturento/Recipes/pull/49), where the agent shipped a PR with the e2e gate skipped and a confusing diagnosis ("Bruno succeeds against the same URL"); root cause was almost certainly that the docker stack wasn't actually up at the worktree app port, and the agent confused a green Bruno smoke (which only hits the daemon) for evidence the app was reachable.
>
> Read [`docs/plans/architecture.md`](../../plans/architecture.md) for system context, and [`docs/followups.md`](../../followups.md) §"Crew owns `.claude/settings.json` per worktree" for the surrounding scope this spec narrows from.
>
> **Scope boundary.** This spec is the **narrow unblocker** (Option A from the brainstorming). It deliberately stops short of the larger "crew owns `.claude/settings.json`" effort (Option B in the followup) — schema changes, generator, drift detection, migration of hand-authored files. Those remain in the followup as a separate Epic to plan later.

## 1. Background

### 1.1 The KAN-17 incident

Recipes KAN-17 (PR #49, 2026-05-03) was a small profile-page wiring change. Agent-side gates passed (`typecheck`, unit tests, `bruno:smoke`). The e2e gate did not — `npm run test:e2e` failed with `ECONNREFUSED` against `https://localhost:17253` (the worktree's docker-app port). The agent's PR body explained:

> chromium can't reach `https://localhost:17253` from this sandbox (Bash + Playwright both get `ECONNREFUSED`/`net::ERR_CONNECTION_REFUSED`, even though Bruno succeeds against the same URL from the same shell).

This claim is internally inconsistent: `npm run bruno:smoke` doesn't target the worktree app port — it targets the daemon's HTTP API at a separate host port. The agent saw a green Bruno run and concluded the docker app was up; it wasn't.

### 1.2 Why this matters

KAN-17's `.claude/settings.json` already had both `npm run bruno:smoke` and `npm run test:e2e` listed in `sandbox.excludedCommands` — the fix that landed in the previous incident (KAN-12, 2026-05-03). So the existing safeguard worked: the e2e command itself ran un-sandboxed in the host netns. The remaining failure was a **state mismatch** — the host stack wasn't reachable when the agent expected it to be — and the agent had no way to disambiguate "the sandbox blocked me" from "the stack isn't actually up."

Two separate failure modes are at play here:

1. **Sandbox misconfiguration** (KAN-12 shape) — `excludedCommands` doesn't list the smoke/e2e commands, so they run sandboxed and hit `ECONNREFUSED` because `bwrap --unshare-net` isolates the loopback. Already known; remediation already shipped manually per project.
2. **Stack-not-up at dispatch time** (KAN-17 shape) — `excludedCommands` is correct, but the docker stack didn't bring up successfully and the agent has no clean signal to detect that. The agent's only diagnostic tool from inside the sandbox (Bash `curl`) always returns `ECONNREFUSED` regardless of host state, so it can't distinguish a dead stack from a sandbox boundary.

Today both fail late and silently. The agent burns minutes flailing, ships a PR with the gate marked "could not run," and the user has to re-trigger after manually fixing the underlying state.

### 1.3 What's missing

- **Pre-dispatch reachability assurance.** No code path verifies the worktree app URL is actually serving HTTP before `claude` is launched.
- **Pre-dispatch sandbox-config assurance.** No code path verifies the project's committed `.claude/settings.json` contains the `excludedCommands` entries the agent will need.
- **Agent-side mental model for sandbox-vs-stack diagnosis.** The current run prompt mentions sandboxed-bruno-retry but doesn't generalize the lesson: any sandboxed network call to the app URL will always return `ECONNREFUSED`, so it can't be used as a stack-health signal.

## 2. Scope

### 2.1 In scope (this spec)

Three pre-dispatch checks, run by every agent-dispatching command (`crew run`, `crew resume`, `crew fix-pr`):

1. **App-URL reachability probe.** Un-sandboxed HTTP probe of `[playwright].app_url` and `[bruno_smoke].base_url` after docker bringup completes, before `claude` spawns.
2. **Sandbox `excludedCommands` verification.** Read `<repo>/.claude/settings.json`, assert it lists the smoke/e2e commands corresponding to the project's enabled TOML blocks.
3. **Generalized agent-prompt note** about sandboxed-vs-un-sandboxed network reachability and what each diagnostic signal actually means.

### 2.2 Out of scope (deferred to Option B Epic)

- TOML schema change to add `[sandbox].excluded_commands`.
- Crew-owned `.claude/settings.json` generator (tag-header pattern, refuse-to-clobber, derive entries from `[playwright]` / `[bruno_smoke]` / `[docker]`).
- Drift detection between TOML `[sandbox]` and committed `.claude/settings.json`.
- Migration path for projects with hand-authored `.claude/settings.json`.
- Per-project override of preflight timeouts / retry counts (only added if a real project is observed hitting the ceiling).

### 2.3 Adjacent followups (not consumed, not blocking)

- `docs/followups.md` "`crew run` swallows background-task failures into `/tmp` logs" — this preflight reaches into the docker bringup completion signal but doesn't fully solve the broader background-task surfacing problem. That stays its own Epic.
- `docs/followups.md` "`@playwright/mcp` ignores crew's `--executable-path` override" — orthogonal; affects the MCP browser tool, not the e2e runner this preflight protects.

## 3. Architecture

### 3.1 File layout

New directory `packages/cli/src/lib/preflight/`:

- `probe-app-urls.ts` — Check 1.
- `verify-excluded-commands.ts` — Check 2.
- `run-preflight.ts` — orchestrator. Exports a single `runPreflight(config, worktreePath)` that returns `{ ok: true } | { ok: false, errors: PreflightError[] }`.

Existing-file edits:

- `packages/cli/src/lib/prompts/ticket.ts` — Check 3 (prompt copy edit, ~line 74).
- `packages/cli/src/commands/run.ts`, `resume.ts`, `fix-pr.ts` — call `runPreflight` after env/docker bringup, before agent spawn. Likely the call gets bundled into the existing shared `prepareAgentEnvironment` (per CREW-62) so all three commands inherit it without each command coding it separately.

### 3.2 Dispatch integration

All three agent-dispatching commands share a startup path through `prepareAgentEnvironment` (introduced in CREW-62, used today by `run` / `resume` / `fix-pr`). The preflight hooks in there, in this order:

1. Resolve env (`.env`, `env.toml` substitution, etc.) — already exists.
2. Kick off docker bringup — already exists.
3. **Block on docker bringup completion** (`docker compose up --wait`-equivalent if the stack is configured). New requirement of this spec — see §3.4.
4. **Run preflight checks** (this spec). On any failure, return a structured error and abort dispatch.
5. Spawn `claude` — already exists.

### 3.3 Failure mode

Both Check 1 and Check 2 hard-abort dispatch with structured stderr output. No warn-and-continue, no auto-fix. Rationale:

- Dispatching against an unreachable stack wastes agent-minutes and produces misleading PR claims (KAN-17 demonstrated this).
- Dispatching against a sandbox missing `excludedCommands` produces the same waste, with a different misdiagnosis (KAN-12 demonstrated this).
- Auto-fix is out of scope here — the file is hand-authored today; touching it without the generator + tag-header pattern from Option B is unsafe.

### 3.4 Blocking on docker bringup

The preflight is meaningless if docker bringup hasn't completed — Check 1 would race the stack and false-fail. So the dispatch flow must `await` bringup before probing.

This is a UX shift from today (where bringup runs in the background and `crew run` proceeds to spawn `claude` immediately). Tradeoffs:

- **Cost.** ~30–60s added wall-clock to the happy path before the agent appears.
- **Benefit.** Zero agent-minutes wasted on dead stacks. Failures surface with clear diagnostics before the agent spawns.

Net: blocking is the right tradeoff. The line-73 followup ("`crew run` swallows background-task failures") had this on its options list; this spec makes the call explicit.

If `[docker]` isn't configured at all, blocking is a no-op (nothing to wait on) and Check 1 is skipped entirely.

## 4. Per-check details

### 4.1 Check 1 — App-URL reachability probe

**When it runs.** After docker bringup completes (§3.4). Per-URL skip rules:

- `[playwright].app_url` is probed when `[playwright]` is enabled AND `[docker]` is configured AND `[playwright].start_command` is **not** set. A non-empty `start_command` means the agent owns app lifecycle itself, so the URL isn't expected to be reachable at preflight time.
- `[bruno_smoke].base_url` is probed when `[bruno_smoke]` is enabled AND `[docker]` is configured.
- If neither URL qualifies, Check 1 is a no-op (the orchestrator skips it).

**URLs probed.** For each qualifying block: resolve via the existing `lib/playwright/resolve-app-url.ts` (env-var substitution applied). Probe each independently — both must succeed when both qualify.

**Probe mechanics.** Node-native `fetch` with a custom `Agent` configured for self-signed Caddy certs (`connect: { rejectUnauthorized: false }`). No shelling out to `curl`. Treat any HTTP response (incl. 4xx/5xx) as "reachable" — the goal is "is something serving on this port," not "is the app healthy." Only `ECONNREFUSED` / `ENOTFOUND` / timeout count as failure.

**Retry policy.** Exponential backoff, 5 attempts at 1s / 2s / 4s / 8s / 16s = 31s worst case. Happy path is one fast probe (1s); slow stacks get ~30s of warm-up slack. Conservative-by-design, mirroring the docker-daemon-check precedent that was bumped 3s → 15s for the same reason. A per-project override is out of scope unless a real project is observed hitting the ceiling.

**Failure surface.** Hard-abort with:

```
✗ preflight: app URL unreachable
   url:    https://localhost:17253 (from [playwright].app_url)
   tried:  5 attempts × exponential backoff, all ECONNREFUSED
   likely: docker compose stack failed to come up — check /tmp/crew-docker-<KEY>.log
   fix:    crew restart <KEY> --hard, or investigate the bringup log
```

### 4.2 Check 2 — Sandbox `excludedCommands` verification

**What it requires.** The committed `<repo>/.claude/settings.json` must contain the following entries in `sandbox.excludedCommands`:

- `npm run bruno:smoke` — when `[bruno_smoke].enabled` is true. Hard-coded; the schema doesn't make the command name configurable.
- The literal value of `[playwright].authored.test_command` — when `[playwright].authored.enabled` is true. Schema makes this required (no default), so the check reads it directly from config.

`[playwright].smoke` does **not** need a separate `excludedCommands` entry. It's a prompt-rendered verification the agent performs itself (`packages/cli/src/lib/prompts/ticket.ts:58`), not a separate command invocation — whatever browser-driving command the agent ends up running flows through Playwright's own runner, which is already covered by the agent's MCP / authored-test paths.

**Match semantics.** Exact string match against array entries. The Claude Code sandbox's actual matching behavior (prefix vs exact) is empirical-but-uncertain — for the *check*, we require an exact match of the configured command string, since that's what we know will work. If the user's `excludedCommands` uses a stricter prefix the agent's actual run will still succeed; we just don't trust looser prefixes for the verification. Code carries a one-line comment explaining the conservative-match rationale.

**File-missing handling.** If `<repo>/.claude/settings.json` doesn't exist at all, fail with the same shape but `path: <expected> (file not found)` and a hint pointing at the Option B Epic for context. Today the file is hand-authored; missing means the user hasn't set it up yet.

**Failure surface.** Hard-abort with:

```
✗ preflight: .claude/settings.json missing required excludedCommands
   missing: "npm run test:e2e" (required because [playwright].authored.enabled = true)
   path:    /home/safturento/Repos/Recipes/.claude/settings.json
   fix:     add the entry to sandbox.excludedCommands and commit
```

### 4.3 Check 3 — Generalized agent-prompt note

Edit `packages/cli/src/lib/prompts/ticket.ts` around line 74. Today's text is bruno-smoke-retry specific. Replace with a generalized note (templated values in angle brackets get substituted at prompt-build time the same way the existing prompt does):

> **Sandboxed-curl is misleading.** Your Bash tool runs in a sandbox with its own loopback, isolated from the host's. Direct `curl` / `wget` / Node `fetch` calls from your shell to `<app_url>` will always return `ECONNREFUSED` — that is **not** evidence the stack is down. Crew has whitelisted `npm run test:e2e` and `npm run bruno:smoke` to run un-sandboxed, and those are the only valid reachability tests for the docker stack.
>
> If `npm run bruno:smoke` succeeds, that confirms the daemon is up — but it says nothing about the worktree app port. If `npm run test:e2e` fails with `ECONNREFUSED`, that's a real signal: the docker stack is not serving at the expected port. Investigate `/tmp/crew-docker-<KEY>.log` and consider `crew restart <KEY> --hard`.

This addresses the diagnostic confusion KAN-17 demonstrated. The agent's PR body claim ("Bruno succeeds against the same URL") would have been impossible to write with this prompt active — the wording explicitly distinguishes daemon-reachable from app-port-reachable.

## 5. Tests

- **`probe-app-urls.test.ts`** — mock `fetch`. Assert: skips when no `[docker]`; retries on `ECONNREFUSED`; succeeds on any HTTP response (200, 404, 500); aborts after the configured retry budget; correctly resolves env-var substitution in URLs.
- **`verify-excluded-commands.test.ts`** — fs fixtures. Cases: file missing, file present without the required entry, file present with the entry, both bruno + playwright required and both present, both required and one missing, custom `[playwright].authored.test_command` value.
- **`run-preflight.test.ts`** — orchestrator. Cases: skips checks when corresponding TOML blocks aren't configured, returns first failure (doesn't run subsequent checks), returns clean on all-pass.
- **`ticket.test.ts`** (existing) — extend to assert the new prompt text appears with correct templating when `[playwright]` / `[bruno_smoke]` are configured.
- **Integration (manual / CREW-side smoke)** — run `crew run KAN-99` against a fixture project where docker bringup is intentionally broken (e.g., compose file with a port conflict), assert the dispatch hard-aborts with Check 1's error before `claude` spawns.

## 6. Open questions

None blocking. A few that surface for future work but don't gate this spec:

- **Should Check 1 ever fall back to "warn-and-continue" mode?** Could imagine a future flag like `--skip-preflight` for power users who want to dispatch against a stack they've manually verified. Out of scope here; can be added if friction emerges.
- **Sandbox match semantics — exact vs prefix.** The conservative-exact rule will produce false-positive failures (the user's excludedCommands has a working prefix that we reject). When this surfaces in practice, we either relax the match or invest in a better empirical model of the Claude Code sandbox's matching. Track in followups if it costs anyone real time.
- **Probe URL for projects with auth gates.** If `[playwright].app_url` resolves to a path that requires auth, the probe gets a 401/403 — which counts as "reachable" by this spec's design. Correct for our purposes (the stack is up), but worth flagging if a project ever surfaces a stack-up-but-app-broken state the probe can't catch.

## 7. Implementation references

- `packages/cli/src/lib/playwright/resolve-app-url.ts` — env-var substitution for app URLs.
- `packages/cli/src/lib/docker/start-bringup.ts` — current bringup launcher; the await-completion change in §3.4 lives near here.
- `packages/cli/src/lib/prompts/ticket.ts:74` — current sandboxed-bruno-retry text; replaced by Check 3.
- `packages/shared/src/config/schema.ts` — `[playwright]` / `[bruno_smoke]` / `[docker]` shapes the orchestrator reads to decide which checks to run.
- `b7c15b0` (recent commit) — establishes that env handling is already shared across run/resume/fix-pr; preflight follows the same shared-shape pattern.
