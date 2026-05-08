# Sandbox limitations doc + `docker compose` exclusion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow the dispatched agent to run `docker compose` un-sandboxed (so Step 0.5 from CREW-113 actually works) by adding `"docker compose"` to crew's `<repo>/.claude/settings.json` `excludedCommands`, enforcing the entry via `verify-excluded-commands`, and capturing the underlying sandbox model in a new `docs/plans/sandbox-limitations.md` reference doc.

**Architecture:** Two lines of code change (`requiredEntries` clause in `verify-excluded-commands.ts`, one entry in `.claude/settings.json`), one new prose doc, and two cross-links. The preflight check that today already enforces `bruno:smoke` / `test:e2e` exclusions gains a `[docker]`-gated third clause. `runResumePreflight` (from CREW-113) and the fresh-mode `runPreflight` both inherit the new requirement automatically because the clause lives inside `verifyExcludedCommandsCheck`'s `requiredEntries`.

**Tech Stack:** TypeScript, Vitest, JSON config, Markdown. No new dependencies.

**Source spec:** [`docs/superpowers/specs/2026-05-07-sandbox-limitations-and-docker-compose-exclusion-design.md`](../specs/2026-05-07-sandbox-limitations-and-docker-compose-exclusion-design.md). Read it before starting.

**Ticket carve-up:** Single ticket (CREW-114). Tightly coupled — splitting wouldn't shorten the critical path.

**Coordination with Recipes:** Recipes' `.claude/settings.json` needs the same `"docker compose"` entry for its dispatches to pass crew's new preflight check. **The Recipes PR must land before crew's Task 4 ships.** The Recipes PR is opened independently from this branch session (no KAN ticket — trivial config tweak). When implementing this plan, verify the Recipes PR has merged before completing Task 4; if not, hold Task 4 until it does (the rest of the plan is independent and can land first).

**File changes summary:**

| File | Change |
| --- | --- |
| `<repo>/.claude/settings.json` | Add `"docker compose"` to `sandbox.excludedCommands`. |
| `docs/plans/sandbox-limitations.md` | New: structured reference doc (workaround-able table + hard limits list + design-time workflow). |
| `docs/plans/architecture.md` | One-line cross-link near the existing "Sandbox config drift" bullet. |
| `packages/cli/src/lib/preflight/verify-excluded-commands.ts` | Add `config.docker`-gated clause to `requiredEntries`; JSDoc cross-link to the doc. |
| `packages/cli/src/lib/preflight/verify-excluded-commands.test.ts` | New test cases for the docker clause. |
| `packages/cli/src/lib/prompts/templates/rebase-preamble.md` | (Optional) one-line cross-link below Step 0.5 to the limitations doc. |

---

## Task 1: Add `"docker compose"` to crew's `.claude/settings.json`

**Files:**

- Modify: `<repo>/.claude/settings.json:5-8`

This task lands the entry first, before the enforcement clause in Task 4. That ordering ensures crew's own self-dispatches don't fail the preflight check during the brief window between landing the check and landing the entry.

- [ ] **Step 1.1: Read the current file**

```
cat .claude/settings.json
```

Expected: `excludedCommands` array contains `"npm run bruno:smoke"` and `"npm run test:e2e"`.

- [ ] **Step 1.2: Append `"docker compose"` to the array**

Edit `<repo>/.claude/settings.json` so the array becomes:

```json
"excludedCommands": [
  "npm run bruno:smoke",
  "npm run test:e2e",
  "docker compose"
]
```

(The rest of the file is unchanged.)

- [ ] **Step 1.3: Verify JSON parse**

```
node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json', 'utf8'))"
```

Expected: no output (parses cleanly). Non-zero exit means the JSON is malformed; fix the comma placement.

- [ ] **Step 1.4: Commit**

```
git add .claude/settings.json
git commit -m "chore(sandbox): exclude \"docker compose\" so the agent can do Step 0.5 bringup"
```

---

## Task 2: Create `docs/plans/sandbox-limitations.md`

**Files:**

- Create: `docs/plans/sandbox-limitations.md`

- [ ] **Step 2.1: Create the file with the full body**

Create `docs/plans/sandbox-limitations.md`:

