# `crew fix-pr` — defer env prep to the dispatched agent — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the dead-zone where `crew fix-pr` wedges on `prepareAgentEnvironment` against a worktree too stale to boot, by deferring docker bringup + playwright install to the dispatched agent's Step 0.5 and demoting `verify-excluded-commands` to a non-fatal warning.

**Architecture:** Wrapper-side change in `packages/cli/src/commands/fix-pr.ts` removes the blocking `prepareAgentEnvironment` call in resume mode and replaces it with a slim `runResumePreflight` helper that only runs `verify-excluded-commands` (non-fatal). The agent's prompt gains a new Step 0.5 in `rebase-preamble.md` that runs `docker compose up --build --wait` (always) and `npx playwright install chromium` (when playwright is enabled). The `crew run` (fresh) path is untouched — it already does background docker bringup and doesn't have this dead-zone.

**Tech Stack:** TypeScript, Vitest, npm workspaces. Reuses existing `resolveAppUrl`, `playwrightEnabled`, `verifyExcludedCommandsCheck`, `buildRebasePreamble`, `buildFixPrPrompt`. No new dependencies.

**Source spec:** [`docs/superpowers/specs/2026-05-07-fix-pr-defer-env-prep-to-agent-design.md`](../specs/2026-05-07-fix-pr-defer-env-prep-to-agent-design.md). Read it before starting.

**Ticket carve-up:** Single ticket. The plan is small and tightly coupled — splitting wouldn't shorten the critical path.

**File changes summary:**

| File | Change |
| --- | --- |
| `packages/cli/src/lib/prompts/templates/rebase-preamble.md` | Replace "Hot-reload should pick up…" paragraph with new Step 0.5 section. Add `{{playwrightInstall}}` template var. |
| `packages/cli/src/lib/prompts/rebase-preamble.ts` | Add `playwrightEnabled: boolean` option, convert to `playwrightInstall` template string. |
| `packages/cli/src/lib/prompts/fix-pr.ts` | Add `playwrightEnabled: boolean` option, propagate to `buildRebasePreamble`. |
| `packages/cli/src/lib/prompts/builders.test.ts` | Tests for the new option in both builders. |
| `packages/cli/src/lib/preflight/run-resume-preflight.ts` | New: non-fatal `verify-excluded-commands`-only preflight for fix-pr resume mode. |
| `packages/cli/src/lib/preflight/run-resume-preflight.test.ts` | New: unit tests. |
| `packages/cli/src/lib/preflight/index.ts` | Re-export `runResumePreflight`. |
| `packages/cli/src/commands/fix-pr.ts` | Drop `prepareAgentEnvironment` call. Compute `resolvedAppUrl` directly, run `runResumePreflight`, pass `playwrightEnabled` to prompt builder. |

---

## Task 1: Step 0.5 in `rebase-preamble`

**Files:**

- Modify: `packages/cli/src/lib/prompts/templates/rebase-preamble.md`
- Modify: `packages/cli/src/lib/prompts/rebase-preamble.ts`
- Test: `packages/cli/src/lib/prompts/builders.test.ts`

- [ ] **Step 1.1: Write failing tests for the new builder option**

Append to `packages/cli/src/lib/prompts/builders.test.ts`, inside the existing `describe('buildRebasePreamble', ...)` block (around line 769 — keep the trailing `})`):

