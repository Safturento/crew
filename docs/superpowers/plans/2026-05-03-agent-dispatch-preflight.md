# Agent dispatch preflight — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a startup preflight that runs before every agent dispatch (`crew run` / `resume` / `fix-pr`) to catch (a) unreachable worktree-app URLs, (b) `.claude/settings.json` missing required `excludedCommands` entries, before the agent spawns. Eliminates the KAN-17/KAN-12 misdiagnosis pattern where agents flail against missing infrastructure or sandbox boundaries and ship PRs with confusing claims.

**Architecture:** New `packages/cli/src/lib/preflight/` directory with two checks (`probeAppUrls`, `verifyExcludedCommands`) and an orchestrator (`runPreflight`). Wired into the existing shared `prepareAgentEnvironment` in `lib/run/agent-environment.ts` so all three agent-dispatching commands inherit it. In `fresh` mode, `prepareAgentEnvironment` starts docker bringup in the background and returns immediately today — preflight changes that to `await` the bringup before probing. Hard-aborts on any check failure with structured stderr output.

**Tech Stack:** TypeScript, vitest, undici (already a transitive dep via Node's native `fetch`), execa. Existing CLI conventions in `packages/cli/src/`.

**Source spec:** [`docs/superpowers/specs/2026-05-03-agent-dispatch-preflight-design.md`](../specs/2026-05-03-agent-dispatch-preflight-design.md). Read it before starting.

---

**Ticket carve-up** (Epic + 3 child tickets):

| Ticket | Tasks | Notes |
|---|---|---|
| **A — Preflight scaffold + dispatch integration** | Tasks 1–4 | Lays the orchestrator + types + wires it into `prepareAgentEnvironment`. With no checks registered yet, the orchestrator no-ops cleanly. Blocks B and C. |
| **B — Check 1: app-URL reachability probe** | Tasks 5–8 | Probe + retry + per-URL skip rules. Wires probe into orchestrator. Independent of C. |
| **C — Check 2 + Check 3: sandbox config awareness** | Tasks 9–13 | `excludedCommands` verifier + generalized prompt note. Independent of B. |

Tickets B and C run in parallel after A merges.

**Naming conventions used throughout:**

- Files: `probe-app-urls.ts`, `verify-excluded-commands.ts`, `run-preflight.ts`, `types.ts` (all in `packages/cli/src/lib/preflight/`)
- Types: `PreflightCheck`, `PreflightError`, `PreflightCheckResult`
- Orchestrator entry point: `runPreflight(opts: RunPreflightOptions): Promise<void>` — throws `PreflightError` on failure (matches existing `prepareAgentEnvironment` throw-on-error style).
- Test file pattern: same directory, `.test.ts` suffix.

---

## Ticket A — Preflight scaffold + dispatch integration

### Task 1: Types and orchestrator skeleton

**Goal:** Introduce the `PreflightCheck` shape, `PreflightError` class, and a no-op `runPreflight` orchestrator. With no checks registered yet, calling it should always resolve cleanly.

**Files:**

- Create: `packages/cli/src/lib/preflight/types.ts`
- Create: `packages/cli/src/lib/preflight/run-preflight.ts`
- Create: `packages/cli/src/lib/preflight/run-preflight.test.ts`
- Create: `packages/cli/src/lib/preflight/index.ts`

- [ ] **Step 1: Write failing orchestrator tests**

Create `packages/cli/src/lib/preflight/run-preflight.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { ProjectConfig } from 'crew-shared';
import { runPreflight } from './run-preflight.js';
import { PreflightError } from './types.js';
import type { PreflightCheck } from './types.js';

const baseConfig: ProjectConfig = {
  canonical_worktree: 'main',
  db_clone: {
    postgres_service: 'postgres',
    postgres_user: 'postgres',
    postgres_database: 'postgres',
    required_tables: [],
    exclude_tables: ['kysely_migration*'],
  },
} as ProjectConfig;

describe('runPreflight', () => {
  it('resolves cleanly when no checks are registered', async () => {
    await expect(
      runPreflight({ config: baseConfig, worktree: '/tmp/wt', checks: [] }),
    ).resolves.toBeUndefined();
  });

  it('runs each registered check in order', async () => {
    const order: string[] = [];
    const a: PreflightCheck = {
      name: 'a',
      run: async () => {
        order.push('a');
      },
    };
    const b: PreflightCheck = {
      name: 'b',
      run: async () => {
        order.push('b');
      },
    };

    await runPreflight({ config: baseConfig, worktree: '/tmp/wt', checks: [a, b] });
    expect(order).toEqual(['a', 'b']);
  });

  it('throws PreflightError on first failing check and stops', async () => {
    const aRan = vi.fn();
    const bRan = vi.fn();
    const cRan = vi.fn();

    const a: PreflightCheck = {
      name: 'a',
      run: async () => {
        aRan();
      },
    };
    const b: PreflightCheck = {
      name: 'b',
      run: async () => {
        bRan();
        throw new PreflightError('b', 'b failed', 'fix b');
      },
    };
    const c: PreflightCheck = { name: 'c', run: cRan };

    await expect(
      runPreflight({ config: baseConfig, worktree: '/tmp/wt', checks: [a, b, c] }),
    ).rejects.toBeInstanceOf(PreflightError);

    expect(aRan).toHaveBeenCalled();
    expect(bRan).toHaveBeenCalled();
    expect(cRan).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=crew-cli -- run-preflight`
Expected: FAIL — modules don't exist yet.

- [ ] **Step 3: Implement types**

Create `packages/cli/src/lib/preflight/types.ts`:

```ts
import type { ProjectConfig } from 'crew-shared';

export interface PreflightCheckContext {
  config: ProjectConfig;
  worktree: string;
}

export interface PreflightCheck {
  /** Stable identifier used in error messages and logs. */
  name: string;
  run: (ctx: PreflightCheckContext) => Promise<void>;
}

/**
 * Thrown by checks when verification fails. The orchestrator catches and
 * re-throws this so the calling command (run / resume / fix-pr) can render
 * the structured remediation output before exiting.
 */
export class PreflightError extends Error {
  constructor(
    public readonly checkName: string,
    public readonly headline: string,
    public readonly remediation: string,
    public readonly details: Record<string, string> = {},
  ) {
    super(`preflight ${checkName}: ${headline}`);
    this.name = 'PreflightError';
  }
}
```

- [ ] **Step 4: Implement orchestrator**

Create `packages/cli/src/lib/preflight/run-preflight.ts`:

```ts
import type { ProjectConfig } from 'crew-shared';
import type { PreflightCheck } from './types.js';

export interface RunPreflightOptions {
  config: ProjectConfig;
  worktree: string;
  checks: PreflightCheck[];
}

export async function runPreflight(opts: RunPreflightOptions): Promise<void> {
  for (const check of opts.checks) {
    await check.run({ config: opts.config, worktree: opts.worktree });
  }
}
```

Create `packages/cli/src/lib/preflight/index.ts`:

```ts
export { runPreflight } from './run-preflight.js';
export { PreflightError } from './types.js';
export type { PreflightCheck, PreflightCheckContext, RunPreflightOptions } from './types.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- run-preflight`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/preflight/types.ts \
        packages/cli/src/lib/preflight/run-preflight.ts \
        packages/cli/src/lib/preflight/run-preflight.test.ts \
        packages/cli/src/lib/preflight/index.ts
git commit -m "feat(preflight): scaffold orchestrator + types"
```

---

### Task 2: Render `PreflightError` to structured stderr

**Goal:** Add a `renderPreflightError` helper that produces the structured stderr output specified in §4.1 / §4.2 of the spec. The orchestrator throws — the calling command will catch and render. Implementing rendering as a standalone helper keeps tests cheap and separates "what failed" from "how it's printed."

**Files:**

- Create: `packages/cli/src/lib/preflight/render-error.ts`
- Create: `packages/cli/src/lib/preflight/render-error.test.ts`
- Modify: `packages/cli/src/lib/preflight/index.ts` (add export)

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/lib/preflight/render-error.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PreflightError } from './types.js';
import { renderPreflightError } from './render-error.js';

describe('renderPreflightError', () => {
  it('renders headline, details, and fix lines', () => {
    const err = new PreflightError(
      'app-url-reachability',
      'app URL unreachable',
      'crew restart <KEY> --hard, or investigate the bringup log',
      {
        url: 'https://localhost:17253 (from [playwright].app_url)',
        tried: '5 attempts × exponential backoff, all ECONNREFUSED',
      },
    );

    const out = renderPreflightError(err);

    expect(out).toContain('✗ preflight: app URL unreachable');
    expect(out).toContain('   url:    https://localhost:17253 (from [playwright].app_url)');
    expect(out).toContain('   tried:  5 attempts × exponential backoff, all ECONNREFUSED');
    expect(out).toContain('   fix:    crew restart <KEY> --hard, or investigate the bringup log');
  });

  it('renders without a details section when no details provided', () => {
    const err = new PreflightError('x', 'something failed', 'do thing');
    const out = renderPreflightError(err);
    expect(out).toContain('✗ preflight: something failed');
    expect(out).toContain('   fix:    do thing');
  });

  it('right-pads detail keys for column alignment', () => {
    const err = new PreflightError('x', 'h', 'f', { a: '1', longer: '2' });
    const out = renderPreflightError(err);
    // Both lines should align — keys padded to the longest key length + 1 colon.
    const aLine = out.split('\n').find((l) => l.includes('a:'));
    const longerLine = out.split('\n').find((l) => l.includes('longer:'));
    expect(aLine).toBeTruthy();
    expect(longerLine).toBeTruthy();
    // Index of value should match between the two lines.
    expect(aLine!.indexOf('1')).toBe(longerLine!.indexOf('2'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=crew-cli -- render-error`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement renderer**

Create `packages/cli/src/lib/preflight/render-error.ts`:

```ts
import type { PreflightError } from './types.js';

export function renderPreflightError(err: PreflightError): string {
  const lines: string[] = [];
  lines.push(`✗ preflight: ${err.headline}`);

  const detailKeys = Object.keys(err.details);
  if (detailKeys.length > 0) {
    const maxKeyLen = Math.max(...detailKeys.map((k) => k.length));
    for (const key of detailKeys) {
      const padded = `${key}:`.padEnd(maxKeyLen + 2);
      lines.push(`   ${padded}${err.details[key]}`);
    }
  }

  lines.push(`   ${'fix:'.padEnd(detailKeysMaxLen(detailKeys))}${err.remediation}`);
  return lines.join('\n');
}

function detailKeysMaxLen(keys: string[]): number {
  if (keys.length === 0) return 5; // 'fix:' (4) + 1 space → 5
  const maxKeyLen = Math.max(...keys.map((k) => k.length));
  return maxKeyLen + 2;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- render-error`
Expected: PASS (3 tests).

- [ ] **Step 5: Add export and commit**

Modify `packages/cli/src/lib/preflight/index.ts` — add:

```ts
export { renderPreflightError } from './render-error.js';
```

```bash
git add packages/cli/src/lib/preflight/render-error.ts \
        packages/cli/src/lib/preflight/render-error.test.ts \
        packages/cli/src/lib/preflight/index.ts
git commit -m "feat(preflight): structured error renderer"
```

---

### Task 3: Block on docker bringup completion in `prepareAgentEnvironment`

**Goal:** In `mode: 'fresh'`, today `startDockerBringup` returns a background `ResultPromise` that's stashed on the result and never awaited. Preflight needs the stack actually up before probing, so we await it here. The caller (run.ts) loses the ability to stream the agent in parallel with bringup, but that's the right tradeoff per spec §3.4.

**Files:**

- Modify: `packages/cli/src/lib/run/agent-environment.ts`
- Modify: `packages/cli/src/lib/run/agent-environment.test.ts`

- [ ] **Step 1: Add a failing test to `agent-environment.test.ts`**

The file already declares `startBringupMock = vi.mocked(startDockerBringup)` (around line 20) and a `configWithDocker` fixture used by the existing fresh-mode tests. Reuse them. Append to the file:

```ts
describe('prepareAgentEnvironment — fresh mode awaits docker bringup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMock.mockResolvedValue({ rc: 0, logPath: '/tmp/install.log' });
  });

  it('awaits the bringup process before returning', async () => {
    const events: string[] = [];
    startBringupMock.mockImplementation(() => {
      const proc = (async () => {
        await new Promise((r) => setTimeout(r, 10));
        events.push('docker-done');
        return { exitCode: 0 };
      })() as unknown as ReturnType<typeof startDockerBringup>;
      return proc;
    });

    await prepareAgentEnvironment({
      config: configWithDocker,
      worktree: '/tmp/wt',
      key: 'KAN-1',
      env: process.env,
      mode: 'fresh',
    });
    events.push('returned');
    expect(events).toEqual(['docker-done', 'returned']);
  });

  it('throws when fresh-mode bringup exits non-zero', async () => {
    startBringupMock.mockReturnValue(
      Promise.resolve({ exitCode: 2 }) as unknown as ReturnType<typeof startDockerBringup>,
    );

    await expect(
      prepareAgentEnvironment({
        config: configWithDocker,
        worktree: '/tmp/wt',
        key: 'KAN-1',
        env: process.env,
        mode: 'fresh',
      }),
    ).rejects.toThrow(/docker bringup failed/i);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=crew-cli -- agent-environment`
Expected: FAIL — bringup is currently fire-and-forget; the new tests' ordering and rejection assertions don't hold.

- [ ] **Step 3: Modify `prepareAgentEnvironment` to await bringup**

In `packages/cli/src/lib/run/agent-environment.ts`, replace the `if (mode === 'fresh')` branch (current lines 51–59):

```ts
  if (mode === 'fresh') {
    const proc = startDockerBringup({
      config,
      worktree,
      key,
      skip: Boolean(skipDocker),
      env,
    });
    if (proc) {
      console.log(pc.dim('→ awaiting docker bringup…'));
      const finished = await proc;
      if (finished.exitCode !== 0) {
        throw new Error(
          `docker bringup failed (rc=${finished.exitCode}). Check /tmp/crew-docker-${key}.log`,
        );
      }
      result.dockerProcess = proc;
    }
  } else if (!skipDocker && agentNeedsAppRunning(config) && config.docker) {
```

Note: `result.dockerProcess` is preserved on the result for backwards compat with any caller that inspects it, but it's now an already-resolved promise.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- agent-environment`
Expected: PASS — both new tests + all existing tests.

- [ ] **Step 5: Run full CLI test suite to catch regressions**

Run: `npm test --workspace=crew-cli`
Expected: PASS — no other test relied on bringup being non-blocking.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/run/agent-environment.ts \
        packages/cli/src/lib/run/agent-environment.test.ts
git commit -m "feat(run): await docker bringup in prepareAgentEnvironment fresh mode"
```

---

### Task 4: Wire `runPreflight` into `prepareAgentEnvironment`

**Goal:** Call the (still-empty) preflight orchestrator from `prepareAgentEnvironment` after docker bringup completes and after Playwright browser install succeeds. With no checks registered, this is a no-op pass — but it locks the call site so Tickets B and C only need to register checks.

**Files:**

- Modify: `packages/cli/src/lib/run/agent-environment.ts`
- Modify: `packages/cli/src/lib/run/agent-environment.test.ts`
- Create: `packages/cli/src/lib/preflight/build-checks.ts`
- Create: `packages/cli/src/lib/preflight/build-checks.test.ts`

- [ ] **Step 1: Write failing tests for `buildPreflightChecks`**

Create `packages/cli/src/lib/preflight/build-checks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { ProjectConfig } from 'crew-shared';
import { buildPreflightChecks } from './build-checks.js';

const baseConfig: ProjectConfig = {
  canonical_worktree: 'main',
  db_clone: {
    postgres_service: 'postgres',
    postgres_user: 'postgres',
    postgres_database: 'postgres',
    required_tables: [],
    exclude_tables: ['kysely_migration*'],
  },
} as ProjectConfig;

describe('buildPreflightChecks', () => {
  it('returns an empty array when no checks apply', () => {
    expect(buildPreflightChecks(baseConfig)).toEqual([]);
  });

  // Tickets B and C will each add tests here when their checks are registered.
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=crew-cli -- build-checks`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `buildPreflightChecks`**

Create `packages/cli/src/lib/preflight/build-checks.ts`:

```ts
import type { ProjectConfig } from 'crew-shared';
import type { PreflightCheck } from './types.js';

/**
 * Decides which preflight checks apply to a given project config.
 * Tickets B and C extend this as their checks land.
 */
export function buildPreflightChecks(_config: ProjectConfig): PreflightCheck[] {
  return [];
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- build-checks`
Expected: PASS.

- [ ] **Step 5: Add a test asserting `prepareAgentEnvironment` calls preflight**

Add to `agent-environment.test.ts`:

```ts
describe('prepareAgentEnvironment — preflight integration', () => {
  it('runs preflight after docker bringup completes', async () => {
    const events: string[] = [];

    vi.mocked(startDockerBringup).mockImplementation(() => {
      const proc = Promise.resolve({ exitCode: 0 }) as unknown as ResultPromise;
      events.push('docker-started');
      return proc;
    });

    // Spy on runPreflight via module mock — register a fake check that records.
    vi.spyOn(buildChecksModule, 'buildPreflightChecks').mockReturnValue([
      {
        name: 'fake',
        run: async () => {
          events.push('preflight-ran');
        },
      },
    ]);

    await prepareAgentEnvironment({
      config: configWithDocker,
      worktree: '/tmp/wt',
      key: 'KAN-1',
      env: process.env,
      mode: 'fresh',
    });

    expect(events).toEqual(['docker-started', 'preflight-ran']);
  });

  it('propagates PreflightError out of prepareAgentEnvironment', async () => {
    vi.mocked(startDockerBringup).mockImplementation(
      () => Promise.resolve({ exitCode: 0 }) as unknown as ResultPromise,
    );

    vi.spyOn(buildChecksModule, 'buildPreflightChecks').mockReturnValue([
      {
        name: 'fail',
        run: async () => {
          throw new PreflightError('fail', 'forced failure', 'fix it');
        },
      },
    ]);

    await expect(
      prepareAgentEnvironment({
        config: configWithDocker,
        worktree: '/tmp/wt',
        key: 'KAN-1',
        env: process.env,
        mode: 'fresh',
      }),
    ).rejects.toBeInstanceOf(PreflightError);
  });
});
```

Imports at top of file:

```ts
import * as buildChecksModule from '../preflight/build-checks.js';
import { PreflightError } from '../preflight/index.js';
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `npm test --workspace=crew-cli -- agent-environment`
Expected: FAIL — preflight isn't wired up yet.

- [ ] **Step 7: Wire preflight into `prepareAgentEnvironment`**

In `packages/cli/src/lib/run/agent-environment.ts`, add imports at the top:

```ts
import { runPreflight } from '../preflight/index.js';
import { buildPreflightChecks } from '../preflight/build-checks.js';
```

At the end of `prepareAgentEnvironment`, after the playwright install block (after current line 77), add:

```ts
  await runPreflight({
    config,
    worktree,
    checks: buildPreflightChecks(config),
  });

  return result;
```

(Replace the existing `return result;` with the block above.)

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- agent-environment`
Expected: PASS — both new integration tests + existing tests.

- [ ] **Step 9: Render preflight errors at the call sites**

The throw bubbles up to `run.ts` / `resume.ts` / `fix-pr.ts`. They each have a `try { await prepareAgentEnvironment(...) } catch (err) { ... }` shape today (or wrap in a top-level catch). Find each, and inside the catch:

```ts
import { PreflightError, renderPreflightError } from '../lib/preflight/index.js';

// inside the catch block:
if (err instanceof PreflightError) {
  process.stderr.write(renderPreflightError(err) + '\n');
  process.exit(1);
}
// fall through to existing error handling
```

Confirm with: `grep -n "prepareAgentEnvironment" packages/cli/src/commands/{run,resume,fix-pr}.ts` and add the rendering at each call site's catch.

- [ ] **Step 10: Run full CLI suite**

Run: `npm test --workspace=crew-cli && npm run typecheck --workspace=crew-cli`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add packages/cli/src/lib/preflight/build-checks.ts \
        packages/cli/src/lib/preflight/build-checks.test.ts \
        packages/cli/src/lib/run/agent-environment.ts \
        packages/cli/src/lib/run/agent-environment.test.ts \
        packages/cli/src/commands/run.ts \
        packages/cli/src/commands/resume.ts \
        packages/cli/src/commands/fix-pr.ts
git commit -m "feat(preflight): wire orchestrator into prepareAgentEnvironment"
```

---

## Ticket B — Check 1: app-URL reachability probe

### Task 5: `probeUrl` helper with retries

**Goal:** A standalone `probeUrl(url, opts)` that does a single fetch with self-signed-cert tolerance, retries on network failure with exponential backoff, succeeds on any HTTP response. Pure function — easy to test, doesn't know about the orchestrator.

**Files:**

- Create: `packages/cli/src/lib/preflight/probe-url.ts`
- Create: `packages/cli/src/lib/preflight/probe-url.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/lib/preflight/probe-url.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { probeUrl } from './probe-url.js';

describe('probeUrl', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns reachable: true on first successful HTTP response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 200 }));
    const result = await probeUrl('https://localhost:17253', { delays: [0] });
    expect(result.reachable).toBe(true);
    expect(result.attempts).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('treats 4xx and 5xx as reachable (server is up)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 503 }));
    const result = await probeUrl('https://localhost:17253', { delays: [0] });
    expect(result.reachable).toBe(true);
  });

  it('retries on ECONNREFUSED then succeeds', async () => {
    let calls = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      calls++;
      if (calls < 3) throw Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' });
      return new Response('', { status: 200 });
    });

    const result = await probeUrl('https://localhost:17253', { delays: [0, 0, 0] });
    expect(result.reachable).toBe(true);
    expect(result.attempts).toBe(3);
  });

  it('returns reachable: false after all retries exhausted', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    );
    const result = await probeUrl('https://localhost:17253', { delays: [0, 0, 0] });
    expect(result.reachable).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.lastError?.code).toBe('ECONNREFUSED');
  });

  it('uses default exponential backoff when delays not provided', async () => {
    // Don't actually delay in the test — just assert the constants.
    const { DEFAULT_RETRY_DELAYS_MS } = await import('./probe-url.js');
    expect(DEFAULT_RETRY_DELAYS_MS).toEqual([1000, 2000, 4000, 8000, 16000]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=crew-cli -- probe-url`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `probeUrl`**

Create `packages/cli/src/lib/preflight/probe-url.ts`:

```ts
import { Agent } from 'undici';

/**
 * 1s, 2s, 4s, 8s, 16s = 31s worst case across 5 attempts.
 * Conservative-by-design — mirrors the docker-daemon-check timeout
 * (3s → 15s) layered on app-process boot inside the container.
 */
export const DEFAULT_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];

export interface ProbeUrlOptions {
  /** Per-attempt delay schedule in ms. Length determines max attempts. */
  delays?: number[];
}

export interface ProbeResult {
  reachable: boolean;
  attempts: number;
  lastError?: NodeJS.ErrnoException;
}

const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

export async function probeUrl(url: string, opts: ProbeUrlOptions = {}): Promise<ProbeResult> {
  const delays = opts.delays ?? DEFAULT_RETRY_DELAYS_MS;
  let lastError: NodeJS.ErrnoException | undefined;

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, delays[attempt - 1]));
    }
    try {
      // @ts-expect-error — undici's `dispatcher` option exists at runtime
      // when using node-native fetch but isn't in the global RequestInit type.
      await fetch(url, { dispatcher: insecureAgent, method: 'HEAD' });
      return { reachable: true, attempts: attempt + 1 };
    } catch (err) {
      lastError = err as NodeJS.ErrnoException;
    }
  }

  return { reachable: false, attempts: delays.length, lastError };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- probe-url`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/preflight/probe-url.ts \
        packages/cli/src/lib/preflight/probe-url.test.ts
git commit -m "feat(preflight): probeUrl helper with exponential-backoff retries"
```

---

### Task 6: `probeAppUrls` check — per-URL skip rules

**Goal:** The Check 1 implementation. Decides which URLs to probe based on config (per-URL skip rules from spec §4.1), calls `probeUrl` for each, throws `PreflightError` on first failure with the structured details.

**Files:**

- Create: `packages/cli/src/lib/preflight/probe-app-urls.ts`
- Create: `packages/cli/src/lib/preflight/probe-app-urls.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/lib/preflight/probe-app-urls.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import type { ProjectConfig } from 'crew-shared';
import { probeAppUrlsCheck } from './probe-app-urls.js';
import { PreflightError } from './types.js';
import * as probeUrlModule from './probe-url.js';

const cfgWithDockerAndPlaywright = (overrides: Partial<ProjectConfig> = {}): ProjectConfig =>
  ({
    canonical_worktree: 'main',
    db_clone: {
      postgres_service: 'postgres',
      postgres_user: 'postgres',
      postgres_database: 'postgres',
      required_tables: [],
      exclude_tables: [],
    },
    docker: { canonical_worktree: 'main', http_port_base: 8000, https_port_base: 8400, postgres_port_base: 15400 },
    playwright: { app_url: 'https://localhost:17253', authored: { enabled: true, tests_dir: 'tests/e2e', test_command: 'npm run test:e2e', verify_after_run: false, verify_max_attempts: 2 } },
    ...overrides,
  } as ProjectConfig);

describe('probeAppUrlsCheck', () => {
  it('skips when no docker and no playwright/bruno_smoke', async () => {
    const probeSpy = vi.spyOn(probeUrlModule, 'probeUrl');
    const check = probeAppUrlsCheck();
    await check.run({
      config: { canonical_worktree: 'main', db_clone: {} as never } as ProjectConfig,
      worktree: '/tmp/wt',
    });
    expect(probeSpy).not.toHaveBeenCalled();
  });

  it('skips playwright url when start_command is set', async () => {
    const probeSpy = vi.spyOn(probeUrlModule, 'probeUrl').mockResolvedValue({ reachable: true, attempts: 1 });
    const check = probeAppUrlsCheck();
    await check.run({
      config: cfgWithDockerAndPlaywright({
        playwright: {
          app_url: 'https://localhost:17253',
          start_command: 'npm run dev',
          authored: { enabled: true, tests_dir: 'tests/e2e', test_command: 'npm run test:e2e', verify_after_run: false, verify_max_attempts: 2 },
        },
      } as Partial<ProjectConfig>),
      worktree: '/tmp/wt',
    });
    expect(probeSpy).not.toHaveBeenCalled();
  });

  it('probes playwright app_url when docker configured + no start_command', async () => {
    const probeSpy = vi
      .spyOn(probeUrlModule, 'probeUrl')
      .mockResolvedValue({ reachable: true, attempts: 1 });
    const check = probeAppUrlsCheck();
    await check.run({ config: cfgWithDockerAndPlaywright(), worktree: '/tmp/wt' });
    expect(probeSpy).toHaveBeenCalledWith('https://localhost:17253', expect.any(Object));
  });

  it('throws PreflightError with structured details when probe fails', async () => {
    vi.spyOn(probeUrlModule, 'probeUrl').mockResolvedValue({
      reachable: false,
      attempts: 5,
      lastError: Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }),
    });

    const check = probeAppUrlsCheck();
    try {
      await check.run({ config: cfgWithDockerAndPlaywright(), worktree: '/tmp/wt' });
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PreflightError);
      const pe = err as PreflightError;
      expect(pe.headline).toBe('app URL unreachable');
      expect(pe.details.url).toBe('https://localhost:17253 (from [playwright].app_url)');
      expect(pe.details.tried).toContain('5 attempts');
      expect(pe.details.tried).toContain('ECONNREFUSED');
      expect(pe.remediation).toContain('crew restart');
    }
  });

  it('probes bruno_smoke base_url when configured + docker', async () => {
    const probeSpy = vi
      .spyOn(probeUrlModule, 'probeUrl')
      .mockResolvedValue({ reachable: true, attempts: 1 });
    const check = probeAppUrlsCheck();
    await check.run({
      config: {
        ...cfgWithDockerAndPlaywright(),
        bruno_smoke: { enabled: true, base_url: 'https://localhost:17253', collection_dir: 'bruno' },
      } as ProjectConfig,
      worktree: '/tmp/wt',
    });
    // Probed twice — once for playwright, once for bruno (same URL in this fixture, but the call shape verifies the source attribution).
    expect(probeSpy).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test --workspace=crew-cli -- probe-app-urls`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `probeAppUrlsCheck`**

Create `packages/cli/src/lib/preflight/probe-app-urls.ts`:

```ts
import type { ProjectConfig } from 'crew-shared';
import { probeUrl, DEFAULT_RETRY_DELAYS_MS } from './probe-url.js';
import { PreflightError, type PreflightCheck } from './types.js';

interface UrlToProbe {
  url: string;
  source: string; // human-readable attribution, e.g. "[playwright].app_url"
}

function urlsToProbe(config: ProjectConfig): UrlToProbe[] {
  const out: UrlToProbe[] = [];

  if (config.playwright && config.docker && !config.playwright.start_command) {
    out.push({ url: config.playwright.app_url, source: '[playwright].app_url' });
  }

  if (config.bruno_smoke && config.docker) {
    out.push({ url: config.bruno_smoke.base_url, source: '[bruno_smoke].base_url' });
  }

  return out;
}

export function probeAppUrlsCheck(): PreflightCheck {
  return {
    name: 'app-url-reachability',
    run: async ({ config }) => {
      const urls = urlsToProbe(config);
      for (const { url, source } of urls) {
        const result = await probeUrl(url);
        if (!result.reachable) {
          const errCode = result.lastError?.code ?? 'unknown';
          throw new PreflightError(
            'app-url-reachability',
            'app URL unreachable',
            'crew restart <KEY> --hard, or investigate the bringup log',
            {
              url: `${url} (from ${source})`,
              tried: `${result.attempts} attempts × exponential backoff, all ${errCode}`,
              likely: 'docker compose stack failed to come up — check /tmp/crew-docker-<KEY>.log',
            },
          );
        }
      }
    },
  };
}
```

Note on the URL placeholders: `<KEY>` is a literal placeholder in the message — the orchestrator doesn't have access to the ticket key (preflight runs at the config level). The agent / user reading the error substitutes mentally. If a future iteration wants real key substitution, thread `key` through `PreflightCheckContext`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- probe-app-urls`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/preflight/probe-app-urls.ts \
        packages/cli/src/lib/preflight/probe-app-urls.test.ts
git commit -m "feat(preflight): probeAppUrlsCheck — per-URL skip rules + structured failure"
```

---

### Task 7: Register `probeAppUrlsCheck` in `buildPreflightChecks`

**Goal:** Wire the check into the orchestrator's check list.

**Files:**

- Modify: `packages/cli/src/lib/preflight/build-checks.ts`
- Modify: `packages/cli/src/lib/preflight/build-checks.test.ts`

- [ ] **Step 1: Add failing test**

Add to `build-checks.test.ts`:

```ts
import { probeAppUrlsCheck } from './probe-app-urls.js';

describe('buildPreflightChecks — Check 1', () => {
  it('includes app-url-reachability when [docker] is configured', () => {
    const config = {
      ...baseConfig,
      docker: { canonical_worktree: 'main', http_port_base: 8000, https_port_base: 8400, postgres_port_base: 15400 },
      playwright: { app_url: 'https://localhost:17253', authored: { enabled: true, tests_dir: 'tests/e2e', test_command: 'npm run test:e2e', verify_after_run: false, verify_max_attempts: 2 } },
    } as ProjectConfig;
    const checks = buildPreflightChecks(config);
    expect(checks.some((c) => c.name === 'app-url-reachability')).toBe(true);
  });

  it('omits app-url-reachability when no docker', () => {
    const checks = buildPreflightChecks(baseConfig);
    expect(checks.some((c) => c.name === 'app-url-reachability')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=crew-cli -- build-checks`
Expected: FAIL.

- [ ] **Step 3: Update `buildPreflightChecks`**

Modify `packages/cli/src/lib/preflight/build-checks.ts`:

```ts
import type { ProjectConfig } from 'crew-shared';
import { probeAppUrlsCheck } from './probe-app-urls.js';
import type { PreflightCheck } from './types.js';

export function buildPreflightChecks(config: ProjectConfig): PreflightCheck[] {
  const checks: PreflightCheck[] = [];

  // Check 1: only relevant when there's a docker stack to probe.
  if (config.docker && (config.playwright || config.bruno_smoke)) {
    checks.push(probeAppUrlsCheck());
  }

  return checks;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- build-checks`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/preflight/build-checks.ts \
        packages/cli/src/lib/preflight/build-checks.test.ts
git commit -m "feat(preflight): register probeAppUrlsCheck in buildPreflightChecks"
```

---

### Task 8: Manual smoke — Check 1

**Goal:** Sanity check the failure path against a real (or simulated) unreachable URL. Not a unit test — a five-minute manual verification before the ticket merges.

- [ ] **Step 1: Pick a fixture project with `[docker]` + `[playwright]`**

Recipes is the canonical one. Pick a ticket that's already shipped (so the worktree state isn't sensitive) — e.g., a `crew run KAN-99` against an unused KAN ticket, OR run a fresh worktree with docker bringup intentionally broken.

To force the failure: edit the worktree's `.env` after bringup and stop the docker stack manually (`docker compose down`), then run `crew resume KAN-99` — `ensureStackRunning` will try to bring it up but if the compose file has been corrupted it'll fail. Easier: pick an unused port for the app URL in the project TOML and run `crew run` — Caddy will bind elsewhere, the app port has nothing on it.

- [ ] **Step 2: Run `crew run <KEY>` and observe the error output**

Expected: `crew run` aborts before `claude` spawns, with stderr matching:

```
✗ preflight: app URL unreachable
   url:    https://localhost:<port> (from [playwright].app_url)
   tried:  5 attempts × exponential backoff, all ECONNREFUSED
   likely: docker compose stack failed to come up — check /tmp/crew-docker-<KEY>.log
   fix:    crew restart <KEY> --hard, or investigate the bringup log
```

Worktree should still exist (preflight failure doesn't tear it down). Cleanup: `crew restart <KEY> --hard`.

- [ ] **Step 3: Document the manual verification result**

Add a one-line note to the ticket comment / PR description: "Manual smoke verified on 2026-MM-DD against <fixture>: preflight aborts with structured stderr before agent spawn." No commit; this is a verification record, not code.

---

## Ticket C — Check 2 + Check 3: sandbox config awareness

### Task 9: `verifyExcludedCommandsCheck` — read `.claude/settings.json`, assert entries

**Goal:** Check 2 implementation. Reads `<worktree>/.claude/settings.json`, asserts the smoke/e2e commands are present in `sandbox.excludedCommands`. Throws `PreflightError` on missing file or missing entry.

**Files:**

- Create: `packages/cli/src/lib/preflight/verify-excluded-commands.ts`
- Create: `packages/cli/src/lib/preflight/verify-excluded-commands.test.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/cli/src/lib/preflight/verify-excluded-commands.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ProjectConfig } from 'crew-shared';
import { verifyExcludedCommandsCheck } from './verify-excluded-commands.js';
import { PreflightError } from './types.js';

describe('verifyExcludedCommandsCheck', () => {
  let worktree: string;

  beforeEach(async () => {
    worktree = await mkdtemp(path.join(tmpdir(), 'crew-preflight-'));
  });

  afterEach(async () => {
    await rm(worktree, { recursive: true, force: true });
  });

  async function writeSettings(json: unknown): Promise<void> {
    await mkdir(path.join(worktree, '.claude'), { recursive: true });
    await writeFile(path.join(worktree, '.claude', 'settings.json'), JSON.stringify(json));
  }

  const cfgWithBruno: ProjectConfig = {
    canonical_worktree: 'main',
    db_clone: { postgres_service: 'postgres', postgres_user: 'postgres', postgres_database: 'postgres', required_tables: [], exclude_tables: [] },
    bruno_smoke: { enabled: true, base_url: 'https://localhost:17253', collection_dir: 'bruno' },
  } as ProjectConfig;

  const cfgWithAuthoredPlaywright: ProjectConfig = {
    canonical_worktree: 'main',
    db_clone: { postgres_service: 'postgres', postgres_user: 'postgres', postgres_database: 'postgres', required_tables: [], exclude_tables: [] },
    playwright: {
      app_url: 'https://localhost:17253',
      authored: { enabled: true, tests_dir: 'tests/e2e', test_command: 'npm run test:e2e', verify_after_run: false, verify_max_attempts: 2 },
    },
  } as ProjectConfig;

  it('passes when all required entries are present', async () => {
    await writeSettings({
      sandbox: {
        excludedCommands: ['npm run bruno:smoke', 'npm run test:e2e'],
      },
    });

    const cfg = { ...cfgWithBruno, ...cfgWithAuthoredPlaywright } as ProjectConfig;
    const check = verifyExcludedCommandsCheck();
    await expect(check.run({ config: cfg, worktree })).resolves.toBeUndefined();
  });

  it('throws when settings.json is missing', async () => {
    const check = verifyExcludedCommandsCheck();
    try {
      await check.run({ config: cfgWithBruno, worktree });
      expect.fail('expected throw');
    } catch (err) {
      expect(err).toBeInstanceOf(PreflightError);
      const pe = err as PreflightError;
      expect(pe.headline).toContain('missing required excludedCommands');
      expect(pe.details.path).toContain('(file not found)');
    }
  });

  it('throws when bruno smoke entry is missing', async () => {
    await writeSettings({ sandbox: { excludedCommands: [] } });
    const check = verifyExcludedCommandsCheck();
    try {
      await check.run({ config: cfgWithBruno, worktree });
      expect.fail('expected throw');
    } catch (err) {
      const pe = err as PreflightError;
      expect(pe.details.missing).toBe('"npm run bruno:smoke"');
    }
  });

  it('throws when authored playwright test_command is missing', async () => {
    await writeSettings({ sandbox: { excludedCommands: ['npm run bruno:smoke'] } });
    const check = verifyExcludedCommandsCheck();
    const cfg = { ...cfgWithBruno, ...cfgWithAuthoredPlaywright } as ProjectConfig;
    try {
      await check.run({ config: cfg, worktree });
      expect.fail('expected throw');
    } catch (err) {
      const pe = err as PreflightError;
      expect(pe.details.missing).toBe('"npm run test:e2e"');
    }
  });

  it('respects custom test_command from config', async () => {
    await writeSettings({
      sandbox: { excludedCommands: ['npm run bruno:smoke', 'npm run e2e:custom'] },
    });
    const cfg = {
      ...cfgWithAuthoredPlaywright,
      playwright: {
        app_url: 'https://localhost:17253',
        authored: {
          enabled: true,
          tests_dir: 'tests/e2e',
          test_command: 'npm run e2e:custom',
          verify_after_run: false,
          verify_max_attempts: 2,
        },
      },
    } as ProjectConfig;
    const check = verifyExcludedCommandsCheck();
    await expect(check.run({ config: cfg, worktree })).resolves.toBeUndefined();
  });

  it('skips when neither block is enabled', async () => {
    // No settings.json file present, but no checks needed either.
    const cfg: ProjectConfig = {
      canonical_worktree: 'main',
      db_clone: { postgres_service: 'postgres', postgres_user: 'postgres', postgres_database: 'postgres', required_tables: [], exclude_tables: [] },
    } as ProjectConfig;
    const check = verifyExcludedCommandsCheck();
    await expect(check.run({ config: cfg, worktree })).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=crew-cli -- verify-excluded-commands`
Expected: FAIL — module doesn't exist.

- [ ] **Step 3: Implement `verifyExcludedCommandsCheck`**

Create `packages/cli/src/lib/preflight/verify-excluded-commands.ts`:

```ts
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectConfig } from 'crew-shared';
import { PreflightError, type PreflightCheck } from './types.js';

const BRUNO_COMMAND = 'npm run bruno:smoke';

interface RequiredEntry {
  command: string;
  reason: string;
}

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

  return out;
}

export function verifyExcludedCommandsCheck(): PreflightCheck {
  return {
    name: 'excluded-commands',
    run: async ({ config, worktree }) => {
      const required = requiredEntries(config);
      if (required.length === 0) return;

      const settingsPath = path.join(worktree, '.claude', 'settings.json');

      let raw: string;
      try {
        raw = await readFile(settingsPath, 'utf8');
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          throw new PreflightError(
            'excluded-commands',
            '.claude/settings.json missing required excludedCommands',
            'add the entry to sandbox.excludedCommands and commit',
            {
              missing: required.map((r) => `"${r.command}"`).join(', '),
              path: `${settingsPath} (file not found)`,
            },
          );
        }
        throw err;
      }

      const parsed = JSON.parse(raw) as {
        sandbox?: { excludedCommands?: string[] };
      };
      const excluded = parsed.sandbox?.excludedCommands ?? [];

      // Conservative-match: require exact string equality. The Claude Code
      // sandbox may match prefix-style (empirically uncertain), so a working
      // user prefix would still pass at runtime — we just don't trust looser
      // matches in this verification.
      for (const entry of required) {
        if (!excluded.includes(entry.command)) {
          throw new PreflightError(
            'excluded-commands',
            '.claude/settings.json missing required excludedCommands',
            'add the entry to sandbox.excludedCommands and commit',
            {
              missing: `"${entry.command}"`,
              reason: `required because ${entry.reason}`,
              path: settingsPath,
            },
          );
        }
      }
    },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- verify-excluded-commands`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/preflight/verify-excluded-commands.ts \
        packages/cli/src/lib/preflight/verify-excluded-commands.test.ts
git commit -m "feat(preflight): verifyExcludedCommandsCheck — sandbox config verification"
```

---

### Task 10: Register `verifyExcludedCommandsCheck` in `buildPreflightChecks`

**Goal:** Wire Check 2 into the orchestrator's check list.

**Files:**

- Modify: `packages/cli/src/lib/preflight/build-checks.ts`
- Modify: `packages/cli/src/lib/preflight/build-checks.test.ts`

- [ ] **Step 1: Add failing tests**

Add to `build-checks.test.ts`:

```ts
import { verifyExcludedCommandsCheck } from './verify-excluded-commands.js';

describe('buildPreflightChecks — Check 2', () => {
  it('includes excluded-commands when bruno_smoke enabled', () => {
    const config = {
      ...baseConfig,
      bruno_smoke: { enabled: true, base_url: 'https://localhost:17253', collection_dir: 'bruno' },
    } as ProjectConfig;
    const checks = buildPreflightChecks(config);
    expect(checks.some((c) => c.name === 'excluded-commands')).toBe(true);
  });

  it('includes excluded-commands when playwright.authored enabled', () => {
    const config = {
      ...baseConfig,
      playwright: {
        app_url: 'https://localhost:17253',
        authored: { enabled: true, tests_dir: 'tests/e2e', test_command: 'npm run test:e2e', verify_after_run: false, verify_max_attempts: 2 },
      },
    } as ProjectConfig;
    const checks = buildPreflightChecks(config);
    expect(checks.some((c) => c.name === 'excluded-commands')).toBe(true);
  });

  it('omits excluded-commands when neither block enabled', () => {
    const checks = buildPreflightChecks(baseConfig);
    expect(checks.some((c) => c.name === 'excluded-commands')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test --workspace=crew-cli -- build-checks`
Expected: FAIL.

- [ ] **Step 3: Update `buildPreflightChecks`**

Modify `packages/cli/src/lib/preflight/build-checks.ts`:

```ts
import type { ProjectConfig } from 'crew-shared';
import { probeAppUrlsCheck } from './probe-app-urls.js';
import { verifyExcludedCommandsCheck } from './verify-excluded-commands.js';
import type { PreflightCheck } from './types.js';

export function buildPreflightChecks(config: ProjectConfig): PreflightCheck[] {
  const checks: PreflightCheck[] = [];

  if (config.docker && (config.playwright || config.bruno_smoke)) {
    checks.push(probeAppUrlsCheck());
  }

  if (config.bruno_smoke?.enabled || config.playwright?.authored?.enabled) {
    checks.push(verifyExcludedCommandsCheck());
  }

  return checks;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- build-checks`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/preflight/build-checks.ts \
        packages/cli/src/lib/preflight/build-checks.test.ts
git commit -m "feat(preflight): register verifyExcludedCommandsCheck in buildPreflightChecks"
```

---

### Task 11: Generalized `sandbox-network-note.md` template

**Goal:** Check 3. Add a new prompt partial that explains sandboxed-vs-un-sandboxed network reachability so the agent stops misreading "bruno succeeded" as "the app port is up." Renders when at least one of `[playwright]` / `[bruno_smoke]` is configured.

**Files:**

- Create: `packages/cli/src/lib/prompts/templates/sandbox-network-note.md`
- Create: `packages/cli/src/lib/prompts/sandbox-network-note.ts` (shared builder, used here and in Task 12)
- Modify: `packages/cli/src/lib/prompts/ticket.ts`
- Modify: `packages/cli/src/lib/prompts/templates/ticket.md`
- Modify: `packages/cli/src/lib/prompts/builders.test.ts`

- [ ] **Step 1: Create the new template file**

Create `packages/cli/src/lib/prompts/templates/sandbox-network-note.md`:

```md

## Sandboxed-curl is misleading

Your Bash tool runs in a sandbox with its own loopback, isolated from the host's. Direct `curl` / `wget` / Node `fetch` calls from your shell to **{{appUrl}}** will always return `ECONNREFUSED` — that is **not** evidence the stack is down. Crew has whitelisted `{{whitelistedCommands}}` to run un-sandboxed, and those are the only valid reachability tests for the docker stack.

If `npm run bruno:smoke` succeeds, that confirms the daemon is up — but it says nothing about the worktree app port. If `{{e2eCommand}}` fails with `ECONNREFUSED`, that's a real signal: the docker stack is not serving at the expected port. Investigate `/tmp/crew-docker-{{key}}.log` and consider `crew restart {{key}} --hard`.
```

- [ ] **Step 2: Add a `sandboxNetworkBlock` placeholder to `ticket.md`**

Open `packages/cli/src/lib/prompts/templates/ticket.md`. Find the location near the existing `{{playwrightBlock}}` / `{{brunoSmokeBlock}}` placeholders (run `grep -n "playwrightBlock\|brunoSmokeBlock" packages/cli/src/lib/prompts/templates/ticket.md` to locate). Add a new line after them:

```
{{sandboxNetworkBlock}}
```

- [ ] **Step 3: Create the shared builder module**

Create `packages/cli/src/lib/prompts/sandbox-network-note.ts`:

```ts
import { render } from './render.js';

export interface SandboxNetworkNoteOptions {
  key: string;
  /** [playwright].app_url or [bruno_smoke].base_url, whichever is set. */
  appUrl?: string;
  /** Set when [bruno_smoke] is configured. */
  hasBrunoSmoke: boolean;
  /** Set when [playwright].authored is configured. */
  authoredTestCommand?: string;
}

export function buildSandboxNetworkBlock(opts: SandboxNetworkNoteOptions): string {
  if (!opts.hasBrunoSmoke && !opts.authoredTestCommand) return '';

  const whitelisted: string[] = [];
  if (opts.hasBrunoSmoke) whitelisted.push('npm run bruno:smoke');
  if (opts.authoredTestCommand) whitelisted.push(opts.authoredTestCommand);

  return render('sandbox-network-note', {
    appUrl: opts.appUrl ?? '',
    whitelistedCommands: whitelisted.map((c) => `\`${c}\``).join(' and '),
    e2eCommand: opts.authoredTestCommand ?? 'npm run test:e2e',
    key: opts.key,
  });
}
```

- [ ] **Step 4: Thread it through `buildTicketPrompt`**

Modify `packages/cli/src/lib/prompts/ticket.ts`. Add the import:

```ts
import { buildSandboxNetworkBlock } from './sandbox-network-note.js';
```

In the `render('ticket', { ... })` call, add:

```ts
    sandboxNetworkBlock: buildSandboxNetworkBlock({
      key: opts.key,
      appUrl: opts.playwright?.appUrl ?? opts.brunoSmoke?.baseUrl,
      hasBrunoSmoke: Boolean(opts.brunoSmoke),
      authoredTestCommand: opts.playwright?.authored?.testCommand,
    }),
```

- [ ] **Step 5: Update `builders.test.ts` to assert the new block**

Find the existing tests in `packages/cli/src/lib/prompts/builders.test.ts` (run `grep -n "buildTicketPrompt\|describe" packages/cli/src/lib/prompts/builders.test.ts` to locate). Add:

```ts
describe('buildTicketPrompt — sandbox-network-note', () => {
  it('renders the sandbox-network-note when playwright is configured', () => {
    const out = buildTicketPrompt({
      key: 'KAN-17',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'safturento.atlassian.net',
      playwright: {
        appUrl: 'https://localhost:17253',
        authored: { testsDir: 'tests/e2e', testCommand: 'npm run test:e2e' },
      },
    });
    expect(out).toContain('Sandboxed-curl is misleading');
    expect(out).toContain('https://localhost:17253');
    expect(out).toContain('`npm run test:e2e`');
    expect(out).toContain('crew restart KAN-17 --hard');
  });

  it('omits the block when neither playwright nor bruno_smoke is configured', () => {
    const out = buildTicketPrompt({
      key: 'KAN-17',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'safturento.atlassian.net',
    });
    expect(out).not.toContain('Sandboxed-curl is misleading');
  });

  it('lists both whitelisted commands when bruno + playwright both configured', () => {
    const out = buildTicketPrompt({
      key: 'KAN-17',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'safturento.atlassian.net',
      playwright: {
        appUrl: 'https://localhost:17253',
        authored: { testsDir: 'tests/e2e', testCommand: 'npm run test:e2e' },
      },
      brunoSmoke: { baseUrl: 'https://localhost:17253', envName: 'KAN-17', collectionDir: 'bruno', hasSmokeUser: false },
    });
    expect(out).toContain('`npm run bruno:smoke` and `npm run test:e2e`');
  });
});
```

- [ ] **Step 6: Run tests to verify they fail (template/builder not wired yet)**

Run: `npm test --workspace=crew-cli -- builders`
Expected: FAIL on the new tests.

- [ ] **Step 7: Update the snapshot if `builders.test.ts` uses snapshot tests**

Run: `npm test --workspace=crew-cli -- builders -u` to regenerate the existing snapshot (the new block is added to the rendered output).

Inspect the snapshot diff (`git diff packages/cli/src/lib/prompts/__snapshots__/builders.test.ts.snap`) — confirm only the new sandbox-network-note section was added; nothing else moved.

- [ ] **Step 8: Run tests to verify they pass**

Run: `npm test --workspace=crew-cli -- builders`
Expected: PASS.

- [ ] **Step 9: Run full CLI test suite**

Run: `npm test --workspace=crew-cli && npm run typecheck --workspace=crew-cli`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/cli/src/lib/prompts/templates/sandbox-network-note.md \
        packages/cli/src/lib/prompts/sandbox-network-note.ts \
        packages/cli/src/lib/prompts/templates/ticket.md \
        packages/cli/src/lib/prompts/ticket.ts \
        packages/cli/src/lib/prompts/builders.test.ts \
        packages/cli/src/lib/prompts/__snapshots__/builders.test.ts.snap
git commit -m "feat(prompts): generalized sandbox-network-note for ticket prompts"
```

---

### Task 12: Apply the same prompt note to `resume.md` and `fix-pr.md`

**Goal:** `resume` and `fix-pr` build prompts independently from `ticket.md`. The same sandbox-network-note belongs in both. Reuse `buildSandboxNetworkBlock` from Task 11.

**Files:**

- Modify: `packages/cli/src/lib/prompts/templates/resume.md`
- Modify: `packages/cli/src/lib/prompts/templates/fix-pr.md`
- Modify: the resume + fix-pr builder `.ts` files (locate per Step 1)
- Modify: `packages/cli/src/lib/prompts/builders.test.ts`

- [ ] **Step 1: Locate the resume/fix-pr builder code**

Run: `grep -rn "render('resume'\|render('fix-pr'" packages/cli/src/lib/prompts/ --include="*.ts"`

Note the file(s) containing `buildResumePrompt` and the fix-pr equivalent — the structure mirrors `buildTicketPrompt` in `ticket.ts`.

- [ ] **Step 2: Add `{{sandboxNetworkBlock}}` placeholders to both templates**

In `templates/resume.md` and `templates/fix-pr.md`, add `{{sandboxNetworkBlock}}` near the existing playwright/bruno block placeholders. Mirror the location used in `ticket.md` (Task 11 step 2).

- [ ] **Step 3: Wire the shared helper into both builders**

In each of the resume + fix-pr builder TS files, add the import:

```ts
import { buildSandboxNetworkBlock } from './sandbox-network-note.js';
```

In each builder's `render(...)` call, add the same field structure as Task 11 step 4:

```ts
    sandboxNetworkBlock: buildSandboxNetworkBlock({
      key: opts.key,
      appUrl: opts.playwright?.appUrl ?? opts.brunoSmoke?.baseUrl,
      hasBrunoSmoke: Boolean(opts.brunoSmoke),
      authoredTestCommand: opts.playwright?.authored?.testCommand,
    }),
```

If either builder uses different option-property names than `buildTicketPrompt`, adapt the field accesses but keep `buildSandboxNetworkBlock`'s argument shape unchanged.

- [ ] **Step 4: Add builder tests**

In `builders.test.ts`, mirror the three Task-11 step-5 test cases (rendered when configured, omitted when not, lists both commands when both configured) for `buildResumePrompt` and the fix-pr equivalent. Total: 6 new tests (3 × 2 builders).

- [ ] **Step 5: Run tests + update snapshots**

```bash
npm test --workspace=crew-cli -- builders -u
git diff packages/cli/src/lib/prompts/__snapshots__/builders.test.ts.snap
npm test --workspace=crew-cli
npm run typecheck --workspace=crew-cli
```

Expected: snapshot diff shows only the new sandbox-network-note section in resume + fix-pr snapshots; all tests + typecheck PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/prompts/
git commit -m "feat(prompts): apply sandbox-network-note to resume + fix-pr"
```

---

### Task 13: Manual smoke — Check 2 + Check 3

**Goal:** Verify the failure path and the prompt rendering against a real run.

- [ ] **Step 1: Manual Check 2 verification**

In a fresh worktree (or local clone) of any project with `[bruno_smoke]` or `[playwright].authored` enabled, temporarily remove an entry from `.claude/settings.json`'s `sandbox.excludedCommands`. Run `crew run <KEY>`.

Expected stderr (and non-zero exit):

```
✗ preflight: .claude/settings.json missing required excludedCommands
   missing: "npm run test:e2e"
   reason:  required because [playwright].authored.enabled = true
   path:    /home/safturento/Repos/<project>/.claude/settings.json
   fix:     add the entry to sandbox.excludedCommands and commit
```

Restore the entry. Re-run — preflight passes, agent spawns.

- [ ] **Step 2: Manual Check 3 verification**

In the same project, run `crew run <KEY>` (now passing preflight). Once the agent spawns, inspect the prompt that was given to it (transcript log under the worktree's `.claude/logs/` or wherever the run captures it). Confirm the "Sandboxed-curl is misleading" section is present with the correct app URL and ticket key substitutions.

Same for `crew resume <KEY>` and `crew fix-pr <KEY>` — confirm both prompts include the section.

- [ ] **Step 3: Document the verification**

Add a note to the ticket / PR description: "Manual smoke verified on 2026-MM-DD: Check 2 aborts with structured stderr; Check 3 prompt section present in run / resume / fix-pr prompts." No commit.

---

## Closing — All tickets

- [ ] **Final: end-to-end verification on a real ticket**

After A, B, C are all merged: dispatch a real ticket via `crew run <NEW-KEY>` against a healthy project. Assert it dispatches normally — preflight passes, agent spawns. Watch for any unexpected friction (slow startup, false positives) that surfaces only at integration scale and ticket as followups.

- [ ] **Final: PR for each ticket goes through normal review**

The user merges each ticket's PR after review. No automated merge.