```markdown
# Sandbox limitations

When `crew run` / `crew fix-pr` / `crew finish` dispatches an agent, the agent runs inside Claude Code's sandbox (bubblewrap-style on Linux/WSL2; see Claude Code's docs for the host-level model). The sandbox blocks operations that would otherwise let an agent affect the host beyond its worktree. This doc catalogs the limitations we've hit so the next agent-prompt design doesn't relitigate them.

The wrapper itself runs un-sandboxed. Anything the wrapper does — port allocation, `.env` materialization, docker bringup pre-CREW-113, daemon-client requests, transcript streaming — has full host access. The sandbox only applies once the dispatched `claude` subprocess starts.

## Workaround-able restrictions

These can be loosened per-project via entries in `<repo>/.claude/settings.json`. Each row names the operation that fails sandboxed, the setting that loosens it, and the entry shape.

| Operation | Setting | Entry | Why required |
| --- | --- | --- | --- |
| Host loopback HTTP from `npm run bruno:smoke` | `sandbox.excludedCommands` | `"npm run bruno:smoke"` | Bruno hits the worktree app port; sandboxed `bwrap --unshare-net` isolates loopback. |
| Host loopback HTTP from `npm run test:e2e` | `sandbox.excludedCommands` | `"npm run test:e2e"` | Playwright e2e hits the worktree app port; same isolation issue. |
| Docker socket (`/var/run/docker.sock`) | `sandbox.excludedCommands` | `"docker compose"` (prefix) | Agent's Step 0.5 (CREW-113) brings up the stack; sandbox blocks the socket. Prefix entry covers `up`, `down`, `logs`, `ps`, etc. |
| Anthropic / GitHub / Atlassian / npm registry HTTPS | `sandbox.network.allowedDomains` | hostname per call site | Sandboxed agents need these for their own tooling (Claude API, MCP servers, gh CLI, npm install). |
| Writes under `~/.npm`, `~/.cache/node`, `~/.cache/claude*`, `/tmp` | `sandbox.filesystem.allowWrite` | path | npm install + Claude Code internals write here. |

`excludedCommands` accepts prefix-style entries at runtime — a list entry of `"docker compose"` matches `docker compose up --build --wait`, `docker compose down`, etc. The wrapper-side `verify-excluded-commands` check in `packages/cli/src/lib/preflight/verify-excluded-commands.ts` enforces an *exact-string* match against the canonical entries it requires; if a project commits a stricter (longer) entry, the runtime works but the preflight check fails until the canonical entry is used.

## Hard limits

These are enforced by Claude Code's hardcoded checks regardless of `settings.json`. They cannot be loosened per-project; if the agent needs the operation, the design has to route around it (typically by having the un-sandboxed wrapper do the work and pass the result through, or by skipping the operation entirely and surfacing the gap to the user).

- **Writes to `~/.claude/**`.** Blocked even with `--dangerously-skip-permissions`. User-level skill / global CLAUDE.md edits / global settings.json tweaks must be authored manually, not via `crew run`. Source: user-level `CLAUDE.md` "Don't ticket — handle manually" section.
- **Writes to in-worktree `.claude/settings.json`.** Same protection extends to repo-level `.claude/`. The agent likely cannot fix a missing `excludedCommands` entry from inside its own session — that's why `verify-excluded-commands` lives wrapper-side and runs *before* spawn (in `runResumePreflight` for fix-pr and `runPreflight` for crew run).

## When you're designing a new agent prompt

If the prompt asks the agent to run a host-level operation (anything that touches a Unix socket, a system service, an exclusive port, or a path outside the worktree):

1. Check the workaround-able table — is there already an entry for this class of operation? If yes, ensure the project has it (the `verify-excluded-commands` preflight should require it).
2. If no entry exists, add one to the table. Then add the corresponding clause to `requiredEntries(config)` in `packages/cli/src/lib/preflight/verify-excluded-commands.ts` so the preflight enforces it.
3. If the operation is in the hard-limits list, the agent **cannot** do it. Route the operation through the wrapper instead, or design the prompt to abort + document.
4. If the operation is none of the above and the agent is hitting permission errors at runtime — that's the signal to first document the new restriction here, *then* design the fix.

## When you discover a new restriction

The signal is usually "agent reports an environmental error mid-run and the operation worked fine when the wrapper used to do it." Add a row to the table in the same PR that fixes the symptom. The doc is the durable artifact; the fix is incidental to it.
```

- [ ] **Step 2.2: Verify markdown parses**

```
npx markdown-link-check docs/plans/sandbox-limitations.md 2>/dev/null || true
```

Expected: any internal link warnings are fine (the file refers to its own headings). External links (Claude Code docs etc.) are not strictly required to resolve at lint time.

- [ ] **Step 2.3: Commit**

```
git add docs/plans/sandbox-limitations.md
git commit -m "docs(plans): catalog sandbox limitations + workarounds + hard limits"
```

---

## Task 3: Cross-link from `docs/plans/architecture.md`

**Files:**

- Modify: `docs/plans/architecture.md:243`

The natural anchor is the existing "Sandbox config drift" open-questions bullet. Add a one-line pointer right after it.

- [ ] **Step 3.1: Locate the line**

```
grep -n "Sandbox config drift" docs/plans/architecture.md
```

Expected: line 243 (or near it; line numbers may have shifted with prior edits).

- [ ] **Step 3.2: Add the cross-link**

Find the existing bullet:

```markdown
- **Sandbox config drift.** crew can write `.claude/settings.json` for a worktree, but if the user customises it, crew shouldn't clobber. Use the same "tag the file with a `# generated by crew` header and refuse to overwrite without it" pattern from `docker-env.sh`.
```

Append a sentence to it (in-place, same bullet):

```markdown
- **Sandbox config drift.** crew can write `.claude/settings.json` for a worktree, but if the user customises it, crew shouldn't clobber. Use the same "tag the file with a `# generated by crew` header and refuse to overwrite without it" pattern from `docker-env.sh`. The catalog of which sandbox restrictions have known workarounds (and which are hard-limited by Claude Code) lives in [`sandbox-limitations.md`](./sandbox-limitations.md) — start there before designing a prompt that asks the agent to run a host-level operation.
```

- [ ] **Step 3.3: Commit**

```
git add docs/plans/architecture.md
git commit -m "docs(architecture): cross-link to sandbox-limitations.md from the existing drift bullet"
```

---

## Task 4: Add `[docker]`-gated clause to `verify-excluded-commands`

**Files:**

- Modify: `packages/cli/src/lib/preflight/verify-excluded-commands.ts:13-28`
- Modify: `packages/cli/src/lib/preflight/verify-excluded-commands.test.ts`

> **Coordination check before starting:** Recipes' `.claude/settings.json` must have `"docker compose"` in `excludedCommands` before this lands, or any `crew run` against Recipes will fail the new preflight check. Verify by `grep -A 6 excludedCommands /home/safturento/Repos/Recipes/.claude/settings.json` (or the equivalent path) and confirm `"docker compose"` is present. If not, hold this task until the paired Recipes PR merges.

- [ ] **Step 4.1: Write failing tests**

Append to `packages/cli/src/lib/preflight/verify-excluded-commands.test.ts`, after the existing `it('skips when neither block is enabled', ...)` (around line 149, inside the `describe('verifyExcludedCommandsCheck', ...)` block — keep its trailing `})`):

```ts
  const cfgWithDocker = {
    canonical_worktree: 'main',
    db_clone: {
      postgres_service: 'postgres',
      postgres_user: 'postgres',
      postgres_database: 'postgres',
      required_tables: [],
      exclude_tables: [],
    },
    docker: {
      canonical_worktree: 'main',
    },
  } as unknown as ProjectConfig;

  it('throws when [docker] is present but "docker compose" is missing', async () => {
    await writeSettings({
      sandbox: { excludedCommands: ['npm run bruno:smoke', 'npm run test:e2e'] },
    });
    const check = verifyExcludedCommandsCheck();
    try {
      await check.run({ config: cfgWithDocker, worktree });
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PreflightError);
      const pe = err as PreflightError;
      expect(pe.details.missing).toBe('"docker compose"');
      expect(String(pe.details.reason)).toContain('[docker] block present');
    }
  });

  it('passes when [docker] is present and "docker compose" is in excludedCommands', async () => {
    await writeSettings({
      sandbox: { excludedCommands: ['docker compose'] },
    });
    const check = verifyExcludedCommandsCheck();
    await expect(check.run({ config: cfgWithDocker, worktree })).resolves.toBeUndefined();
  });

  it('does not require "docker compose" when no [docker] block is present', async () => {
    await writeSettings({ sandbox: { excludedCommands: [] } });
    const cfgNoDocker = {
      canonical_worktree: 'main',
      db_clone: {
        postgres_service: 'postgres',
        postgres_user: 'postgres',
        postgres_database: 'postgres',
        required_tables: [],
        exclude_tables: [],
      },
    } as unknown as ProjectConfig;
    const check = verifyExcludedCommandsCheck();
    await expect(check.run({ config: cfgNoDocker, worktree })).resolves.toBeUndefined();
  });
```

- [ ] **Step 4.2: Run tests; expect three failures**

```
npm run test:run --workspace=crew-cli -- packages/cli/src/lib/preflight/verify-excluded-commands.test.ts
```

Expected: the first new test fails (no clause yet, so no entry is "missing" from `requiredEntries`); the second passes incidentally (no required entries means any settings.json passes); the third passes incidentally for the same reason. Specifically the first failure asserts the helpful error shape — that's the one driving the implementation.

- [ ] **Step 4.3: Add the docker clause + JSDoc cross-link**

In `packages/cli/src/lib/preflight/verify-excluded-commands.ts`, replace the `requiredEntries` function (currently lines 13-28) with:

```ts
/**
 * Compute the excludedCommands the agent's project needs in its
 * <repo>/.claude/settings.json. Each entry corresponds to a sandbox
 * restriction documented in docs/plans/sandbox-limitations.md.
 */
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