```ts
  it('always includes Step 0.5 with `docker compose up --build --wait`', () => {
    const out = buildRebasePreamble({ key: 'CREW-130', baseBranch: 'main' });
    expect(out).toContain('## Step 0.5');
    expect(out).toContain('docker compose up --build --wait');
  });

  it('includes `npx playwright install chromium` in Step 0.5 when playwrightEnabled is true', () => {
    const out = buildRebasePreamble({
      key: 'CREW-130',
      baseBranch: 'main',
      playwrightEnabled: true,
    });
    expect(out).toContain('npx playwright install chromium');
  });

  it('omits `npx playwright install chromium` when playwrightEnabled is false (or omitted)', () => {
    const omitted = buildRebasePreamble({ key: 'CREW-130', baseBranch: 'main' });
    const explicit = buildRebasePreamble({
      key: 'CREW-130',
      baseBranch: 'main',
      playwrightEnabled: false,
    });
    expect(omitted).not.toContain('npx playwright install chromium');
    expect(explicit).not.toContain('npx playwright install chromium');
    expect(omitted).toBe(explicit);
  });

  it('drops the old "Hot-reload should pick up" recovery paragraph in favour of Step 0.5', () => {
    const out = buildRebasePreamble({ key: 'CREW-130', baseBranch: 'main' });
    expect(out).not.toContain('Hot-reload should pick up');
    expect(out).not.toContain('If the daemon stack is wedged after you finish resolving');
  });
```

- [ ] **Step 1.2: Run the new tests; expect all four to fail**

Run from repo root:

```
npm run test:run --workspace=crew-cli -- packages/cli/src/lib/prompts/builders.test.ts
```

Expected: the four new tests fail. The first two fail because Step 0.5 doesn't exist yet; the third fails because `playwrightEnabled` isn't a valid option (or is silently ignored); the fourth fails because the "Hot-reload should pick up" paragraph still exists.

- [ ] **Step 1.3: Update the template — replace the recovery paragraph with Step 0.5**

Replace `packages/cli/src/lib/prompts/templates/rebase-preamble.md` lines 22-28 (the `Hot-reload should pick up the resolved source automatically. If the daemon stack is wedged…` paragraph through to `…those wipe in-progress work.`) with:

```markdown
## Step 0.5: bring up the environment (do this AFTER Step 0 succeeds)

Now that the source is current with `origin/{{baseBranch}}`, bring up the docker stack and any browser dependencies:

```
docker compose up --build --wait{{playwrightInstall}}
```

If `docker compose up` fails for environmental reasons (host docker daemon down, port collision with another stack, missing CLI tools) — i.e., a failure that rebasing would not have fixed — abort with a clear message: document the blocker in `docs/tickets/{{key}}.md` "Open questions" and exit WITHOUT applying the review feedback. Do not push.

**Do not reset the worktree or use any "hard" reset command** — those wipe in-progress work.
```

After the edit the template's tail should be:

```markdown
## Step 0.5: bring up the environment (do this AFTER Step 0 succeeds)

Now that the source is current with `origin/{{baseBranch}}`, bring up the docker stack and any browser dependencies:

```
docker compose up --build --wait{{playwrightInstall}}
```

If `docker compose up` fails for environmental reasons (host docker daemon down, port collision with another stack, missing CLI tools) — i.e., a failure that rebasing would not have fixed — abort with a clear message: document the blocker in `docs/tickets/{{key}}.md` "Open questions" and exit WITHOUT applying the review feedback. Do not push.

**Do not reset the worktree or use any "hard" reset command** — those wipe in-progress work.

---

```

(Step 0 stays unchanged. The trailing `---` separator stays.)

- [ ] **Step 1.4: Update the builder to accept `playwrightEnabled` and emit the template var**

Replace `packages/cli/src/lib/prompts/rebase-preamble.ts` in full:

```ts
import { render } from './render.js';

export interface BuildRebasePreambleOptions {
  key: string;
  baseBranch: string;
  /**
   * When true, Step 0.5 includes `npx playwright install chromium` after the
   * `docker compose up` line. Default false.
   */
  playwrightEnabled?: boolean;
}

/**
 * The rebase-first preamble that fix-pr (and any future caller that resumes
 * an in-flight branch) prepends to its agent prompt. The agent runs
 * `git fetch origin <base> && git rebase origin/<base>` as Step 0, then
 * `docker compose up --build --wait` as Step 0.5. Idempotent in the
 * no-conflict, stack-already-up case.
 */
export function buildRebasePreamble(opts: BuildRebasePreambleOptions): string {
  const playwrightInstall = opts.playwrightEnabled ? '\nnpx playwright install chromium' : '';
  return render('rebase-preamble', {
    key: opts.key,
    baseBranch: opts.baseBranch,
    playwrightInstall,
  });
}
```

