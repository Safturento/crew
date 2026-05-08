# Sandbox limitations doc + `docker compose` exclusion — design

> **Purpose.** Hotfix for a bug introduced by [CREW-113](https://safturento.atlassian.net/browse/CREW-113): the dispatched agent runs inside Claude Code's sandbox and cannot access `/var/run/docker.sock`, so the new Step 0.5 `docker compose up --build --wait` fails on every project. Fix by excluding `docker compose` from the sandbox the same way `npm run bruno:smoke` and `npm run test:e2e` already are. Pair the fix with a new `docs/plans/sandbox-limitations.md` reference doc that catalogs known sandbox restrictions and their workarounds, so the next time we design an agent prompt we don't relitigate which calls survive the sandbox.
>
> Read [CREW-113](https://safturento.atlassian.net/browse/CREW-113) for the bug's lineage, [`packages/cli/src/lib/preflight/verify-excluded-commands.ts`](../../../packages/cli/src/lib/preflight/verify-excluded-commands.ts) for the existing enforcement pattern, and [`packages/cli/src/lib/prompts/templates/sandbox-network-note.md`](../../../packages/cli/src/lib/prompts/templates/sandbox-network-note.md) for the agent-side prompt that already partially documents the sandbox model.
>
> **Scope boundary.** This spec covers the crew-side fix only. Recipes' `.claude/settings.json` needs the same entry; that's tracked as a paired direct-PR (no KAN ticket — trivial config tweak per user-level CLAUDE.md "When to skip planning").

## 1. Background

### 1.1 The bug

[CREW-113](https://safturento.atlassian.net/browse/CREW-113) shipped 2026-05-07. It deferred docker bringup from the `crew fix-pr` wrapper into the dispatched agent's Step 0.5 (`packages/cli/src/lib/prompts/templates/rebase-preamble.md:22-32`). On the first user-driven test post-merge the agent rebased successfully (Step 0), then aborted Step 0.5 with:

> Docker bring-up is blocked by sandbox permissions on `/var/run/docker.sock` — same environmental limitation as the prior…

The agent followed the new preamble's instructions (abort + document for environmental failures), but the failure is universal — every project will hit it because every dispatched agent runs in the sandbox. The wrapper used to do docker bringup un-sandboxed (the wrapper isn't sandboxed); CREW-113's design missed that the agent inherits sandbox restrictions.

### 1.2 Why excludedCommands is the right shape

`<repo>/.claude/settings.json:5-8` already lists `npm run bruno:smoke` and `npm run test:e2e` as `excludedCommands`. These run un-sandboxed on the host so they can hit the worktree's loopback ports — without exclusion, `bwrap --unshare-net` isolates the loopback and they'd return `ECONNREFUSED`. Same root cause as the docker socket issue: the sandbox blocks a host resource the agent legitimately needs.

The fix is mechanical: extend the same exclusion mechanism to cover `docker compose`. The runtime accepts prefix-style entries (per `verify-excluded-commands.ts:62-66`'s comment), so a single `"docker compose"` entry covers `up`, `down`, `logs`, `ps`, etc.

### 1.3 Why the doc

We've now hit two distinct sandbox restrictions during agent design (host loopback in KAN-12/17, docker socket in CREW-113-followup). Each was discovered by an agent failing mid-run; each fix was the same shape (`excludedCommands` entry); each took mid-task brainstorming time to re-derive the model. A reference doc collapses that recurring cost: future agent-prompt designs check the doc, decide whether the new operation needs an exclusion entry, and either add one or design around the limitation.

The doc also captures **hard limits** — restrictions Claude Code enforces regardless of `settings.json`. Today we know of one (writes to `~/.claude/**` blocked by hardcoded sensitive-file check, mentioned in user-level `CLAUDE.md`). Naming these explicitly prevents future plans from proposing workarounds that won't work.

## 2. Scope

### 2.1 In scope

1. **Add `"docker compose"` to crew's `.claude/settings.json` `excludedCommands`.**
2. **Extend `verify-excluded-commands.ts`** to require `"docker compose"` when `config.docker` is present in the project TOML. Becomes the third clause in `requiredEntries(config)` (`verify-excluded-commands.ts:13-28`).
3. **New file `docs/plans/sandbox-limitations.md`** — structured reference doc with two sections (workaround-able restrictions table, hard limits list).
4. **Cross-link** from `docs/plans/architecture.md` (a one-line pointer in the relevant section) and from a JSDoc comment on `requiredEntries(config)` (so a contributor editing the check finds the doc).
5. **Brief update to existing rebase-preamble.md** (optional): add a one-line note after the Step 0.5 code fence linking to the limitations doc, e.g. "If the project's `.claude/settings.json` is missing the entry, the agent will see permission errors — see `docs/plans/sandbox-limitations.md` for the full list of restricted operations." Keeps the agent's path-to-recovery short when the doc says "this needs an excludedCommands entry."

### 2.2 Out of scope

- **Recipes' `.claude/settings.json` update.** Different repo. Tracked as a paired direct-PR opened from the same branch session. No KAN ticket — single config-line change qualifies for the user-level CLAUDE.md "trivial fixes" exception.
- **Other crew-managed projects.** None today besides Recipes; future projects will pick up the entry via the `verify-excluded-commands` check at first dispatch.
- **Generalizing the limitations doc to Confluence / external docs.** Stays in-repo, versioned with the code that depends on it.
- **Auditing whether existing `excludedCommands` entries are still needed.** Out of scope; if a future cleanup wants to prune unused entries, that's a separate followup.
- **Per-project override of which `docker` subcommands are excluded.** YAGNI — `"docker compose"` as a prefix covers everything we currently use. If a project ever wants to *forbid* a specific subcommand, that's a different design problem.

## 3. Design

### 3.1 Code change

**File: `<repo>/.claude/settings.json`**

Current `excludedCommands`:

```json
"excludedCommands": [
  "npm run bruno:smoke",
  "npm run test:e2e"
]
```

After:

```json
"excludedCommands": [
  "npm run bruno:smoke",
  "npm run test:e2e",
  "docker compose"
]
```

**File: `packages/cli/src/lib/preflight/verify-excluded-commands.ts`**

Current `requiredEntries(config)` (lines 13-28) returns entries based on `bruno_smoke.enabled` and `playwright.authored.enabled`. Extend to a third clause:

```ts
function requiredEntries(config: ProjectConfig): RequiredEntry[] {
  const out: RequiredEntry[] = [];

  if (config.bruno_smoke?.enabled) {
    out.push({ command: BRUNO_COMMAND, reason: '[bruno_smoke].enabled = true' });
  }

  if (config.playwright?.authored?.enabled) {
    out.push({
      command: config.playwright.authored.test_command,
      reason: '[playwright].authored.enabled = true',
    });
  }

  if (config.docker) {
    out.push({
      command: 'docker compose',
      reason: '[docker] block present (agent does Step 0.5 bringup)',
    });
  }

  return out;
}
```

The `verifyExcludedCommandsCheck`'s string-match logic at line 67-70 (exact-match against the committed list) works as-is — `"docker compose"` in the committed list will match `"docker compose"` in the required list.

**JSDoc cross-link:** add to `requiredEntries`:

```ts
/**
 * Compute the excludedCommands the agent's project needs in its
 * <repo>/.claude/settings.json. Each entry corresponds to a sandbox
 * restriction documented in docs/plans/sandbox-limitations.md.
 */
function requiredEntries(config: ProjectConfig): RequiredEntry[] {
```

### 3.2 Doc structure

**File: `docs/plans/sandbox-limitations.md`**

Two top-level sections + a short header. Approximate shape:

```markdown
# Sandbox limitations

When crew dispatches an agent, the agent runs inside Claude Code's sandbox
(bubblewrap-style; see `~/.claude/CLAUDE.md` for the host-level model). The
sandbox blocks operations that would otherwise let an agent affect the host
beyond its worktree. This doc catalogs the limitations we've hit so the next
agent-prompt design doesn't relitigate them.

## Workaround-able

These restrictions can be loosened per-project via `<repo>/.claude/settings.json`.
Each row names the operation that fails sandboxed, the setting that loosens it,
and the entry shape.

| Operation | Setting | Entry | Why required |
| --- | --- | --- | --- |
| Host loopback HTTP from `npm run bruno:smoke` | `excludedCommands` | `"npm run bruno:smoke"` | bruno hits worktree app port; sandboxed `bwrap --unshare-net` isolates loopback |
| Host loopback HTTP from `npm run test:e2e` | `excludedCommands` | `"npm run test:e2e"` | playwright e2e hits worktree app port; same isolation issue |
| Docker socket (`/var/run/docker.sock`) | `excludedCommands` | `"docker compose"` (prefix) | agent's Step 0.5 brings up the stack; sandbox blocks the socket |
| Anthropic / GitHub / Atlassian / npm registry HTTPS | `network.allowedDomains` | hostname | sandboxed agents need these for their own tooling |
| Writes under `~/.npm`, `~/.cache`, `/tmp` | `filesystem.allowWrite` | path | npm install + Claude Code internals write here |

## Hard limits

These are enforced by Claude Code's hardcoded checks regardless of
`settings.json`. They cannot be loosened per-project; if the agent needs the
operation, the design has to route around it (typically by having the
un-sandboxed wrapper do the work and pass the result through).

- **Writes to `~/.claude/**`.** Blocked even with `--dangerously-skip-permissions`. User-level skill / global CLAUDE.md edits / global settings.json tweaks must be authored manually, not via `crew run`. (Source: user-level `CLAUDE.md` "Don't ticket — handle manually" section.)
- **Writes to in-worktree `.claude/settings.json`.** Same protection extends to repo-level `.claude/` per the same hardcoded list. The wrapper-side `verify-excluded-commands` check is wrapper-side because the agent likely cannot fix a missing entry from inside its own session.

## When you're designing a new agent prompt

If the prompt asks the agent to run a host-level operation:

1. Check the workaround-able table — is there already an entry for this class of operation? If yes, ensure the project has it (the `verify-excluded-commands` preflight should require it).
2. If no entry exists, add one to the table. Then add the corresponding clause to `verify-excluded-commands.ts:requiredEntries(config)`.
3. If the operation is in the hard-limits list, the agent **cannot** do it. Route the operation through the wrapper instead.
4. If the operation is none of the above and the agent is hitting permission errors — first run, document it here, *then* design the fix.

## When you discover a new restriction

The signal is usually "agent reports an environmental error mid-run and the
operation worked fine when the wrapper used to do it." Add a row to the table
in the same PR that fixes the symptom. The doc is the durable artifact; the
fix is incidental.
```

(The actual doc body in the implementation will be slightly more detailed; this is the structural intent.)

### 3.3 Cross-link from `docs/plans/architecture.md`

Add a single sentence in the existing "sandbox / dispatch" section (or wherever the architecture doc discusses agent dispatch — implementation will scan and place appropriately). Sentence:

> Sandbox restrictions and their workarounds are catalogued in [`sandbox-limitations.md`](./sandbox-limitations.md). When an agent prompt asks the agent to run a host-level operation, that doc is the place to start.

### 3.4 Recipes coordination

Recipes' `.claude/settings.json` needs the same `"docker compose"` entry. Approach: open a direct PR against Recipes' main branch from a `crew-update-excluded-commands` feature branch. Single-line config change. PR body: short summary + reference to CREW-114 + reference to the new sandbox-limitations doc.

This PR can land before or after CREW-114 — the entry is inert until the verify-excluded-commands check enforces it. Landing it before the crew change avoids the brief window where Recipes dispatches would fail the preflight check.

## 4. Failure modes / edge cases

- **Project with `[docker]` block but no committed `"docker compose"` entry.** New behavior: `verify-excluded-commands` fails the wrapper preflight with the same error shape it currently uses for missing bruno/playwright entries. User adds the entry, commits, re-runs.
- **Project without `[docker]` block.** No change — the new clause is gated on `config.docker`. Such a project's agent doesn't run docker compose anyway.
- **`.claude/settings.json` has `"docker compose up --build --wait"` (full-string) instead of `"docker compose"` (prefix).** Runtime: works (the matched entry is a strict prefix of the runtime-checked invocation). Wrapper preflight: fails the exact-match check at `verify-excluded-commands.ts:67-70`. Acceptable: the spec's recommendation is the prefix entry; if a user committed the full string they get a clear preflight error pointing at the canonical form.
- **`docker compose down` / `docker compose logs`.** Both covered by the `"docker compose"` prefix entry. No additional changes needed.
- **`docker` (no compose subcommand)** — e.g., a future agent prompt that runs `docker exec`. Not covered by the `"docker compose"` prefix. If/when a prompt needs this, add a separate entry; this spec doesn't speculate.

## 5. Testing

### 5.1 Unit

- `verify-excluded-commands` test: project with `[docker]` block + missing `"docker compose"` entry → throws `PreflightError` with `reason: '[docker] block present (agent does Step 0.5 bringup)'`.
- `verify-excluded-commands` test: project with `[docker]` block + `"docker compose"` present → passes.
- `verify-excluded-commands` test: project without `[docker]` block + no `"docker compose"` entry → passes (clause is gated).

### 5.2 End-to-end (manual)

1. **Repro the bug.** With CREW-114 unimplemented, run `crew fix-pr <KEY>` against any docker-using project. Observe Step 0.5 abort on docker socket permission.
2. **Apply the fix.** Implement, push, merge.
3. **Verify.** Same `crew fix-pr <KEY>` invocation. Expect: agent's Step 0.5 runs `docker compose up --build --wait` un-sandboxed, succeeds, agent applies feedback.

### 5.3 Doc smoke

- Markdown lint clean.
- Internal links resolve (`docs/plans/architecture.md` ↔ `docs/plans/sandbox-limitations.md` both directions).
- The "When you're designing a new agent prompt" workflow is internally consistent with `verify-excluded-commands.ts`'s structure (i.e., a new row implies a new clause in `requiredEntries`, and vice-versa).

## 6. Open questions

None blocking. The `docker compose` prefix vs full-string question is settled in §4.

## 7. Links

- Triggering bug: CREW-113 user-test transcript ("Docker bring-up is blocked by sandbox permissions on `/var/run/docker.sock`"), 2026-05-07.
- Related ticket: [CREW-113](https://safturento.atlassian.net/browse/CREW-113) — the change that introduced the regression.
- Paired Recipes PR: opened separately from the same branch session.