(The `BRUNO_COMMAND` constant and `RequiredEntry` interface defined above stay unchanged.)

- [ ] **Step 4.4: Re-run tests; expect all green**

```
npm run test:run --workspace=crew-cli -- packages/cli/src/lib/preflight/verify-excluded-commands.test.ts
```

Expected: all tests pass, including the three new ones.

- [ ] **Step 4.5: Run the full preflight suite (regression check)**

```
npm run test:run --workspace=crew-cli -- packages/cli/src/lib/preflight
```

Expected: green. The `runResumePreflight` tests and any other check tests should still pass — the docker clause is additive and gated on `config.docker`, so non-docker fixtures see no change.

- [ ] **Step 4.6: Type + lint**

```
npm run typecheck --workspace=crew-cli
npm run lint --workspace=crew-cli
```

Expected: clean.

- [ ] **Step 4.7: Commit**

```
git add packages/cli/src/lib/preflight/verify-excluded-commands.ts \
        packages/cli/src/lib/preflight/verify-excluded-commands.test.ts
git commit -m "feat(preflight): require \"docker compose\" excludedCommands when [docker] is present (CREW-114)"
```

---

## Task 5 (optional): One-line cross-link from `rebase-preamble.md`

**Files:**

- Modify: `packages/cli/src/lib/prompts/templates/rebase-preamble.md:30-32`