- [ ] **Step 1.5: Run all builder tests; expect green**

```
npm run test:run --workspace=crew-cli -- packages/cli/src/lib/prompts/builders.test.ts
```

Expected: all tests pass, including the four new ones.

- [ ] **Step 1.6: Update existing snapshots if any failed (snapshot-only churn)**

If snapshot tests for `buildFixPrPrompt` failed because the rebase-preamble body changed:

```
npm run test:run --workspace=crew-cli -- packages/cli/src/lib/prompts/builders.test.ts -u
```

Inspect the diff of any updated snapshot under `packages/cli/src/lib/prompts/__snapshots__/` to confirm the only changes are: (a) Step 0.5 added, (b) "Hot-reload should pick up" paragraph removed. No content changes elsewhere.

- [ ] **Step 1.7: Commit**

```
git add packages/cli/src/lib/prompts/templates/rebase-preamble.md \
        packages/cli/src/lib/prompts/rebase-preamble.ts \
        packages/cli/src/lib/prompts/builders.test.ts \
        packages/cli/src/lib/prompts/__snapshots__/
git commit -m "feat(prompts): promote docker-up recovery to first-class Step 0.5 in rebase-preamble"
```

---

## Task 2: Thread `playwrightEnabled` through `buildFixPrPrompt`

**Files:**

- Modify: `packages/cli/src/lib/prompts/fix-pr.ts`
- Test: `packages/cli/src/lib/prompts/builders.test.ts`

- [ ] **Step 2.1: Write failing tests in `buildFixPrPrompt`**

Append to `packages/cli/src/lib/prompts/builders.test.ts`, inside the existing `describe('buildFixPrPrompt', ...)` block (look for it around line 430):

```ts
  it('passes playwrightEnabled through to the rebase preamble', () => {
    const enabled = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: '...',
      feedbackSource: 'stdin',
      playwrightEnabled: true,
    });
    const disabled = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: '...',
      feedbackSource: 'stdin',
      playwrightEnabled: false,
    });
    expect(enabled).toContain('npx playwright install chromium');
    expect(disabled).not.toContain('npx playwright install chromium');
  });

  it('omits the playwright install line when playwrightEnabled is undefined', () => {
    const out = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: '...',
      feedbackSource: 'stdin',
    });
    expect(out).not.toContain('npx playwright install chromium');
  });
```

- [ ] **Step 2.2: Run; expect failure**

```
npm run test:run --workspace=crew-cli -- packages/cli/src/lib/prompts/builders.test.ts
```

Expected: the two new tests fail (`playwrightEnabled` is not a known option and is silently ignored).

- [ ] **Step 2.3: Add `playwrightEnabled` to `BuildFixPrPromptOptions` and propagate**

In `packages/cli/src/lib/prompts/fix-pr.ts`, modify the interface (currently lines 11-19) and the builder body to:

