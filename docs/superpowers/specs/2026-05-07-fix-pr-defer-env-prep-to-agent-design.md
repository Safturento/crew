# `crew fix-pr` — defer env prep to the dispatched agent

> **Purpose.** Eliminate the residual dead-zone where `crew fix-pr` cannot bring up the docker stack against a worktree whose source is too stale to boot, blocking the agent that was supposed to fix it. Extends the design intent of [CREW-110](https://safturento.atlassian.net/browse/CREW-110), which moved the _rebase_ into the agent but left the rest of `prepareAgentEnvironment` (docker bringup, playwright install, preflight) blocking pre-spawn — same wedge, different cause.
>
> Read [`docs/plans/architecture.md`](../../plans/architecture.md) for system context, the [CREW-110 commit message](https://github.com/Safturento/crew/commit/2c5bd59) for the prior iteration, and [`packages/cli/src/lib/prompts/templates/rebase-preamble.md`](../../../packages/cli/src/lib/prompts/templates/rebase-preamble.md) for the current Step-0 contract this spec extends.
>
> **Scope boundary.** Only `crew fix-pr` (resume mode). `crew run` (fresh mode) already brings docker up in the background and spawns the agent immediately — it doesn't have this dead-zone, and is not modified.

## 1. Background

### 1.1 The reproduction

A user invoked `crew fix-pr CREW-111 -m "can you resolve the merge conflicts"` against a CREW-111 worktree several commits behind `main`. The wrapper failed with:

```
→ ensuring docker stack is running…
Error: docker stack failed to come up (rc=1). Log: /tmp/crew-docker-CREW-111.log
    at prepareAgentEnvironment (packages/cli/src/lib/run/agent-environment.ts:75:13)
```

The docker log showed `crew-crew-111-daemon-1 Error dependency daemon failed to start` — the worktree's daemon source was stale relative to `main` and could not boot in its current state. The agent never spawned, so it never got to do Step 0 (rebase + resolve conflicts), so the source was never made bootable.

### 1.2 What CREW-110 actually fixed

CREW-110's commit message claims it eliminated "the dead-zone where a wrapper-side rebase hit conflicts, broke the daemon's source mid-bringup, and stranded the worktree with no agent on hand to resolve." That's true for _one_ class of stranding: the wrapper used to rebase pre-spawn, which could break source mid-bringup.

What it missed: the wrapper still calls `prepareAgentEnvironment` _before_ spawning the agent (`packages/cli/src/commands/fix-pr.ts:198`). That function blocks on `ensureStackRunning` (`packages/cli/src/lib/run/agent-environment.ts:71-78`). If the worktree was _already_ stale enough that the un-rebased source can't boot the daemon, the same stranding happens — different cause, same effect.

### 1.3 Why this is a recurring class of bug

`prepareAgentEnvironment` runs four worktree-state-dependent operations pre-spawn:

| Operation                            | Why it can fail on a stale worktree              | File                                                         |
| ------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------ |
| `ensureStackRunning`                 | Compose file or daemon source diverged from main | `packages/cli/src/lib/docker/ensure-stack-running.ts`        |
| `installPlaywrightBrowsers`          | `package.json` deps differ from main             | `packages/cli/src/lib/playwright/install.ts`                 |
| `probe-app-urls` preflight           | Depends on docker being up                       | `packages/cli/src/lib/preflight/probe-app-urls.ts`           |
| `verify-excluded-commands` preflight | `.claude/settings.json` may be stale             | `packages/cli/src/lib/preflight/verify-excluded-commands.ts` |

All four are symptoms of "the worktree is behind main." All four would succeed after a rebase. Running them pre-spawn means _any_ of them can wedge the wrapper before the agent rebases. CREW-110 fixed the rebase ordering; this spec finishes the job for the rest of `prepareAgentEnvironment`.

## 2. Scope

### 2.1 In scope

- `crew fix-pr` (resume mode) drops blocking docker bringup + playwright install pre-spawn.
- `probe-app-urls` preflight is removed from resume mode (redundant — `docker compose up --wait` already proves URL reachability when it succeeds).
- `verify-excluded-commands` preflight stays pre-spawn but becomes **non-fatal** in resume mode: it warns and continues. Rationale: the agent likely cannot write `.claude/settings.json` autonomously (Claude Code's hardcoded sensitive-file check), so this responsibility stays wrapper-side; but a stale settings.json should not block the rebase that would fix it.
- The agent's prompt gains a new **Step 0.5: bring up environment** section after the existing Step 0 (rebase) and before feedback work. Step 0.5 runs:
  - `docker compose up --build --wait` (always — was previously only the post-conflict recovery hatch in `rebase-preamble.md:22-26`)
  - `npx playwright install chromium` (when playwright is enabled for the project)

### 2.2 Out of scope

- `crew run` (fresh mode). It already does background docker bringup, so the agent spawns immediately. Not affected by this dead-zone.
- TOML schema or settings.json ownership changes. The "Crew owns `.claude/settings.json` per worktree" Epic in `docs/followups.md` may eventually let `verify-excluded-commands` move into the agent (or be obviated entirely). Not in this spec.
- Removing `prepareAgentEnvironment` itself or restructuring `agent-environment.ts`. Fresh mode keeps using it; we just don't call it from the resume path.

## 3. Design

### 3.1 Wrapper changes (`packages/cli/src/commands/fix-pr.ts`)

Replace the `prepareAgentEnvironment(...)` call (lines 196-214) with:

1. Compute `resolvedAppUrl` directly via `resolveAppUrl(config.playwright.app_url, dockerPorts, envVars).raw` when playwright is enabled. (Pure string computation — no service interaction.)
2. Run a slimmed preflight that includes **only `verify-excluded-commands`**, in **non-fatal** mode: catch `PreflightError`, render with a "warning, continuing" prefix, and proceed. The agent's rebase will pick up any stale settings.json automatically.
3. Spawn the agent.

`dockerPorts` and `envVars` are still read from disk (`.env`, `env.toml` materialization). These are pure file reads; they don't depend on services running.

### 3.2 Agent prompt changes

Two template files change:

**`packages/cli/src/lib/prompts/templates/rebase-preamble.md`**

The current "recovery" paragraph (lines 22-28) becomes a first-class **Step 0.5**, unconditional rather than conditional-on-wedge. Approximate shape:

```markdown
## Step 0.5: bring up the environment (do this AFTER Step 0 succeeds)

Now that the source is current, bring up the docker stack and any browser dependencies:

    docker compose up --build --wait
    {{#if playwrightEnabled}}npx playwright install chromium{{/if}}

If `docker compose up` fails for environmental reasons (host docker daemon down, port collision with another stack, missing CLI tools, etc.) — i.e., a failure that rebasing would not have fixed — abort with a clear message: document the blocker in `docs/tickets/{{key}}.md` "Open questions" and exit WITHOUT applying the review feedback. Do not push.

**Do not reset the worktree or use any "hard" reset command** — those wipe in-progress work.
```

The variable `{{playwrightEnabled}}` flows from the prompt builder, derived from `config.playwright != null`.

**`packages/cli/src/lib/prompts/templates/fix-pr.md`**

No structural change — still includes `{{rebasePreamble}}` at the top. The new Step 0.5 is part of the preamble.

### 3.3 Builder changes

`buildRebasePreamble` gains a `playwrightEnabled` boolean option, propagated through `buildFixPrPrompt`. Default `false` (back-compat for any other callers).

### 3.4 Where each preflight responsibility lands

| Concern                   | Today                    | After this change                                                    |
| ------------------------- | ------------------------ | -------------------------------------------------------------------- |
| Docker bringup            | Wrapper, blocking, fatal | Agent (Step 0.5)                                                     |
| Playwright install        | Wrapper, blocking, fatal | Agent (Step 0.5)                                                     |
| URL probe                 | Wrapper preflight, fatal | Dropped (redundant — `docker compose up --wait` proves reachability) |
| `excludedCommands` verify | Wrapper preflight, fatal | Wrapper preflight, **non-fatal warn**                                |

## 4. Failure-mode analysis

The user's review concern: _will the agent be able to recover from every state the wrapper currently catches, or are we losing safety?_ Walked through case-by-case:

- **Worktree stale → docker fails** (the reproduction). Today: wrapper wedges, user blocked. After: agent rebases, runs `docker compose up`, succeeds.
- **Worktree stale → playwright install fails** (e.g., `package.json` differs). Today: wrapper wedges. After: agent rebases first, then install picks up current deps.
- **Worktree stale → `.claude/settings.json` missing required entry**. Today: wrapper wedges with a `PreflightError`. After: wrapper warns and continues; rebase pulls in the current settings.json; agent's eventual `npm run bruno:smoke` / `npm run test:e2e` succeeds.
- **Host docker daemon down**. Today: wrapper wedges with a `docker compose` rc. After: agent's Step 0.5 fails with the same rc; agent aborts and documents per Step 0.5's instructions. **Same human action required either way** — restart docker.
- **Port collision with another stack**. Today: wrapper wedges. After: agent's Step 0.5 fails; agent aborts and documents. **Same human action either way.** (Worth a separate followup: port-allocator should detect collisions at port-assignment time, not at compose-up time. Not in this spec.)
- **Settings.json genuinely missing on a project that needs it** (not a stale-worktree issue). Today: wrapper hard-fails with a clear message. After: wrapper warns; agent's `npm run bruno:smoke` fails inside sandbox with a less-clear error. **Mild regression** in error clarity for this case. Acceptable because (a) it only happens for net-new project setup, and (b) the warning message points at the underlying check.

Net: failure modes that were genuinely irrecoverable still require human action; failure modes that the agent _could_ fix by rebasing now actually get fixed.

## 5. Testing

### 5.1 Unit / integration

- **Wrapper test**: `fix-pr` with a project config that has docker + playwright + bruno_smoke enabled spawns claude without calling `ensureStackRunning` or `installPlaywrightBrowsers`. Mock the spawn and assert.
- **Wrapper test**: `verify-excluded-commands` failure produces a warning to stderr but does not throw / exit; spawn still happens.
- **Prompt builder test**: `buildRebasePreamble({ playwrightEnabled: true })` includes `npx playwright install chromium`; `({ playwrightEnabled: false })` does not.
- **Prompt builder test**: Step 0.5 always includes `docker compose up --build --wait` in any project that reaches `buildFixPrPrompt` (Step 0.5 is unconditional on docker — it's idempotent if the stack is already running, and crew projects all have docker today).

### 5.2 End-to-end (manual)

Reproduce the original wedge: rebase the canonical `main` ahead of CREW-111's branch tip such that the daemon source on CREW-111 cannot boot, then run `crew fix-pr CREW-111 -m "..."`. Expect: wrapper does not wedge, agent rebases, agent runs `docker compose up --build --wait` successfully, agent applies feedback, agent prints the inspection footer.

### 5.3 No regression for clean case

Run `crew fix-pr` against a worktree that's already up-to-date with `main`. Expect: agent's Step 0 is a silent no-op, Step 0.5 runs `docker compose up --wait` (idempotent — fast no-op when stack is already up), feedback work proceeds normally.

## 6. Open questions

None blocking. The settings.json ownership question is tracked separately in `docs/followups.md`.

## 7. Links and followups

- CREW-110: rebase moved into agent ([commit 2c5bd59](https://github.com/Safturento/crew/commit/2c5bd59)).
- No existing entry in `docs/followups.md` names this dead-zone; ticket creation does not need a "move to Resolved" criterion against an existing followup.
- New followup to be added separately: port-allocator should detect collisions at port-assignment time (today they only surface at `docker compose up` time). Surfaced during this spec's failure-mode walkthrough; out of scope here.