This task is optional per spec §2.1 item 5. Skip if you'd rather leave the rebase-preamble surface alone — Task 4's enforcement check already prevents projects from reaching Step 0.5 without the entry.

- [ ] **Step 5.1: Locate the existing Step 0.5 closing paragraph**

The file ends with:

```markdown
If `docker compose up` fails for environmental reasons (host docker daemon down, port collision with another stack, missing CLI tools) — i.e., a failure that rebasing would not have fixed — abort with a clear message: document the blocker in `docs/tickets/{{key}}.md` "Open questions" and exit WITHOUT applying the review feedback. Do not push.

**Do not reset the worktree or use any "hard" reset command** — those wipe in-progress work.

---
```

- [ ] **Step 5.2: Insert a one-line link before the "Do not reset" sentence**

Add (between the two paragraphs):

```markdown
If `docker compose` itself returns a permission error — typically `/var/run/docker.sock` denied — that's a missing `excludedCommands` entry; see `docs/plans/sandbox-limitations.md`. Abort and ask the user to add the entry rather than trying to write the settings.json yourself.
```

After the edit the file's tail should read:

```markdown
If `docker compose up` fails for environmental reasons (host docker daemon down, port collision with another stack, missing CLI tools) — i.e., a failure that rebasing would not have fixed — abort with a clear message: document the blocker in `docs/tickets/{{key}}.md` "Open questions" and exit WITHOUT applying the review feedback. Do not push.

If `docker compose` itself returns a permission error — typically `/var/run/docker.sock` denied — that's a missing `excludedCommands` entry; see `docs/plans/sandbox-limitations.md`. Abort and ask the user to add the entry rather than trying to write the settings.json yourself.

**Do not reset the worktree or use any "hard" reset command** — those wipe in-progress work.

---
```