```ts
export interface BuildFixPrPromptOptions {
  key: string;
  feedback: string;
  feedbackSource: string;
  baseBranch?: string;
  playwright?: PlaywrightFixPrOptions;
  brunoSmoke?: BrunoSmokePromptOptions;
  discoveredSkillsBlock?: string;
  /**
   * Whether playwright is enabled for this project. Threaded into the rebase
   * preamble so Step 0.5 includes `npx playwright install chromium`. Default
   * false.
   */
  playwrightEnabled?: boolean;
}

export function buildFixPrPrompt(opts: BuildFixPrPromptOptions): string {
  const baseBranch = opts.baseBranch ?? 'main';
  const rebasePreamble = buildRebasePreamble({
    key: opts.key,
    baseBranch,
    playwrightEnabled: opts.playwrightEnabled ?? false,
  });
  return render('fix-pr', {
    key: opts.key,
    feedback: opts.feedback,
    feedbackSource: opts.feedbackSource,
    rebasePreamble,
    playwrightBlock: buildPlaywrightFixPrBlock(opts.playwright),
    brunoSmokeBlock: buildBrunoSmokeBlock(opts.brunoSmoke),
    sandboxNetworkBlock: buildSandboxNetworkBlock({
      key: opts.key,
      appUrl: opts.playwright?.appUrl ?? opts.brunoSmoke?.baseUrl,
      hasBrunoSmoke: Boolean(opts.brunoSmoke),
      authoredTestCommand: opts.playwright?.authored?.testCommand,
    }),
    discoveredSkillsBlock: opts.discoveredSkillsBlock ?? '',
  });
}
```

(Everything else in the file stays unchanged.)

- [ ] **Step 2.4: Re-run; expect green**

```
npm run test:run --workspace=crew-cli -- packages/cli/src/lib/prompts/builders.test.ts
```

Expected: all tests pass.

- [ ] **Step 2.5: Commit**

```
git add packages/cli/src/lib/prompts/fix-pr.ts \
        packages/cli/src/lib/prompts/builders.test.ts
git commit -m "feat(prompts): thread playwrightEnabled through buildFixPrPrompt to Step 0.5"
```

---

## Task 3: `runResumePreflight` non-fatal helper

**Files:**

- Create: `packages/cli/src/lib/preflight/run-resume-preflight.ts`
- Create: `packages/cli/src/lib/preflight/run-resume-preflight.test.ts`
- Modify: `packages/cli/src/lib/preflight/index.ts`

- [ ] **Step 3.1: Write the failing test**

Create `packages/cli/src/lib/preflight/run-resume-preflight.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProjectConfig } from 'crew-shared';
import { runResumePreflight } from './run-resume-preflight.js';

function makeWorktree(settings: unknown | null): string {
  const dir = mkdtempSync(join(tmpdir(), 'resume-preflight-'));
  if (settings !== null) {
    mkdirSync(join(dir, '.claude'), { recursive: true });
    writeFileSync(join(dir, '.claude', 'settings.json'), JSON.stringify(settings));
  }
  return dir;
}

const baseConfig: ProjectConfig = {
  name: 'test',
  repo_path: '/x',
  jira: { project_key: 'X', site: 'https://x.atlassian.net' },
  github: { repo: 'owner/repo' },
  bruno_smoke: { enabled: true, base_url: 'http://localhost:3000', collection_dir: 'bruno' },
} as ProjectConfig;

describe('runResumePreflight', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let dir: string | undefined;

  beforeEach(() => {
    warnSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = undefined;
  });

  it('returns without throwing when excluded commands are correctly listed', async () => {
    dir = makeWorktree({
      sandbox: { excludedCommands: ['npm run bruno:smoke'] },
    });

    await expect(runResumePreflight({ config: baseConfig, worktree: dir })).resolves.toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('warns to stderr but does not throw when an entry is missing', async () => {
    dir = makeWorktree({ sandbox: { excludedCommands: [] } });

    await expect(runResumePreflight({ config: baseConfig, worktree: dir })).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
    const written = warnSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(written).toMatch(/excluded-commands/);
    expect(written).toMatch(/warning/i);
    expect(written).toMatch(/agent's rebase will pick this up/i);
  });

  it('warns but does not throw when settings.json is missing entirely', async () => {
    dir = makeWorktree(null);

    await expect(runResumePreflight({ config: baseConfig, worktree: dir })).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('is a no-op when no preflight checks apply (config has neither bruno_smoke.enabled nor playwright.authored.enabled)', async () => {
    dir = makeWorktree(null);
    const minimalConfig = { ...baseConfig, bruno_smoke: undefined } as ProjectConfig;

    await expect(runResumePreflight({ config: minimalConfig, worktree: dir })).resolves.toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3.2: Run; expect failure (file does not exist)**

```
npm run test:run --workspace=crew-cli -- packages/cli/src/lib/preflight/run-resume-preflight.test.ts
```

Expected: cannot resolve `./run-resume-preflight.js`.

- [ ] **Step 3.3: Implement `runResumePreflight`**

Create `packages/cli/src/lib/preflight/run-resume-preflight.ts`:

```ts
import type { ProjectConfig } from 'crew-shared';
import pc from 'picocolors';
import { verifyExcludedCommandsCheck } from './verify-excluded-commands.js';
import { renderPreflightError } from './render-error.js';
import { PreflightError } from './types.js';

