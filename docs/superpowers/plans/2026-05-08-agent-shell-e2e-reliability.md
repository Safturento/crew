# Agent-shell e2e reliability — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `npm run test:e2e` succeed reliably from a dispatched agent's shell against the worktree docker dashboard, by closing five linked gaps: glob-aware sandbox exclusions, deterministic `baseURL` resolution from the materialized `.env`, dropping the counterproductive Playwright `webServer` block, plumbing `PLAYWRIGHT_BASE_URL` through agent dispatch, and warning agents about command-form sensitivity.

**Architecture:** First task is an empirical probe — we don't know which glob form (`"foo*"`, `"foo *"`, etc.) actually bypasses the sandbox, so we measure before changing production settings. Result of the probe gets backfilled into the spec and drives Task 2. The remaining tasks are independent of each other (parallelizable in principle, but the plan keeps them sequential for atomic review). The integration gate at the end is "dispatch a follow-up agent on a small dashboard ticket and confirm `npm run test:e2e` runs un-sandboxed against the worktree docker dashboard."

**Tech Stack:** TypeScript, Vitest, Playwright, JSON config, Markdown. No new runtime dependencies (the `.env` resolver uses regex; no TOML parser added to `crew-dashboard`).

**Source spec:** [`docs/superpowers/specs/2026-05-08-agent-shell-e2e-reliability-design.md`](../specs/2026-05-08-agent-shell-e2e-reliability-design.md). Read it before starting. Note: §3.1 of the spec contains a probe-results table that **you fill in** during Task 1 before proceeding to Task 2.

**Ticket carve-up:** Single ticket. The five fixes target one user-facing outcome (e2e passes from agent shell) and split poorly — splitting `excludedCommands` from `playwright.config.ts` would leave one half of the system green-tested in isolation but the integration broken.

**File changes summary:**

| File | Change |
| --- | --- |
| `docs/superpowers/specs/2026-05-08-agent-shell-e2e-reliability-design.md:§3.1` | Backfill probe-results table (live edit during Task 1). |
| `<repo>/.claude/settings.json:5-8` | Replace exact-match entries with verified glob form for all three commands. |
| `packages/cli/src/lib/preflight/verify-excluded-commands.ts` | Update `requiredEntries` to emit the verified glob form. |
| `packages/cli/src/lib/preflight/verify-excluded-commands.test.ts` | Update existing tests for new entry shape; add regression for old exact-match form. |
| `packages/dashboard/playwright.config.ts` | Remove `webServer` block; replace baseURL `??` chain with `.env`-reading resolver. |
| `packages/dashboard/playwright.config.test.ts` | New: tests for `resolveBaseURL` resolver. |
| `packages/cli/src/commands/run.ts:397-402` | Add `PLAYWRIGHT_BASE_URL: resolvedAppUrl` to env block. |
| `packages/cli/src/commands/fix-pr.ts:236` | Same plumbing for the parallel injection point. |
| `packages/cli/src/lib/prompts/templates/sandbox-network-note.md` | Replace destructive `crew restart --hard` recommendation with `docker compose up --build --wait`; add form-sensitivity warning section. |
| `packages/cli/src/lib/prompts/__snapshots__/` | Snapshot updates from the prompt template change. |
| `docs/followups.md` | Move the `2026-05-07 — sandbox-network-note.md…` entry from Active to Resolved (atomic with the prompt change). |

---

## Task 1: Empirical wildcard probe (gate)

**Files:** none modified at the production level. The probe edits `<repo>/.claude/settings.json` and `packages/dashboard/package.json` *temporarily* and reverts them before commit. Backfill of results lands in the spec.

**Why first:** the production `excludedCommands` form depends on what glob syntax actually bypasses the sandbox. The Claude Code docs show a single example (`docker *`) without specifying matching semantics. Measuring up-front turns Task 2 from a guess into a transcription.

- [ ] **Step 1.1: Set up the probe harness**

Add a temporary script to `packages/dashboard/package.json` `scripts` block:

```json
"probe:loopback": "curl -sS --max-time 3 http://localhost:21559/healthz && echo PROBE_OK || echo PROBE_FAIL"
```

(The exact port `21559` doesn't need to be live — what matters is whether the command runs sandboxed or not. A sandboxed run will print `PROBE_FAIL` on `ECONNREFUSED`; an un-sandboxed run will either print `PROBE_OK` if the worktree docker stack is up, or also `PROBE_FAIL` if it's not but for a different reason. To disambiguate, run the docker stack first via `docker compose up -d` from the worktree, or pick a port that's known not in use — and look for sandbox-specific error signatures rather than success/failure outcomes. See Step 1.4 for the disambiguation method.)

- [ ] **Step 1.2: Snapshot current `excludedCommands` for restore**

```
cp .claude/settings.json /tmp/probe-settings.json.bak
```

You'll restore from this backup at the end of the task.

- [ ] **Step 1.3: Run the baseline (sandboxed, no exclusion)**

With `excludedCommands` containing **none** of the probe variants, run from a sandboxed Bash call:

```
strace -f -e trace=connect npm run probe:loopback --workspace=crew-dashboard 2>&1 | grep -E '(unshare|EACCES|ECONNREFUSED|connect)' | head -20
```

Record the trailing pid/error pattern. Sandboxed runs typically show `connect(...) = -1 ECONNREFUSED` against the host loopback IP because `bwrap --unshare-net` gave the process its own loopback. Save this output as the **baseline failure signature** to compare against.

If `strace` isn't available or doesn't surface a clear distinction, a simpler alternative: check `/proc/self/status | grep NSpid` — a sandboxed process has a non-trivial PID namespace nesting visible there. Whatever method gives you a reliable "this ran sandboxed" vs "this ran un-sandboxed" signal, document it in the spec backfill.

- [ ] **Step 1.4: Test each candidate exclusion form**

For each candidate below, edit `<repo>/.claude/settings.json` to set `excludedCommands` to the array containing only that single entry, then run the same probe and compare to the baseline signature. Record the result as `MATCH` (no sandbox signature) or `NO MATCH` (sandbox signature present).

| Candidate entry | Probe command |
| --- | --- |
| `"npm run probe:loopback"` | `npm run probe:loopback --workspace=crew-dashboard` |
| `"npm run probe:loopback*"` | `npm run probe:loopback --workspace=crew-dashboard` |
| `"npm run probe:loopback *"` | `npm run probe:loopback --workspace=crew-dashboard` |
| `"npm run probe:loopback**"` | `npm run probe:loopback --workspace=crew-dashboard` |
| `"npm run probe:loopback*"` | `npm run probe:loopback --workspace=crew-dashboard 2>&1 \| tail -5` |
| `"npm run *"` | `npm run probe:loopback --workspace=crew-dashboard` |

(The fifth row exists specifically to test whether shell-pipe forms defeat matching. The sixth row probes whether broad-glob entries are honored at all.)

- [ ] **Step 1.5: Backfill results into the spec**

Edit `docs/superpowers/specs/2026-05-08-agent-shell-e2e-reliability-design.md:§3.1` to replace the placeholder hypotheses table with the actual results. Format:

```markdown
**Probe results (run 2026-05-08):**

| Candidate | Workspace flag | Pipe | Result | Notes |
| --- | --- | --- | --- | --- |
| `"npm run probe:loopback"` | yes | no | NO MATCH | exact-match doesn't accept extra args |
| `"npm run probe:loopback*"` | yes | no | MATCH | concatenated glob works |
| `"npm run probe:loopback*"` | yes | yes (`\| tail`) | NO MATCH | shell pipe defeats matching |
| `"npm run probe:loopback *"` | yes | no | … | … |
| `"npm run probe:loopback**"` | yes | no | … | … |
| `"npm run *"` | yes | no | … | … |

**Conclusion:** the canonical form is `<chosen-form>`. Pipes <are/aren't> covered. The §3.6 prompt warning <does/does not> need to call out pipe variants specifically.
```

(The example values are illustrative; transcribe what you actually observed.)

- [ ] **Step 1.6: Restore the probe-state files**

```
cp /tmp/probe-settings.json.bak .claude/settings.json
git checkout -- packages/dashboard/package.json
```

Confirm with `git diff` that no probe-related changes remain staged or unstaged.

- [ ] **Step 1.7: Commit the spec backfill only**

```
git add docs/superpowers/specs/2026-05-08-agent-shell-e2e-reliability-design.md
git commit -m "docs(spec): backfill wildcard probe results from sandbox excludedCommands matching"
```

---

## Task 2: Update `excludedCommands` to the verified glob form

**Files:**

- Modify: `<repo>/.claude/settings.json:5-8`
- Modify: `packages/cli/src/lib/preflight/verify-excluded-commands.ts`
- Modify: `packages/cli/src/lib/preflight/verify-excluded-commands.test.ts`

> **Project-specific:** the canonical form `<chosen-form>` referenced below comes from Task 1's probe results. Substitute the actual form into every quoted instance below.

- [ ] **Step 2.1: Update `<repo>/.claude/settings.json`**

Replace the `excludedCommands` array with the verified glob form for all three entries. Example assuming the probe confirmed `command*`:

```json
"excludedCommands": [
  "npm run bruno:smoke*",
  "npm run test:e2e*",
  "docker compose*"
]
```

Verify the JSON parses:

```
node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json', 'utf8'))"
```

Expected: no output (parses cleanly).

- [ ] **Step 2.2: Update existing tests in `verify-excluded-commands.test.ts`**

The test file uses string literals like `'npm run bruno:smoke'` and `'npm run test:e2e'` to author both the committed `excludedCommands` and the expected `details.missing` shape. Search-replace those literals to the new glob form. Specifically, in `packages/cli/src/lib/preflight/verify-excluded-commands.test.ts`:

- Every occurrence of `'npm run bruno:smoke'` → `'npm run bruno:smoke*'` (or whatever Task 1 verified)
- Every occurrence of `'npm run test:e2e'` → `'npm run test:e2e*'`
- Every occurrence of `'docker compose'` → `'docker compose*'`

Run the suite to confirm it's still green against the un-edited source:

```
npm run test:run --workspace=crew-cli -- packages/cli/src/lib/preflight/verify-excluded-commands.test.ts
```

Expected: GREEN. The literals in the test file moved together; the source file's `requiredEntries` still emits the old form, and the tests' `excludedCommands` writes still contain the old form too — wait, that's wrong. Re-check: the tests author both sides of the comparison, so they pass without source edits. **However**, the regression we want is the *source* emitting the new form against settings.json that has the new form. So at this step the tests are passing for the wrong reason. Continue to 2.3.

- [ ] **Step 2.3: Add a regression test for the old exact-match form**

Append to `packages/cli/src/lib/preflight/verify-excluded-commands.test.ts`, inside the existing `describe('verifyExcludedCommandsCheck', ...)` block (substitute the canonical form from Task 1):

```ts
  it('rejects the legacy exact-match form for bruno:smoke', async () => {
    await writeSettings({
      sandbox: { excludedCommands: ['npm run bruno:smoke'] }, // legacy exact-match
    });
    const check = verifyExcludedCommandsCheck();
    try {
      await check.run({ config: cfgWithBruno, worktree });
      expect.fail('expected throw — legacy form should not satisfy the new requirement');
    } catch (err) {
      expect(err).toBeInstanceOf(PreflightError);
      const pe = err as PreflightError;
      expect(pe.details.missing).toBe('"npm run bruno:smoke*"');
      expect(String(pe.details.reason)).toContain('[bruno_smoke].enabled = true');
    }
  });
```

Run; expect failure (the source still emits the old exact-match form, so the test's "missing" expectation doesn't match what `requiredEntries` produces yet):

```
npm run test:run --workspace=crew-cli -- packages/cli/src/lib/preflight/verify-excluded-commands.test.ts
```

Expected: at minimum the new test fails (TDD red).

- [ ] **Step 2.4: Update `requiredEntries` to emit the verified glob form**

Edit `packages/cli/src/lib/preflight/verify-excluded-commands.ts`. Update both the `BRUNO_COMMAND` constant and the inline strings in `requiredEntries`. Example (substitute the verified form):

```ts
const BRUNO_COMMAND = 'npm run bruno:smoke*';

// ...

function requiredEntries(config: ProjectConfig): RequiredEntry[] {
  const out: RequiredEntry[] = [];

  if (config.bruno_smoke?.enabled) {
    out.push({ command: BRUNO_COMMAND, reason: '[bruno_smoke].enabled = true' });
  }

  if (config.playwright?.authored?.enabled) {
    // The TOML's test_command is what the project committed; we glob-suffix
    // it for the canonical form, regardless of how the project authored it.
    out.push({
      command: `${config.playwright.authored.test_command}*`,
      reason: '[playwright].authored.enabled = true',
    });
  }

  if (config.docker) {
    out.push({
      command: 'docker compose*',
      reason: '[docker] block present (agent does Step 0.5 bringup)',
    });
  }

  return out;
}
```

(If Task 1 verified a different canonical form, e.g. `command *` with a space, swap that in instead of `*` suffix.)

- [ ] **Step 2.5: Run the full preflight test suite**

```
npm run test:run --workspace=crew-cli -- packages/cli/src/lib/preflight
```

Expected: GREEN. All existing tests pass with the new form (because Step 2.2 updated the literals); the new regression test passes because the source now emits the new form.

- [ ] **Step 2.6: Type + lint**

```
npm run typecheck --workspace=crew-cli
npm run lint --workspace=crew-cli
```

Expected: clean.

- [ ] **Step 2.7: Commit**

```
git add .claude/settings.json \
        packages/cli/src/lib/preflight/verify-excluded-commands.ts \
        packages/cli/src/lib/preflight/verify-excluded-commands.test.ts
git commit -m "feat(sandbox): glob-form excludedCommands so flag/wrapper variants bypass the sandbox"
```

---

## Task 3: Drop the `webServer` block from `playwright.config.ts`

**Files:**

- Modify: `packages/dashboard/playwright.config.ts:22-29`

The `webServer` block spawns a fresh Vite alongside whatever the docker stack is serving, which masks real failures and double-boots the dev server. Crew's deployment model is "the worktree docker stack is the source of truth" — there's no scenario where a fallback Vite is the right test target.

- [ ] **Step 3.1: Remove the `webServer` block**

Edit `packages/dashboard/playwright.config.ts`. Delete lines 22-29 (the entire `webServer: { … }` block, including the trailing comma if present). Add a brief inline comment in its place documenting why it's intentionally absent:

```ts
  // Intentionally no webServer block: tests run against the worktree's docker
  // dashboard stack only. A fallback Vite spawn here was masking real failures
  // — see docs/superpowers/specs/2026-05-08-agent-shell-e2e-reliability-design.md.
```

After the edit, the config's exported object should have only `testDir`, `fullyParallel`, `forbidOnly`, `retries`, `reporter`, `use`, and `projects` — no `webServer`.

- [ ] **Step 3.2: Confirm nothing else references the removed block**

```
grep -rn 'webServer\|reuseExistingServer' packages/dashboard/
```

Expected: no hits outside `playwright.config.ts`'s comment. If a test file or doc references the removed block, update accordingly.

- [ ] **Step 3.3: Type-check the dashboard package**

```
npm run typecheck --workspace=crew-dashboard
```

Expected: clean.

- [ ] **Step 3.4: Commit**

```
git add packages/dashboard/playwright.config.ts
git commit -m "feat(dashboard): drop playwright webServer block — docker stack is the only target"
```

---

## Task 4: Replace `baseURL` resolution with `.env` reader

**Files:**

- Modify: `packages/dashboard/playwright.config.ts:1-4`
- Create: `packages/dashboard/playwright.config.test.ts`

The current `process.env.PLAYWRIGHT_BASE_URL ?? process.env.CREW_APP_URL ?? 'http://localhost:5173'` chain silently falls through when env propagation breaks (which is what bit PR #133). Replace with a deterministic resolver that reads the materialized `<repo>/.env`.

- [ ] **Step 4.1: Write failing tests for `resolveBaseURL`**

Create `packages/dashboard/playwright.config.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveBaseURL } from './playwright.config.js';

describe('resolveBaseURL', () => {
  let repoRoot: string;
  let savedEnv: typeof process.env;

  beforeEach(async () => {
    repoRoot = await mkdtemp(path.join(tmpdir(), 'pw-config-'));
    await mkdir(path.join(repoRoot, '.git')); // findRepoRoot anchor
    savedEnv = { ...process.env };
    delete process.env.PLAYWRIGHT_BASE_URL;
  });

  afterEach(async () => {
    await rm(repoRoot, { recursive: true, force: true });
    process.env = savedEnv;
  });

  it('returns PLAYWRIGHT_BASE_URL when set', () => {
    process.env.PLAYWRIGHT_BASE_URL = 'http://override:9999';
    expect(resolveBaseURL(repoRoot)).toBe('http://override:9999');
  });

  it('returns APP_URL from .env when PLAYWRIGHT_BASE_URL is unset', async () => {
    await writeFile(
      path.join(repoRoot, '.env'),
      '# Generated by crew\nAPP_URL=http://localhost:21559\nCREW_PORT=29066\n',
    );
    expect(resolveBaseURL(repoRoot)).toBe('http://localhost:21559');
  });

  it('throws a helpful error when .env is missing', () => {
    expect(() => resolveBaseURL(repoRoot)).toThrow(/\.env/);
    expect(() => resolveBaseURL(repoRoot)).toThrow(/crew env/);
  });

  it('throws a helpful error when .env has no APP_URL line', async () => {
    await writeFile(path.join(repoRoot, '.env'), 'CREW_PORT=29066\nDAEMON_URL=http://localhost:29066\n');
    expect(() => resolveBaseURL(repoRoot)).toThrow(/APP_URL/);
    expect(() => resolveBaseURL(repoRoot)).toThrow(/crew env refresh/);
  });
});
```

- [ ] **Step 4.2: Run; expect failures**

```
npm run test:run --workspace=crew-dashboard -- playwright.config.test.ts
```

Expected: all four tests fail (`resolveBaseURL` doesn't exist yet).

- [ ] **Step 4.3: Implement `resolveBaseURL`**

Edit `packages/dashboard/playwright.config.ts`. Replace lines 1-4 with:

```ts
import { defineConfig, devices } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function findRepoRoot(start: string): string {
  let current = start;
  while (current !== dirname(current)) {
    if (existsSync(join(current, '.git'))) {
      return current;
    }
    current = dirname(current);
  }
  throw new Error(
    `playwright.config.ts: could not locate repo root from ${start} (no .git found walking up)`,
  );
}

export function resolveBaseURL(repoRoot = findRepoRoot(__dirname)): string {
  if (process.env.PLAYWRIGHT_BASE_URL) {
    return process.env.PLAYWRIGHT_BASE_URL;
  }
  const envPath = join(repoRoot, '.env');
  let envContents: string;
  try {
    envContents = readFileSync(envPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(
        `playwright.config.ts: ${envPath} not found. ` +
          `Run 'crew env init' (canonical worktree) or 'crew env refresh' (other worktrees), ` +
          `or set PLAYWRIGHT_BASE_URL explicitly.`,
      );
    }
    throw err;
  }
  const match = envContents.match(/^APP_URL=(.+)$/m);
  if (!match) {
    throw new Error(
      `playwright.config.ts: ${envPath} has no APP_URL line. ` +
        `Re-run 'crew env refresh', or set PLAYWRIGHT_BASE_URL explicitly.`,
    );
  }
  return match[1].trim();
}

const baseURL = resolveBaseURL();
```

The rest of the file (the `defineConfig({...})` export) is unchanged except the `webServer` block already removed in Task 3.

- [ ] **Step 4.4: Run; expect green**

```
npm run test:run --workspace=crew-dashboard -- playwright.config.test.ts
```

Expected: all four tests pass.

- [ ] **Step 4.5: Run all dashboard tests**

```
npm run test:run --workspace=crew-dashboard
```

Expected: green. Existing dashboard tests are unrelated and unaffected.

- [ ] **Step 4.6: Type + lint**

```
npm run typecheck --workspace=crew-dashboard
npm run lint
```

Expected: clean.

- [ ] **Step 4.7: Commit**

```
git add packages/dashboard/playwright.config.ts \
        packages/dashboard/playwright.config.test.ts
git commit -m "feat(dashboard): resolve playwright baseURL from materialized .env, no fallback"
```

---

## Task 5: Plumb `PLAYWRIGHT_BASE_URL` through agent dispatch

**Files:**

- Modify: `packages/cli/src/commands/run.ts:397-402`
- Modify: `packages/cli/src/commands/fix-pr.ts:236`

The new `playwright.config.ts` resolver reads from `.env` first (when `PLAYWRIGHT_BASE_URL` is unset), so this task is belt-and-suspenders for callers that bypass `npm run` (e.g., a future agent invoking `npx playwright test` directly, where the dashboard package's resolver still runs but env var is the cheaper path).

- [ ] **Step 5.1: Update `run.ts`**

Edit the `env:` block in the `execa('claude', ...)` call at `packages/cli/src/commands/run.ts:397-402`. Add `PLAYWRIGHT_BASE_URL` next to `CREW_APP_URL`:

```ts
    env: {
      ...childEnv,
      GH_TOKEN: ghToken,
      ...(resolvedAppUrl ? { CREW_APP_URL: resolvedAppUrl } : {}),
      ...(resolvedAppUrl ? { PLAYWRIGHT_BASE_URL: resolvedAppUrl } : {}),
      ...(brunoEnvName ? { CREW_BRUNO_ENV: brunoEnvName } : {}),
    },
```

- [ ] **Step 5.2: Update `fix-pr.ts`**

Edit the `env:` argument at `packages/cli/src/commands/fix-pr.ts:236`:

```ts
    env: resolvedAppUrl
      ? { CREW_APP_URL: resolvedAppUrl, PLAYWRIGHT_BASE_URL: resolvedAppUrl }
      : undefined,
```

- [ ] **Step 5.3: Type + lint**

```
npm run typecheck --workspace=crew-cli
npm run lint --workspace=crew-cli
```

Expected: clean.

- [ ] **Step 5.4: Run the CLI test suite for regressions**

```
npm run test:run --workspace=crew-cli
```

Expected: green. Existing tests don't assert on `PLAYWRIGHT_BASE_URL` presence; they just shouldn't fail because of an unexpected env key.

- [ ] **Step 5.5: Commit**

```
git add packages/cli/src/commands/run.ts packages/cli/src/commands/fix-pr.ts
git commit -m "feat(cli): plumb PLAYWRIGHT_BASE_URL through agent dispatch"
```

---

## Task 6: Update `sandbox-network-note.md` (atomic followup resolution)

**Files:**

- Modify: `packages/cli/src/lib/prompts/templates/sandbox-network-note.md`
- Modify: `packages/cli/src/lib/prompts/__snapshots__/` (snapshot updates)
- Modify: `docs/followups.md` (move entry from Active to Resolved)

This is the consolidated prompt-side change. Two diffs that travel together.

- [ ] **Step 6.1: Replace the destructive `crew restart --hard` recommendation**

Edit `packages/cli/src/lib/prompts/templates/sandbox-network-note.md`. Find the line:

> If `npm run bruno:smoke` succeeds, that confirms the daemon is up — but it says nothing about the worktree app port. If `{{e2eCommand}}` fails with `ECONNREFUSED`, that's a real signal: the docker stack is not serving at the expected port. Investigate `/tmp/crew-docker-{{key}}.log` and consider `crew restart {{key}} --hard`.

Replace with:

> If `npm run bruno:smoke` succeeds, that confirms the daemon is up — but it says nothing about the worktree app port. If `{{e2eCommand}}` fails with `ECONNREFUSED`, that's a real signal: the docker stack is not serving at the expected port. Investigate `/tmp/crew-docker-{{key}}.log` and consider running `docker compose up --build --wait` from the worktree to bring the stack back up.

(`crew restart --hard` destroys the worktree; we never want the agent reaching for it as a recovery step.)

- [ ] **Step 6.2: Add the form-sensitivity warning section**

Append to the same file (substitute the canonical form `<chosen-form>` from Task 1's results, and adjust the bullet list based on which variants the probe found to break the match):

```markdown

## Excluded-command matching is form-sensitive

Crew's whitelisted commands ({{whitelistedCommands}}) match `<repo>/.claude/settings.json`'s `excludedCommands` entries by glob. The current entries use the form `<chosen-form>` (e.g. `npm run test:e2e*`). **Wrappers and shell redirections may break the match,** in which case the command runs sandboxed and won't reach host loopback even though it looks like it should.

To stay matched:

- **Run the bare command:** `npm run test:e2e` (not `cd packages/dashboard && npm run test:e2e`).
- **The `--workspace=crew-dashboard` flag is covered by the glob** (the `command*` form accepts trailing args). You can add it.
- **Don't pipe to `tail` / `head` / etc.** — `2>&1 | tail -25` defeats the match because the runtime evaluates the rule against the pipeline as a string. Capture full output and use a logfile + the `Read` tool to extract the parts you want. For example:

  ```
  npm run test:e2e --workspace=crew-dashboard > /tmp/test-e2e.log 2>&1
  # then read /tmp/test-e2e.log via the Read tool
  ```

A failed `{{e2eCommand}}` that produced `ECONNREFUSED` while the same flow worked via Playwright MCP is the signature of a wrapper-defeated match.
```

(Adjust the bullet list to whatever Task 1 verified — if pipes turned out to match, drop that bullet; if `--workspace=` doesn't match, flip the second bullet's polarity.)

- [ ] **Step 6.3: Update affected snapshots**

```
npm run test:run --workspace=crew-cli -- packages/cli/src/lib/prompts -u
```

Inspect the snapshot diff under `packages/cli/src/lib/prompts/__snapshots__/`: the only changes should be inside snapshotted prompts that include the sandbox-network-note template. Reject snapshot diffs that touch unrelated prompt blocks.

- [ ] **Step 6.4: Run all CLI tests**

```
npm run test:run --workspace=crew-cli
```

Expected: green (snapshots updated in 6.3).

- [ ] **Step 6.5: Move the followup entry to Resolved**

Edit `docs/followups.md`:

1. Cut the entry beginning `### 2026-05-07 — sandbox-network-note.md recommends crew restart --hard for docker recovery, but --hard nukes the worktree` from `## Active`. Use the Read tool first to get the exact body so you can paste it whole.
2. Paste it under `## Resolved`, prepended with a one-line addendum:

   ```markdown
   **Resolved 2026-05-08:** Replaced the destructive `crew restart --hard` recommendation with `docker compose up --build --wait` as part of <CREW-XXX> (this ticket).
   ```

   Substitute the actual ticket key (created in step 7).
3. Update the `## Contents` ToC: remove the entry's link from the Active sub-list, add it to the Resolved sub-list. Use the same anchor slug GitHub generates for the H3.
4. The entry didn't have a `**Ticket:**` line (it was being resolved without ever being individually ticketed), so there's nothing to remove there.

- [ ] **Step 6.6: Commit**

```
git add packages/cli/src/lib/prompts/templates/sandbox-network-note.md \
        packages/cli/src/lib/prompts/__snapshots__/ \
        docs/followups.md
git commit -m "fix(prompts): replace destructive crew restart --hard recovery + add form-sensitivity warning"
```

---

## Task 7: End-to-end validation

**Files:** none modified at the repo level. The agent-shell verification touches a follow-up worktree's state.

- [ ] **Step 7.1: Sandbox-bypass sanity check (manual)**

From the canonical worktree, in a sandboxed Bash call:

```
npm run test:e2e --workspace=crew-dashboard 2>&1 | head -40
```

Expected: Playwright launches and either runs against the worktree docker stack at the resolved `APP_URL`, or fails with a real error (e.g. dashboard not responding) — **not** with the 120s `webServer` timeout pattern that PR #133 hit. The signature of success is "Playwright produces test output, hitting `localhost:<worktree-port>`."

If the run fails because the worktree's docker stack isn't up, `docker compose up --build --wait` from the worktree first, then re-run.

- [ ] **Step 7.2: Verify the new preflight enforces the new entry shape**

Temporarily revert `<repo>/.claude/settings.json` to the old exact-match form (e.g. just `"npm run test:e2e"` without the glob suffix). Don't commit.

```
crew run <some-test-key>
```

Expected: wrapper preflight fails with `missing: "npm run test:e2e*"` (or whatever the canonical form is) and a `reason` that names the source clause. Restore the file:

```
git checkout -- .claude/settings.json
```

- [ ] **Step 7.3: Integration gate — dispatch a follow-up agent**

Pick a small dashboard-touching ticket (or rerun the e2e suite via `crew restart CREW-103 --soft` if the worktree still exists). Dispatch and confirm:

- The agent runs `npm run test:e2e` (in any of the common forms — bare or with `--workspace=`).
- Playwright targets the worktree's `APP_URL` from `.env` (look for the resolved port in the test output, not `5173`).
- The suite executes against the docker dashboard and either passes (best case) or fails on real test assertions (acceptable — proves the runner reached the dashboard, which is the gate this plan exists to close).
- The agent's PR test plan checks the `npm run test:e2e` checkbox without an asterisk.

Capture the dispatched agent's transcript path and link it in the PR description for this ticket.

---

## Self-review checklist (run after writing the plan)

- Spec §2.1 item 1 (empirical wildcard probe): Task 1. ✓
- Spec §2.1 item 2 (`.claude/settings.json` glob form + verify-excluded-commands update): Task 2. ✓
- Spec §2.1 item 3 (drop `webServer` block): Task 3. ✓
- Spec §2.1 item 4 (`.env` resolver in `playwright.config.ts`): Task 4. ✓
- Spec §2.1 item 5 (PLAYWRIGHT_BASE_URL plumbing in run.ts + fix-pr.ts): Task 5. ✓
- Spec §2.1 item 6 (sandbox-network-note.md two-edit update + atomic followup resolution): Task 6. ✓
- Spec §3.1 (probe gate before settings change): Task 1 → Task 2 ordering. ✓
- Spec §3.2 (settings + preflight update): Task 2. ✓
- Spec §3.3 (drop webServer with inline rationale): Task 3 Step 3.1 includes the comment. ✓
- Spec §3.4 (.env reader implementation): Task 4 Step 4.3 with full code. ✓
- Spec §3.5 (run.ts plumbing): Task 5 Step 5.1; fix-pr parallel handled in Step 5.2. ✓
- Spec §3.6 (prompt updates): Task 6 Steps 6.1 (destructive recovery) + 6.2 (form-sensitivity). ✓
- Spec §3.7 (followup entry resolution): Task 6 Step 6.5. ✓
- Spec §5.1 (unit tests): Task 2 Step 2.3 (regression for legacy form), Task 4 Step 4.1 (resolver tests). ✓
- Spec §5.2 (empirical / sandbox-bypass): Task 1 (probe) + Task 7 Step 7.1. ✓
- Spec §5.3 (integration gate): Task 7 Step 7.3. ✓
- No `TBD` / `TODO` / `implement later` placeholders. The `<chosen-form>` and `<CREW-XXX>` references are intentional substitutions filled at execution time, with the source explicitly named (Task 1 for the form, ticket-creation for the key). ✓
- Type consistency: `RequiredEntry` shape consistent in Task 2; `resolveBaseURL` signature matches between test (Step 4.1) and impl (Step 4.3). ✓