- [ ] **Step 5.3: Update affected snapshots**

```
npm run test:run --workspace=crew-cli -- packages/cli/src/lib/prompts/builders.test.ts -u
```

Inspect the snapshot diff under `packages/cli/src/lib/prompts/__snapshots__/`: the only change should be the new sentence inside the rebase-preamble block of any snapshotted prompt.

- [ ] **Step 5.4: Run all CLI tests**

```
npm run test:run --workspace=crew-cli
```

Expected: green (snapshot updates absorbed in 5.3).

- [ ] **Step 5.5: Commit**

```
git add packages/cli/src/lib/prompts/templates/rebase-preamble.md \
        packages/cli/src/lib/prompts/__snapshots__/
git commit -m "docs(prompts): point Step 0.5 at sandbox-limitations.md for socket-perms errors"
```

---

## Task 6: End-to-end validation

**Files:** none modified.

- [ ] **Step 6.1: Verify the crew preflight enforces the new entry**

From the canonical worktree:

```
node -e "console.log(require('./packages/cli/src/lib/preflight/verify-excluded-commands.ts'))" 2>&1 | head -3
```

(That command will fail because TS isn't directly executable; the goal is just to confirm the file edits are saved. Skip if Task 4 tests pass — that's stronger evidence.)

The real validation is functional: from a fresh worktree of a project with `[docker]` in its config (Recipes works) where you've **temporarily removed** `"docker compose"` from `.claude/settings.json` (don't commit the removal), run:

```
crew run <SOME-KAN-KEY>
```

Expected: wrapper preflight throws with `missing: "docker compose"` and `reason: "[docker] block present (agent does Step 0.5 bringup)"`. Restore the entry and re-run; expected: agent spawns normally.

- [ ] **Step 6.2: Verify Step 0.5 actually succeeds end-to-end**

With the `"docker compose"` entry present, run a real `crew fix-pr <KEY>` against any docker-using worktree. The agent's Step 0.5 should complete `docker compose up --build --wait` without hitting `/var/run/docker.sock` permission denied. Capture the transcript path for the PR description.

- [ ] **Step 6.3: Verify a non-docker project is unaffected**

If there's a project config without `[docker]`, run `crew run <KEY>` against it. Expected: no preflight error (the new clause is gated on `config.docker`).

If no such project exists today, skip this step and rely on Task 4's unit test (`'does not require "docker compose" when no [docker] block is present'`) for coverage.

---

## Self-review checklist (run after writing the plan)

- Spec §2.1 item 1 (`.claude/settings.json` entry): Task 1. ✓
- Spec §2.1 item 2 (`verify-excluded-commands` clause): Task 4. ✓
- Spec §2.1 item 3 (new doc): Task 2. ✓
- Spec §2.1 item 4 (cross-link from architecture + JSDoc): Task 3 (architecture) + Task 4 Step 4.3 (JSDoc). ✓
- Spec §2.1 item 5 (optional rebase-preamble link): Task 5 (marked optional). ✓
- Spec §3.1 code change matches Task 4 Step 4.3. ✓
- Spec §3.2 doc structure matches Task 2 Step 2.1's body. ✓
- Spec §3.3 architecture cross-link matches Task 3 Step 3.2. ✓
- Spec §3.4 Recipes coordination called out in plan preface + Task 4 coordination check. ✓
- Spec §5 testing coverage:
  - §5.1 unit tests: Task 4 Step 4.1 (3 cases — present-but-missing, present-and-present, absent-and-not-required). ✓
  - §5.2 e2e: Task 6. ✓
  - §5.3 doc smoke: Task 2 Step 2.2 + Task 3 (link cross-resolves). ✓
- No `TBD` / `TODO` / `implement later` placeholders. ✓
- Type consistency: `RequiredEntry` shape consistent across `requiredEntries` clauses; test assertions match the `details.missing` / `details.reason` keys actually emitted by `verifyExcludedCommandsCheck`'s `PreflightError`. ✓