export interface RunResumePreflightOptions {
  config: ProjectConfig;
  worktree: string;
}

/**
 * Slim resume-mode preflight for `crew fix-pr`. Runs only the checks that the
 * dispatched agent cannot fix on its own (today: `verify-excluded-commands` —
 * the agent likely cannot write `.claude/settings.json` autonomously). Failures
 * are non-fatal: a warning is printed to stderr and the function returns. The
 * agent's Step 0 rebase will pull in any current settings.json from main, so a
 * stale-worktree miss self-heals.
 *
 * Worktree-state-dependent prep (docker bringup, playwright install,
 * URL probes) is owned by the agent's Step 0.5; this helper does NOT run it.
 */
export async function runResumePreflight(opts: RunResumePreflightOptions): Promise<void> {
  const needsCheck =
    Boolean(opts.config.bruno_smoke?.enabled) ||
    Boolean(opts.config.playwright?.authored?.enabled);
  if (!needsCheck) return;

  const check = verifyExcludedCommandsCheck();
  try {
    await check.run({ config: opts.config, worktree: opts.worktree });
  } catch (err) {
    if (err instanceof PreflightError) {
      const rendered = renderPreflightError(err);
      process.stderr.write(
        pc.yellow(
          `\n⚠  preflight warning (non-fatal in resume mode):\n${rendered}\n` +
            `   The agent's rebase will pick this up if main has the correct settings.json.\n\n`,
        ),
      );
      return;
    }
    throw err;
  }
}
```

- [ ] **Step 3.4: Re-export from index**

Add to `packages/cli/src/lib/preflight/index.ts`:

```ts
export { runResumePreflight } from './run-resume-preflight.js';
export type { RunResumePreflightOptions } from './run-resume-preflight.js';
```

After the edit the file should be:

```ts
export { runPreflight } from './run-preflight.js';
export type { RunPreflightOptions } from './run-preflight.js';
export { runResumePreflight } from './run-resume-preflight.js';
export type { RunResumePreflightOptions } from './run-resume-preflight.js';
export { renderPreflightError } from './render-error.js';
export { PreflightError } from './types.js';
export type { PreflightCheck, PreflightCheckContext } from './types.js';
```

- [ ] **Step 3.5: Re-run; expect green**

```
npm run test:run --workspace=crew-cli -- packages/cli/src/lib/preflight/run-resume-preflight.test.ts
```

Expected: all four tests pass.

- [ ] **Step 3.6: Commit**

```
git add packages/cli/src/lib/preflight/run-resume-preflight.ts \
        packages/cli/src/lib/preflight/run-resume-preflight.test.ts \
        packages/cli/src/lib/preflight/index.ts
git commit -m "feat(preflight): runResumePreflight — non-fatal verify-excluded-commands for fix-pr"
```

---

## Task 4: Wire `crew fix-pr` to the new flow

**Files:**

- Modify: `packages/cli/src/commands/fix-pr.ts`

- [ ] **Step 4.1: Update imports**

In `packages/cli/src/commands/fix-pr.ts`, change the imports block (currently lines 17-29) to:

```ts
import { crewDaemonClientFromEnv } from '../lib/daemon-client/index.js';
import { discoverSkills, renderDiscoveredSkillsBlock } from '../lib/prompts/skills.js';
import {
  brunoSmokeOptionsFor,
  needsDockerPorts,
  playwrightFixPrOptsFor,
  readDockerPortsFromEnvFile,
  readEnvBaseMap,
  streamTranscript,
} from '../lib/run/index.js';
import { runResumePreflight } from '../lib/preflight/index.js';
import { playwrightEnabled, resolveAppUrl, type DockerPorts } from '../lib/playwright/index.js';
```

(Drop `prepareAgentEnvironment`. Drop `PreflightError` and `renderPreflightError` imports — no longer used here. Add `playwrightEnabled` and `resolveAppUrl` from playwright. Add `runResumePreflight`.)

- [ ] **Step 4.2: Replace the `prepareAgentEnvironment` block in `runFixPr`**

In `runFixPr` (around lines 196-214), replace:

```ts
  let resolvedAppUrl: string | undefined;
  if (projectConfig) {
    const env = await prepareAgentEnvironment({
      config: projectConfig,
      worktree,
      key,
      env: process.env,
      dockerPorts,
      envVars,
      mode: 'resume',
    }).catch((err: unknown): never => {
      if (err instanceof PreflightError) {
        process.stderr.write(renderPreflightError(err) + '\n');
        process.exit(1);
      }
      throw err;
    });
    resolvedAppUrl = env.resolvedAppUrl;
  }
```

with:

```ts
  let resolvedAppUrl: string | undefined;
  let pwEnabled = false;
  if (projectConfig) {
    pwEnabled = playwrightEnabled(projectConfig);
    if (pwEnabled && projectConfig.playwright) {
      resolvedAppUrl = resolveAppUrl(projectConfig.playwright.app_url, dockerPorts, envVars).raw;
    }
    await runResumePreflight({ config: projectConfig, worktree });
  }
```

- [ ] **Step 4.3: Pass `playwrightEnabled` to the prompt builder**

In the same file, the `buildFixPrPrompt({...})` call (currently around lines 216-223) becomes:

```ts
  const prompt = buildFixPrPrompt({
    key,
    feedback,
    feedbackSource: source,
    playwright: projectConfig ? playwrightFixPrOptsFor(projectConfig, resolvedAppUrl) : undefined,
    brunoSmoke,
    discoveredSkillsBlock: renderDiscoveredSkillsBlock(discoverSkills({ repoPath })),
    playwrightEnabled: pwEnabled,
  });
```

(Adds the trailing `playwrightEnabled: pwEnabled,` line. Everything else stays.)

- [ ] **Step 4.4: Type/lint pass**

```
npm run typecheck --workspace=crew-cli
npm run lint --workspace=crew-cli
```

Expected: clean. If `prepareAgentEnvironment` is reported as an unused export elsewhere, leave it — `crew run` (fresh) still uses it.

- [ ] **Step 4.5: Run all CLI tests**

```
npm run test:run --workspace=crew-cli
```

Expected: green. Of particular note, no test for `runFixPr` should now reference `prepareAgentEnvironment` or `ensureStackRunning`. If a test does (existing, unrelated test), leave it for now; it'll naturally fail and be addressed in Step 4.6.

- [ ] **Step 4.6: Address any test fallout**

If existing fix-pr tests reference the removed wrapper-side env prep, update them to assert the new shape: spawn happens without docker bringup, `runResumePreflight` is called, `playwrightEnabled` is forwarded to `buildFixPrPrompt`. Only address tests that fail; don't proactively rewrite passing ones.

- [ ] **Step 4.7: Commit**

```
git add packages/cli/src/commands/fix-pr.ts \
        packages/cli/src/commands/fix-pr.test.ts
git commit -m "fix(cli): defer fix-pr resume-mode env prep to the dispatched agent (CREW-113)"
```


---

## Task 5: End-to-end validation

**Files:** none modified.

- [ ] **Step 5.1: Reproduce the original wedge**

The failure mode is "worktree's daemon source is too stale to boot." From a clean canonical worktree:

```
git checkout -B test-stale main      # in canonical
# ... add some daemon-breaking commit on main, push, return ...
crew run CREW-113                    # fresh worktree on the broken main
```

Then advance canonical/main further with a daemon fix, leaving the CREW-113 branch behind. Confirm `cd crew-CREW-113 && docker compose up --wait` fails today with `unhealthy daemon`.

(Or just point at the existing CREW-111 worktree if it's still in the failing state — see the spec §1.1.)

- [ ] **Step 5.2: Run `crew fix-pr` against the broken worktree**

```
crew fix-pr CREW-113 -m "rebase and bring the env back up"
```

Expected:

- The wrapper does **NOT** print `→ ensuring docker stack is running…`
- The wrapper does **NOT** wedge on `prepareAgentEnvironment` (no error, no `/tmp/crew-docker-*.log` from the wrapper).
- The agent spawns, runs Step 0 (`git rebase`), runs Step 0.5 (`docker compose up --build --wait`), and the stack comes up.
- Agent then proceeds to apply the feedback message.

Capture the transcript path under `~/.claude/projects/...` for the PR description.

- [ ] **Step 5.3: Regression check on a clean worktree**

```
crew fix-pr <SOME-CLEAN-KEY> -m "no-op test"
```

Expected: agent's Step 0 is a silent no-op (already up-to-date), Step 0.5 runs `docker compose up --wait` and finishes immediately (idempotent — stack already up), feedback work proceeds normally. Wrapper prints no docker-bringup log.

- [ ] **Step 5.4: `verify-excluded-commands` warning path**

In a worktree where `.claude/settings.json` is missing the required excludedCommands entry (artificially remove one, do not commit), run:

```
crew fix-pr <KEY> -m "trigger preflight warning"
```

Expected: stderr shows the yellow `⚠  preflight warning (non-fatal in resume mode)` block. The agent still spawns. After the agent's rebase pulls in the correct settings.json, subsequent npm scripts work normally.

- [ ] **Step 5.5: Commit the e2e evidence (if PR review wants it)**

If the reviewer asks for transcript logs, link the captured paths in the PR description; do not commit them to the repo.

---

## Self-review checklist (run after writing the plan)

- Spec §2.1 in scope items: docker bringup deferred (Tasks 1, 2, 4), playwright install deferred (Tasks 1, 2, 4), `probe-app-urls` dropped (implicit — no longer included in `runResumePreflight`; Task 3), `verify-excluded-commands` non-fatal in resume mode (Task 3), Step 0.5 added (Task 1). ✓
- Spec §3.1 wrapper changes: drop `prepareAgentEnvironment` (Step 4.2), keep dockerPorts/envVars/resolvedAppUrl (Steps 4.1-4.2), slim preflight (Step 4.2). ✓
- Spec §3.2 template change: Step 0.5 unconditional docker, conditional playwright (Steps 1.3-1.4). ✓
- Spec §3.3 builder change: `playwrightEnabled` propagation (Tasks 1, 2). ✓
- Spec §4 failure-mode coverage: e2e validation (Task 5) covers the worktree-stale and clean-worktree cases; warning path covered in Step 5.4. ✓
- Spec §5 testing: unit tests in Tasks 1-3, e2e in Task 5. ✓
- No `TBD` / `TODO` / `implement later` placeholders. ✓
- Type consistency: `playwrightEnabled` is `boolean | undefined` in both option interfaces; `pwEnabled` is `boolean` in the wrapper and matches the parameter type. ✓
