# CREW-146 superpowers-chrome Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire the `superpowers-chrome` MCP server and `browsing` skill into `crew run` dispatches for `[visual_fidelity]` projects, and rewrite `visual-fidelity-check`'s Step 5 as a live-DOM inspection step.

**Architecture:** A single resolver reads the installed `superpowers-chrome` plugin from the user's plugin cache, yielding both the chrome MCP server entrypoint and the `browsing` skill directory. `writeMcpFile` emits a `chrome` server entry alongside `playwright`; `runSkillInjection` copies `browsing` into the worktree at dispatch time. Nothing is vendored into the crew repo — the plugin is the source of truth, resolved at dispatch.

**Tech Stack:** TypeScript, Node ESM, Vitest, execa. The dispatch CLI is `packages/cli` (workspace `crew-cli`).

**Spec:** `docs/superpowers/specs/2026-05-15-crew-146-chrome-integration-replan.md`. Read it before starting — this plan implements its Changes 1–8.

---

## Execution split

This plan covers **one Jira ticket (CREW-146) delivered as two PRs**, because the `crew run`
dispatch sandbox masks crew's own `.claude/skills/` directory read-only:

- **PR A — Autonomous** (Tasks 1–6): all CLI code, the directory rename, and the dispatch-doc
  update. Dispatchable via `crew run CREW-146`.
- **PR B — Interactive** (Tasks 7–8): the `visual-fidelity-check` skill edits under
  `<repo>/.claude/skills/`. Must be authored in an interactive session — **not** `crew run`.

Land PR B first (small, doc-only) so the feature is coherent when PR A merges, but the two are
only loosely coupled and either order works.

## File structure

**PR A — created:**

- `packages/cli/src/lib/mcp-config/resolve-superpowers-chrome.ts` — plugin-cache resolver.
- `packages/cli/src/lib/mcp-config/resolve-superpowers-chrome.test.ts` — its tests.

**PR A — renamed (Task 1):**

- `packages/cli/src/lib/playwright/` → `packages/cli/src/lib/mcp-config/` (whole directory).

**PR A — modified:**

- `packages/cli/src/lib/mcp-config/build-mcp-config.ts` + `.test.ts` + `__snapshots__/` — new `{ playwright?, chrome? }` options shape.
- `packages/cli/src/lib/mcp-config/write-mcp-file.ts` + `.test.ts` — chrome wiring + warning.
- `packages/cli/src/lib/mcp-config/index.ts` — export the new resolver.
- `packages/cli/src/lib/run/skill-injection-step.ts` + `.test.ts` — `browsing` injection branch.
- `packages/cli/src/commands/run.ts` — MCP-write gate, the `browsing` skill source, logging.
- `packages/cli/src/commands/resume.ts` — MCP-write gate.
- ~8 importer files — `lib/playwright/` → `lib/mcp-config/` path updates (Task 1).
- `.agents/dispatch.md` — chrome wiring + `browsing` branch + `covers:` glob.

**PR B — modified:**

- `.claude/skills/visual-fidelity-check/workflow.md` — Step 5 rewrite.
- `.claude/skills/visual-fidelity-check/SKILL.md` — workflow overview + Related skills.

## Commands

- Typecheck: `npm run --workspace=crew-cli typecheck`
- Lint: `npm run lint` (from repo root)
- Test (all cli): `npm run --workspace=crew-cli test:run`
- Test (one file): `npx vitest run <path>` from `packages/cli/`

---

# PR A — Autonomous (Tasks 1–6)

## Task 1: Rename `lib/playwright/` → `lib/mcp-config/`

Pure mechanical refactor, done first so every later task lands in the final directory. No
behavior change; the existing test suite proves it.

**Files:**
- Rename: `packages/cli/src/lib/playwright/` → `packages/cli/src/lib/mcp-config/`
- Modify: every file importing from the old path (~8 — see Step 2).

- [ ] **Step 1: Move the directory**

```bash
git mv packages/cli/src/lib/playwright packages/cli/src/lib/mcp-config
```

- [ ] **Step 2: Update importer paths**

The directory is imported via relative paths ending in `playwright/index.js`. The npm packages
`@playwright/mcp` and `@playwright/test` never appear with an `/index.js` suffix, so this
substring is safe to rewrite:

```bash
grep -rl "playwright/index" packages/cli/src --include="*.ts" \
  | xargs sed -i 's#playwright/index#mcp-config/index#g'
```

- [ ] **Step 3: Catch any deep imports the substring missed**

Run: `npm run --workspace=crew-cli typecheck`
Expected: PASS. If it reports `Cannot find module '.../playwright/<file>'`, that importer used
a deep path — change `playwright/` to `mcp-config/` in that specifier and re-run until clean.

- [ ] **Step 4: Lint and test**

Run: `npm run lint`
Expected: PASS.

Run: `npm run --workspace=crew-cli test:run`
Expected: PASS — same test count as before the move.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(cli): rename lib/playwright/ to lib/mcp-config/

Chrome MCP resolution will live alongside playwright config; the
playwright-only name no longer fits. Directory move + import-path
updates only — no behavior change."
```

## Task 2: `resolveSuperpowersChrome` plugin-cache resolver

**Files:**
- Create: `packages/cli/src/lib/mcp-config/resolve-superpowers-chrome.ts`
- Test: `packages/cli/src/lib/mcp-config/resolve-superpowers-chrome.test.ts`
- Modify: `packages/cli/src/lib/mcp-config/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/lib/mcp-config/resolve-superpowers-chrome.test.ts`:

```ts
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveSuperpowersChrome } from './resolve-superpowers-chrome.js';

const PLUGIN_REL = join(
  '.claude', 'plugins', 'cache', 'superpowers-marketplace', 'superpowers-chrome',
);

/** Build a fake home dir with a superpowers-chrome plugin at the given versions.
 *  `built` controls whether each version has a `mcp/dist/index.js` on disk. */
function makeHome(versions: Array<{ version: string; built: boolean }>): string {
  const home = mkdtempSync(join(tmpdir(), 'crew-spchrome-'));
  for (const { version, built } of versions) {
    const versionDir = join(home, PLUGIN_REL, version);
    mkdirSync(join(versionDir, 'skills', 'browsing'), { recursive: true });
    if (built) {
      mkdirSync(join(versionDir, 'mcp', 'dist'), { recursive: true });
      writeFileSync(join(versionDir, 'mcp', 'dist', 'index.js'), '// server\n');
    }
  }
  return home;
}

describe('resolveSuperpowersChrome', () => {
  it('returns the MCP server path and skills root for an installed, built plugin', () => {
    const home = makeHome([{ version: '2.0.0', built: true }]);
    const result = resolveSuperpowersChrome(home);
    expect(result).toEqual({
      mcpServerPath: join(home, PLUGIN_REL, '2.0.0', 'mcp', 'dist', 'index.js'),
      skillsRoot: join(home, PLUGIN_REL, '2.0.0', 'skills'),
    });
  });

  it('picks the highest semver when multiple versions are installed', () => {
    const home = makeHome([
      { version: '2.0.0', built: true },
      { version: '10.2.1', built: true },
      { version: '2.10.0', built: true },
    ]);
    const result = resolveSuperpowersChrome(home);
    expect(result?.mcpServerPath).toContain(join('superpowers-chrome', '10.2.1', 'mcp'));
  });

  it('returns null when the plugin directory is absent', () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-spchrome-empty-'));
    expect(resolveSuperpowersChrome(home)).toBeNull();
  });

  it('returns null when no child directory is valid semver', () => {
    const home = mkdtempSync(join(tmpdir(), 'crew-spchrome-nosemver-'));
    mkdirSync(join(home, PLUGIN_REL, 'latest'), { recursive: true });
    expect(resolveSuperpowersChrome(home)).toBeNull();
  });

  it('returns null when the highest version has no built mcp/dist/index.js', () => {
    const home = makeHome([{ version: '2.0.0', built: false }]);
    expect(resolveSuperpowersChrome(home)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/mcp-config/resolve-superpowers-chrome.test.ts` (from `packages/cli/`)
Expected: FAIL — `Cannot find module './resolve-superpowers-chrome.js'`.

- [ ] **Step 3: Write the implementation**

Create `packages/cli/src/lib/mcp-config/resolve-superpowers-chrome.ts`:

```ts
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface SuperpowersChromePaths {
  /** Absolute path to the chrome MCP server entrypoint (`mcp/dist/index.js`). */
  mcpServerPath: string;
  /** Absolute path to the plugin's `skills/` directory — the parent of `browsing/`. */
  skillsRoot: string;
}

const PLUGIN_SUBPATH = join(
  '.claude', 'plugins', 'cache', 'superpowers-marketplace', 'superpowers-chrome',
);

/**
 * Resolve the installed superpowers-chrome plugin from the user's plugin cache.
 * Returns the chrome MCP server entrypoint and the plugin's skills root, or
 * `null` when the plugin is absent, has no valid version directory, or has no
 * built MCP server. The browsing skill is useless without the MCP server it
 * drives, so a missing server entrypoint means the whole plugin is treated as
 * unavailable.
 */
export function resolveSuperpowersChrome(
  homeDir: string = homedir(),
): SuperpowersChromePaths | null {
  const pluginDir = join(homeDir, PLUGIN_SUBPATH);
  if (!existsSync(pluginDir)) return null;

  const dirNames = readdirSync(pluginDir).filter((name) => {
    try {
      return statSync(join(pluginDir, name)).isDirectory();
    } catch {
      return false;
    }
  });
  const version = highestSemver(dirNames);
  if (!version) return null;

  const versionDir = join(pluginDir, version);
  const mcpServerPath = join(versionDir, 'mcp', 'dist', 'index.js');
  if (!existsSync(mcpServerPath)) return null;

  return { mcpServerPath, skillsRoot: join(versionDir, 'skills') };
}

/** Pick the highest `MAJOR.MINOR.PATCH` name; ignore non-semver entries. */
function highestSemver(names: string[]): string | null {
  const parsed = names
    .map((name) => {
      const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(name);
      return m
        ? { name, tuple: [Number(m[1]), Number(m[2]), Number(m[3])] as const }
        : null;
    })
    .filter((x): x is { name: string; tuple: readonly [number, number, number] } => x !== null);
  if (parsed.length === 0) return null;
  parsed.sort((a, b) => {
    for (let i = 0; i < 3; i++) {
      if (a.tuple[i] !== b.tuple[i]) return a.tuple[i] - b.tuple[i];
    }
    return 0;
  });
  return parsed[parsed.length - 1].name;
}
```

- [ ] **Step 4: Export it from the barrel**

In `packages/cli/src/lib/mcp-config/index.ts`, add:

```ts
export {
  resolveSuperpowersChrome,
  type SuperpowersChromePaths,
} from './resolve-superpowers-chrome.js';
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run src/lib/mcp-config/resolve-superpowers-chrome.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/mcp-config/resolve-superpowers-chrome.ts \
        packages/cli/src/lib/mcp-config/resolve-superpowers-chrome.test.ts \
        packages/cli/src/lib/mcp-config/index.ts
git commit -m "feat(cli): resolveSuperpowersChrome reads the plugin cache

Resolves the chrome MCP server entrypoint and the browsing skill dir
from the highest-semver superpowers-chrome plugin install. Returns null
when the plugin is absent or its MCP server is unbuilt."
```

## Task 3: `buildMcpConfig` — `{ playwright?, chrome? }` options shape

Refactor `buildMcpConfig` to emit a `playwright` and/or `chrome` server. `writeMcpFile`'s
*internal* call is updated to the new shape in this task; `writeMcpFile`'s *external* signature
is unchanged here (Task 4 handles that), so `run.ts`/`resume.ts` still compile.

**Files:**
- Modify: `packages/cli/src/lib/mcp-config/build-mcp-config.ts`
- Modify: `packages/cli/src/lib/mcp-config/build-mcp-config.test.ts`
- Modify: `packages/cli/src/lib/mcp-config/write-mcp-file.ts` (internal call only)
- Delete + regenerate: `packages/cli/src/lib/mcp-config/__snapshots__/build-mcp-config.test.ts.snap`

- [ ] **Step 1: Rewrite the test for the new shape**

Replace the body of `packages/cli/src/lib/mcp-config/build-mcp-config.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildMcpConfig } from './build-mcp-config.js';

describe('buildMcpConfig', () => {
  it('emits a playwright-only config', () => {
    const config = buildMcpConfig({ playwright: { appUrl: 'https://localhost:18443' } });
    expect(config).toEqual({
      mcpServers: {
        playwright: {
          command: 'npx',
          args: ['-y', '@playwright/mcp@latest', '--headless'],
          env: { CREW_APP_URL: 'https://localhost:18443' },
        },
      },
    });
  });

  it('appends --executable-path when playwright.chromiumPath is supplied', () => {
    const config = buildMcpConfig({
      playwright: {
        appUrl: 'https://localhost:18443',
        chromiumPath: '/cache/ms-playwright/chromium-1217/chrome-linux64/chrome',
      },
    });
    expect(config.mcpServers.playwright.args).toEqual([
      '-y',
      '@playwright/mcp@latest',
      '--headless',
      '--executable-path',
      '/cache/ms-playwright/chromium-1217/chrome-linux64/chrome',
    ]);
  });

  it('emits a chrome-only config', () => {
    const config = buildMcpConfig({ chrome: { mcpServerPath: '/plugins/sp-chrome/2.0.0/mcp/dist/index.js' } });
    expect(config).toEqual({
      mcpServers: {
        chrome: {
          command: 'node',
          args: ['/plugins/sp-chrome/2.0.0/mcp/dist/index.js'],
        },
      },
    });
  });

  it('emits both servers when both opts are supplied', () => {
    const config = buildMcpConfig({
      playwright: { appUrl: 'http://localhost:5173' },
      chrome: { mcpServerPath: '/plugins/sp-chrome/2.0.0/mcp/dist/index.js' },
    });
    expect(Object.keys(config.mcpServers).sort()).toEqual(['chrome', 'playwright']);
  });

  it('emits an empty mcpServers map when neither opt is supplied', () => {
    expect(buildMcpConfig({})).toEqual({ mcpServers: {} });
  });

  it('serializes a both-servers config to stable JSON (snapshot)', () => {
    const config = buildMcpConfig({
      playwright: { appUrl: 'http://localhost:5173' },
      chrome: { mcpServerPath: '/plugins/sp-chrome/2.0.0/mcp/dist/index.js' },
    });
    expect(JSON.stringify(config, null, 2)).toMatchSnapshot();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/mcp-config/build-mcp-config.test.ts`
Expected: FAIL — type errors / `playwright is undefined` (old `buildMcpConfig` expects `appUrl`).

- [ ] **Step 3: Rewrite `build-mcp-config.ts`**

Replace the contents of `packages/cli/src/lib/mcp-config/build-mcp-config.ts`:

```ts
export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerEntry>;
}

export interface BuildMcpConfigOptions {
  /** Playwright MCP server. Omit to leave it out of the config. */
  playwright?: {
    appUrl: string;
    // Path to the playwright-bundled chromium executable. When set, written
    // into the MCP server args as `--executable-path <path>`. Omit when the
    // path can't be resolved — the agent gets @playwright/mcp's default
    // (system `chrome` channel).
    chromiumPath?: string;
  };
  /** Chrome (superpowers-chrome) MCP server. Omit to leave it out. */
  chrome?: {
    /** Absolute path to the chrome MCP server entrypoint. */
    mcpServerPath: string;
  };
}

export function buildMcpConfig(opts: BuildMcpConfigOptions): McpConfig {
  const mcpServers: Record<string, McpServerEntry> = {};

  if (opts.playwright) {
    const args = ['-y', '@playwright/mcp@latest', '--headless'];
    if (opts.playwright.chromiumPath) {
      args.push('--executable-path', opts.playwright.chromiumPath);
    }
    mcpServers.playwright = {
      command: 'npx',
      args,
      env: { CREW_APP_URL: opts.playwright.appUrl },
    };
  }

  if (opts.chrome) {
    mcpServers.chrome = {
      command: 'node',
      args: [opts.chrome.mcpServerPath],
    };
  }

  return { mcpServers };
}
```

- [ ] **Step 4: Update `writeMcpFile`'s internal call**

In `packages/cli/src/lib/mcp-config/write-mcp-file.ts`, the `buildMcpConfig` call currently
reads:

```ts
  const config = buildMcpConfig({
    appUrl: opts.appUrl,
    chromiumPath: chromiumPath ?? undefined,
  });
```

Change it to the new shape (external `writeMcpFile` signature stays as-is for now):

```ts
  const config = buildMcpConfig({
    playwright: {
      appUrl: opts.appUrl,
      chromiumPath: chromiumPath ?? undefined,
    },
  });
```

- [ ] **Step 5: Regenerate the snapshot, then run tests**

```bash
rm packages/cli/src/lib/mcp-config/__snapshots__/build-mcp-config.test.ts.snap
npx vitest run src/lib/mcp-config/build-mcp-config.test.ts
```

Expected: PASS — 6 tests, snapshot written fresh.

Run: `npm run --workspace=crew-cli typecheck`
Expected: PASS — `write-mcp-file.ts` compiles against the new `buildMcpConfig`; `run.ts` /
`resume.ts` are untouched because `writeMcpFile`'s external signature has not changed.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/mcp-config/build-mcp-config.ts \
        packages/cli/src/lib/mcp-config/build-mcp-config.test.ts \
        packages/cli/src/lib/mcp-config/__snapshots__/build-mcp-config.test.ts.snap \
        packages/cli/src/lib/mcp-config/write-mcp-file.ts
git commit -m "refactor(cli): buildMcpConfig takes { playwright?, chrome? }

Restructures the options so a chrome-only or both-servers config reads
cleanly. The chrome server entry runs the resolved superpowers-chrome
MCP entrypoint via node."
```

## Task 4: `writeMcpFile` chrome wiring + MCP-write gate

`writeMcpFile` gains a nested options shape, resolves and emits the `chrome` server, and warns
once when the plugin is absent. `run.ts` and `resume.ts` are updated to the new shape and the
write gate is widened to cover `[visual_fidelity]`.

**Files:**
- Modify: `packages/cli/src/lib/mcp-config/write-mcp-file.ts`
- Modify: `packages/cli/src/lib/mcp-config/write-mcp-file.test.ts`
- Modify: `packages/cli/src/commands/run.ts:324-340` (the `.mcp.json` write block)
- Modify: `packages/cli/src/commands/resume.ts:96-113` (the `.mcp.json` refresh block)

- [ ] **Step 1: Add the failing chrome tests**

Append these tests inside the `describe('writeMcpFile', ...)` block in
`packages/cli/src/lib/mcp-config/write-mcp-file.test.ts`. They use the same `makeHome` helper
shape as Task 2 — add it near the top of the file:

```ts
import { vi } from 'vitest';

// Build a fake home dir containing a built superpowers-chrome plugin.
function makeHomeWithChrome(version = '2.0.0'): string {
  const home = mkdtempSync(join(tmpdir(), 'crew-mcp-test-home-'));
  const versionDir = join(
    home, '.claude', 'plugins', 'cache', 'superpowers-marketplace',
    'superpowers-chrome', version,
  );
  mkdirSync(join(versionDir, 'mcp', 'dist'), { recursive: true });
  writeFileSync(join(versionDir, 'mcp', 'dist', 'index.js'), '// server\n');
  mkdirSync(join(versionDir, 'skills', 'browsing'), { recursive: true });
  return home;
}
```

```ts
  it('emits a chrome server entry when the plugin resolves', async () => {
    const repo = makeRealRepo();
    const home = makeHomeWithChrome();
    const warn = vi.fn();

    const result = await writeMcpFile(repo, {
      chrome: { homeDir: home },
      warn,
    });

    const written = JSON.parse(readFileSync(join(repo, '.mcp.json'), 'utf8'));
    expect(written.mcpServers.chrome.command).toBe('node');
    expect(written.mcpServers.chrome.args[0]).toContain(
      join('superpowers-chrome', '2.0.0', 'mcp', 'dist', 'index.js'),
    );
    expect(result.chromeMcpPath).toContain('index.js');
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns and omits the chrome entry when the plugin is absent', async () => {
    const repo = makeRealRepo();
    const emptyHome = mkdtempSync(join(tmpdir(), 'crew-mcp-test-nohome-'));
    const warn = vi.fn();

    const result = await writeMcpFile(repo, {
      chrome: { homeDir: emptyHome },
      warn,
    });

    const written = JSON.parse(readFileSync(join(repo, '.mcp.json'), 'utf8'));
    expect(written.mcpServers.chrome).toBeUndefined();
    expect(result.chromeMcpPath).toBeNull();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toMatch(/superpowers-chrome plugin not found/i);
  });

  it('emits both playwright and chrome servers in one file', async () => {
    const repo = makeRealRepo();
    const home = makeHomeWithChrome();

    await writeMcpFile(repo, {
      playwright: { appUrl: 'http://localhost:5173', resolverCwd: repo },
      chrome: { homeDir: home },
    });

    const written = JSON.parse(readFileSync(join(repo, '.mcp.json'), 'utf8'));
    expect(Object.keys(written.mcpServers).sort()).toEqual(['chrome', 'playwright']);
  });
```

Then update the **existing** `writeMcpFile` tests in that file to the new options shape:
every current call of the form `writeMcpFile(x, { appUrl: A, resolverCwd: R })` becomes
`writeMcpFile(x, { playwright: { appUrl: A, resolverCwd: R } })`. There are 8 such calls
(the "writes .mcp.json", exclude-line, idempotent, preserves-entries, existed, resolves-chromium,
and chromium-null tests).

> **Note on `homeDir`:** `writeMcpFile`'s `chrome` option carries an optional `homeDir` purely
> so tests can point the resolver at a fake home. Production callers omit it; the resolver
> defaults to `os.homedir()`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/mcp-config/write-mcp-file.test.ts`
Expected: FAIL — `writeMcpFile` does not accept `playwright` / `chrome` options yet.

- [ ] **Step 3: Rewrite `write-mcp-file.ts`**

Replace the top of `packages/cli/src/lib/mcp-config/write-mcp-file.ts` (imports, result type,
and the `writeMcpFile` function) with the following. `resolveChromiumExecutablePath` and
`appendExcludeLine` below it are unchanged — keep them.

```ts
import { execa } from 'execa';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { buildMcpConfig, type BuildMcpConfigOptions } from './build-mcp-config.js';
import { resolveSuperpowersChrome } from './resolve-superpowers-chrome.js';

const EXCLUDE_LINE = '.mcp.json';

const PLUGIN_MISSING_WARNING =
  'superpowers-chrome plugin not found in ~/.claude/plugins/cache/ — ' +
  'chrome MCP not wired; visual-fidelity Step 5 will degrade to verification-gap';

export interface WriteMcpFileResult {
  existed: boolean;
  /** Resolved chromium executable path, or null when playwright wiring was off
   *  or the path could not be resolved. */
  chromiumPath: string | null;
  /** Resolved chrome MCP server path, or null when chrome wiring was off or the
   *  superpowers-chrome plugin was not found. */
  chromeMcpPath: string | null;
}

export interface WriteMcpFileOptions {
  /** Wire the playwright MCP server. Omit to leave it out. */
  playwright?: { appUrl: string; resolverCwd: string };
  /** Wire the chrome MCP server. Omit to leave it out. `homeDir` overrides the
   *  plugin-cache lookup root (tests only; production omits it). */
  chrome?: { homeDir?: string };
  /** Warning sink for plugin-absent. Defaults to a no-op. */
  warn?: (msg: string) => void;
}

export async function writeMcpFile(
  worktreePath: string,
  opts: WriteMcpFileOptions,
): Promise<WriteMcpFileResult> {
  const mcpPath = join(worktreePath, '.mcp.json');
  const existed = existsSync(mcpPath);

  let chromiumPath: string | null = null;
  let playwrightOpts: BuildMcpConfigOptions['playwright'];
  if (opts.playwright) {
    chromiumPath = await resolveChromiumExecutablePath(opts.playwright.resolverCwd);
    playwrightOpts = {
      appUrl: opts.playwright.appUrl,
      chromiumPath: chromiumPath ?? undefined,
    };
  }

  let chromeMcpPath: string | null = null;
  let chromeOpts: BuildMcpConfigOptions['chrome'];
  if (opts.chrome) {
    const resolved = resolveSuperpowersChrome(opts.chrome.homeDir);
    if (resolved) {
      chromeMcpPath = resolved.mcpServerPath;
      chromeOpts = { mcpServerPath: resolved.mcpServerPath };
    } else {
      (opts.warn ?? (() => {}))(PLUGIN_MISSING_WARNING);
    }
  }

  const config = buildMcpConfig({ playwright: playwrightOpts, chrome: chromeOpts });
  writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');

  await appendExcludeLine(worktreePath);
  return { existed, chromiumPath, chromeMcpPath };
}
```

- [ ] **Step 4: Run the lib tests to verify they pass**

Run: `npx vitest run src/lib/mcp-config/write-mcp-file.test.ts`
Expected: PASS — original 8 tests (in the new shape) plus 3 new chrome tests.

- [ ] **Step 5: Update the `run.ts` write block**

In `packages/cli/src/commands/run.ts`, replace the `if (playwrightEnabled(...))` block that
writes `.mcp.json` (currently around lines 324–340, the block opening
`if (playwrightEnabled(config) && config.playwright && smokeEnabled(config)) {`) with:

```ts
  const wantsPlaywright =
    playwrightEnabled(config) && config.playwright != null && smokeEnabled(config);
  const wantsChrome = Boolean(config.visual_fidelity);
  if (wantsPlaywright || wantsChrome) {
    const playwrightOpts =
      wantsPlaywright && config.playwright
        ? {
            appUrl: resolveAppUrl(config.playwright.app_url, dockerPorts, envVars).raw,
            resolverCwd: config.repo_path,
          }
        : undefined;
    const writeResult = await writeMcpFile(worktree, {
      playwright: playwrightOpts,
      chrome: wantsChrome ? {} : undefined,
      warn: (msg) => console.warn(pc.yellow(`  ! ${msg}`)),
    });
    console.log(pc.dim(`→ wrote ${join(worktree, '.mcp.json')}`));
    if (playwrightOpts) {
      console.log(pc.dim(`    CREW_APP_URL=${playwrightOpts.appUrl}`));
      console.log(
        pc.dim(
          writeResult.chromiumPath
            ? `    chromium: ${writeResult.chromiumPath}`
            : `    chromium: <unresolved> — MCP will fall back to system chrome channel`,
        ),
      );
    }
    if (wantsChrome) {
      console.log(
        pc.dim(
          writeResult.chromeMcpPath
            ? `    chrome MCP: ${writeResult.chromeMcpPath}`
            : `    chrome MCP: <unresolved> — superpowers-chrome not installed`,
        ),
      );
    }
    if (writeResult.existed) {
      console.warn(pc.yellow('  ! .mcp.json already existed in worktree — overwritten'));
    }
  }
```

- [ ] **Step 6: Update the `resume.ts` refresh block**

In `packages/cli/src/commands/resume.ts`, replace the `if (playwrightEnabled(...))` block that
refreshes `.mcp.json` (currently around lines 96–113) with:

```ts
  const wantsPlaywright =
    playwrightEnabled(config) && config.playwright != null && smokeEnabled(config);
  const wantsChrome = Boolean(config.visual_fidelity);
  if (wantsPlaywright || wantsChrome) {
    const playwrightOpts =
      wantsPlaywright && config.playwright
        ? {
            appUrl: resolveAppUrl(config.playwright.app_url, dockerPorts, envVars).raw,
            resolverCwd: config.repo_path,
          }
        : undefined;
    const writeResult = await writeMcpFile(worktree, {
      playwright: playwrightOpts,
      chrome: wantsChrome ? {} : undefined,
      warn: (msg) => process.stderr.write(pc.yellow(`  ! ${msg}\n`)),
    });
    process.stderr.write(pc.dim(`→ refreshed ${join(worktree, '.mcp.json')}\n`));
    if (playwrightOpts) {
      process.stderr.write(
        pc.dim(
          writeResult.chromiumPath
            ? `    chromium: ${writeResult.chromiumPath}\n`
            : `    chromium: <unresolved> — MCP will fall back to system chrome channel\n`,
        ),
      );
    }
    if (wantsChrome) {
      process.stderr.write(
        pc.dim(
          writeResult.chromeMcpPath
            ? `    chrome MCP: ${writeResult.chromeMcpPath}\n`
            : `    chrome MCP: <unresolved> — superpowers-chrome not installed\n`,
        ),
      );
    }
  }
```

Confirm `smokeEnabled` is imported in `resume.ts` — it is imported from the mcp-config barrel
alongside `playwrightEnabled`. If not, add it to that import.

- [ ] **Step 7: Typecheck, lint, full test run**

Run: `npm run --workspace=crew-cli typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS.

Run: `npm run --workspace=crew-cli test:run`
Expected: PASS. `run.test.ts` exercises the dispatch path — if a `.mcp.json` assertion there
expects the old `writeMcpFile` options shape, update it to the new `{ playwright: {...} }`
shape; the behavior under test (a `[playwright]`+smoke project writes a playwright entry) is
unchanged.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/lib/mcp-config/write-mcp-file.ts \
        packages/cli/src/lib/mcp-config/write-mcp-file.test.ts \
        packages/cli/src/commands/run.ts \
        packages/cli/src/commands/resume.ts
git commit -m "feat(cli): wire the chrome MCP server into .mcp.json

writeMcpFile resolves superpowers-chrome from the plugin cache and emits
a chrome server entry alongside playwright. The .mcp.json write gate in
run/resume now also fires for [visual_fidelity] projects, so chrome-only
is a valid configuration. Plugin-absent warns once and degrades."
```

## Task 5: `runSkillInjection` — copy `browsing` from the plugin cache

`runSkillInjection` gains an optional `browsingSkillSource` — when set, it copies the
`browsing` skill from there into the worktree. `run.ts` computes that source: the plugin's
`skills/` root, but only when `[visual_fidelity]` is set and the plugin resolves.

**Files:**
- Modify: `packages/cli/src/lib/run/skill-injection-step.ts`
- Modify: `packages/cli/src/lib/run/skill-injection-step.test.ts`
- Modify: `packages/cli/src/commands/run.ts:353-359` (the `runSkillInjection` call)

- [ ] **Step 1: Add the failing tests**

Append to the `describe('runSkillInjection', ...)` block in
`packages/cli/src/lib/run/skill-injection-step.test.ts`:

```ts
  it('also injects browsing when browsingSkillSource is supplied', async () => {
    const sourceRoot = makeSourceRoot(crewOwnedSkills());
    // A separate root standing in for the plugin cache's `skills/` dir.
    const browsingSkillSource = makeSourceRoot(['browsing']);
    const worktree = makeWorktree();
    const log = vi.fn();
    const warn = vi.fn();

    const result = await runSkillInjection({
      worktree,
      sourceRoot,
      browsingSkillSource,
      log,
      warn,
    });

    expect(result.kind).toBe('ok');
    expect(result.skillsInjected).toContain('browsing');
    expect(readFileSync(join(worktree, '.claude/skills/browsing/SKILL.md'), 'utf8')).toBe(
      '# browsing\n',
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not inject browsing when browsingSkillSource is omitted', async () => {
    const sourceRoot = makeSourceRoot(crewOwnedSkills());
    const worktree = makeWorktree();

    const result = await runSkillInjection({
      worktree,
      sourceRoot,
      log: vi.fn(),
      warn: vi.fn(),
    });

    expect(result.skillsInjected).not.toContain('browsing');
    expect(existsSync(join(worktree, '.claude/skills/browsing'))).toBe(false);
  });

  it('warns but does not fail when browsing copy fails', async () => {
    const sourceRoot = makeSourceRoot(crewOwnedSkills());
    // browsingSkillSource points at a dir with no `browsing/` subdir.
    const browsingSkillSource = makeSourceRoot([]);
    const worktree = makeWorktree();
    const log = vi.fn();
    const warn = vi.fn();

    const result = await runSkillInjection({
      worktree,
      sourceRoot,
      browsingSkillSource,
      log,
      warn,
    });

    expect(result.kind).toBe('warning');
    expect(result.skillsInjected).not.toContain('browsing');
    expect(warn).toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/run/skill-injection-step.test.ts`
Expected: FAIL — `SkillInjectionOptions` has no `browsingSkillSource`.

- [ ] **Step 3: Update `skill-injection-step.ts`**

In `packages/cli/src/lib/run/skill-injection-step.ts`, add the option to the interface:

```ts
export interface SkillInjectionOptions {
  worktree: string;
  /** Filesystem path containing crew-owned skill directories. Default: `<repo>/.claude/skills/`. */
  sourceRoot: string;
  /** Filesystem path containing the plugin-sourced `browsing/` skill directory.
   *  When set, `browsing` is injected alongside the crew-owned skills. Omit to
   *  skip it (plugin absent, or project has no [visual_fidelity]). */
  browsingSkillSource?: string;
  log: (msg: string) => void;
  warn: (msg: string) => void;
}
```

Then, inside `runSkillInjection`, after the existing `for (const name of crewOwnedSkills())`
loop and before the `if (failures.length > 0)` check, add:

```ts
  if (opts.browsingSkillSource) {
    try {
      const { destDir } = copySkillIntoWorktree(
        opts.worktree,
        'browsing',
        opts.browsingSkillSource,
      );
      injected.push('browsing');
      opts.log(`skill-injection: browsing → ${destDir}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failures.push(`browsing: ${reason}`);
      opts.warn(`skill-injection: failed to inject browsing — ${reason}`);
    }
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/run/skill-injection-step.test.ts`
Expected: PASS — existing tests plus the 3 new ones.

- [ ] **Step 5: Wire the browsing source in `run.ts`**

In `packages/cli/src/commands/run.ts`, the `runSkillInjection` call currently reads:

```ts
  await runSkillInjection({
    worktree,
    sourceRoot: skillsSourceRoot(),
    log: (msg) => console.log(pc.dim(`    ${msg}`)),
    warn: (msg) => console.warn(pc.yellow(`  ! ${msg}`)),
  });
```

Replace it with:

```ts
  // browsing is plugin-sourced, not crew-owned: inject it from the
  // superpowers-chrome plugin cache, but only for [visual_fidelity] projects
  // (the chrome MCP it drives is only wired for those). Plugin-absent is
  // already warned about by writeMcpFile above — stay silent here.
  const browsingSkillSource = config.visual_fidelity
    ? resolveSuperpowersChrome()?.skillsRoot
    : undefined;
  await runSkillInjection({
    worktree,
    sourceRoot: skillsSourceRoot(),
    browsingSkillSource,
    log: (msg) => console.log(pc.dim(`    ${msg}`)),
    warn: (msg) => console.warn(pc.yellow(`  ! ${msg}`)),
  });
```

Add `resolveSuperpowersChrome` to `run.ts`'s import from the mcp-config barrel (the same
import that already brings in `writeMcpFile`, `resolveAppUrl`, etc.).

- [ ] **Step 6: Typecheck, lint, full test run**

Run: `npm run --workspace=crew-cli typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS.

Run: `npm run --workspace=crew-cli test:run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/lib/run/skill-injection-step.ts \
        packages/cli/src/lib/run/skill-injection-step.test.ts \
        packages/cli/src/commands/run.ts
git commit -m "feat(cli): inject the browsing skill from the plugin cache

runSkillInjection copies browsing into the worktree when given a
browsingSkillSource. run.ts supplies it from the resolved
superpowers-chrome plugin for [visual_fidelity] projects only. browsing
is not added to CREW_OWNED_SKILLS — it is borrowed, not owned."
```

## Task 6: Update `.agents/dispatch.md`

Documentation parity — `dispatch.md` describes the pre-CREW-146 MCP write and skill injection.
No test; the `agents-doc-parity-check` skill is the gate.

**Files:**
- Modify: `.agents/dispatch.md`

- [ ] **Step 1: Add the new lib path to the `covers:` glob**

In the frontmatter `covers:` list, add a line (the `lib/playwright/**` glob does not exist —
it was never listed; `mcp-config/` is new):

```yaml
  - 'packages/cli/src/lib/mcp-config/**'
```

- [ ] **Step 2: Update the "MCP file write" step (step 8)**

Rewrite step 8 of the "End-to-end flow" list so it states: `.mcp.json` is written when
`[playwright]`+smoke **or** `[visual_fidelity]` is set; the file carries a `playwright` server
entry, a `chrome` server entry (resolved from the `superpowers-chrome` plugin cache via
`resolveSuperpowersChrome`), or both; and a missing `superpowers-chrome` plugin warns once and
omits the `chrome` entry. Keep the existing CREW-70 ordering note.

- [ ] **Step 3: Update the "Skills" section**

In the "Dispatcher-managed skills" paragraph, add: `runSkillInjection` also injects the
plugin-sourced `browsing` skill (copied from the `superpowers-chrome` plugin cache, not from
`<repo>/.claude/skills/`) when the project has `[visual_fidelity]` set and the plugin
resolves. Note that `browsing` is deliberately absent from `CREW_OWNED_SKILLS` because it is
borrowed from a plugin rather than owned by crew.

- [ ] **Step 4: Bump `last_updated`**

Set the frontmatter `last_updated:` to the date of this work.

- [ ] **Step 5: Verify and commit**

Run: `npm run lint`
Expected: PASS (markdown is not linted, but this confirms nothing else broke).

Review the rendered doc for accuracy against Tasks 4–5.

```bash
git add .agents/dispatch.md
git commit -m "docs(.agents): dispatch.md covers chrome MCP + browsing injection"
```

- [ ] **Step 6: Run `agents-doc-parity-check` before opening the PR**

Per `AGENTS.md`, run the `agents-doc-parity-check` skill against the full PR-A diff. Confirm
no other `.agents/<topic>.md` `covers:` glob matches a changed path without its doc being
updated. (The rename in Task 1 and the `run/` changes fall under `dispatch.md`'s globs, now
updated.)

**PR A is complete.** Open it: `gh pr create` targeting `main`, titled
`feat(cli): wire chrome MCP + browsing skill injection (CREW-146)`. Run the autonomous
acceptance criteria from the spec before claiming done.

---

# PR B — Interactive (Tasks 7–8)

> Authored in an interactive session. The dispatch sandbox masks `<repo>/.claude/skills/`
> read-only, so this cannot run via `crew run`.

## Task 7: Rewrite `visual-fidelity-check` Step 5 as live-DOM inspection

**Files:**
- Modify: `.claude/skills/visual-fidelity-check/workflow.md`

- [ ] **Step 1: Replace the Step 5 section**

In `.claude/skills/visual-fidelity-check/workflow.md`, replace the entire
`## Step 5: Visual check (optional, requires dashboardUrl)` section (from that heading down to,
but not including, `## Step 6: Compile findings report`) with:

````markdown
## Step 5: Live DOM check (required when `dashboardUrl` is set and chrome is wired)

Steps 3–4 read code and callers; neither reads the *rendered* DOM. Step 5 opens the running
dashboard via the chrome MCP server and inspects live elements — computed styles and rendered
SVG — against the Figma snapshot's `enrichment` data. This catches runtime-only failures the
static checks cannot: purged Tailwind classes, CSS specificity wars, theme overrides, and
icons where the source looks right but the rendered glyph is wrong.

**When this step runs:**

- `dashboardUrl` set **and** the `chrome` MCP server is wired (`mcp__chrome__use_browser`
  available) → Step 5 is **required**.
- `dashboardUrl` set but chrome is **not** wired (the `superpowers-chrome` plugin is not
  installed on this machine) → log a verification gap, skip 5.1–5.5, and record the gap in the
  report so the user can decide to install the plugin or accept partial coverage.
- `dashboardUrl` **not** set → skip Step 5 (consistent with Steps 1–4 behavior).

**Step 5.1 — Open the dashboard.** Call `mcp__chrome__use_browser` with `action: "navigate"`
to the resolved `dashboardUrl`. Wait for a known ready-state element (`await_element` on a
landing-page selector). If chrome is unreachable or navigate fails, log
`verification gap: chrome unreachable` and skip 5.2–5.5.

**Step 5.2 — Navigate to a screen exercising each touched component.** For each
`(component, variant)` the code can produce, identify the dashboard URL or in-app navigation
that surfaces an instance of that variant. Reuse the caller map from Step 4 to pick a screen.

**Step 5.3 — Color-property check.** For each touched `(component, variant)`:

1. Query the live element via CSS selector. **Selector identification is the agent's
   responsibility:** prefer `data-*` attributes if present, fall back to component-name class
   signatures, fall back to structural selectors as a last resort. If the project's components
   expose no stable selectors and you must use fragile structural ones, surface that as a
   verification-gap note in the report.
2. Use `mcp__chrome__use_browser` `action: "eval"` to read `getComputedStyle(el)`'s
   `backgroundColor`, `borderColor`, `color`. CDP returns these as `rgb(...)`.
3. Convert each to `#RRGGBB`.
4. Compare to `enrichment.boundVariables.resolvedHex` for the corresponding paint role from the
   Figma snapshot.
5. On mismatch: finding. Severity per the existing rules (large hex delta = high,
   near-identical = low). Cite both sides plus the live element's selector.

**Step 5.4 — Icon check.** For each touched component with an `Icon` INSTANCE_SWAP property in
Figma (`enrichment.componentProperties.Icon`):

1. Query the icon slot via selector.
2. Use `action: "eval"` to read `el.querySelector('svg, span')?.outerHTML` and
   `el.textContent`.
3. If it is an `<svg>`, read the lucide name (`data-lucide` / class signature / known marker)
   and compare to `enrichment.componentProperties.Icon.name`. Mismatch → finding, severity ≥
   medium.
4. If it is a `<span>` standing in for an icon, or a Unicode text node, → finding, severity ≥
   medium. Name the expected lucide glyph in the fix.

Step 5.4 is the runtime counterpart to Step 4's caller-side icon check — it catches cases
where the source looks right but the rendered DOM disagrees (className override, conditional
rendering, prop-forwarding bug).

**Step 5.5 — Screenshot cross-reference.** `use_browser` auto-captures a viewport PNG on every
action. Cite the most recent capture path in the report and cross-reference it with
`<snapshotPath>/screens/<screen-node>.png` from the Figma snapshot. If 5.1–5.4 already
surfaced findings, link the screenshot pair as supporting evidence rather than re-describing
it in prose.

**Failure mode:** if chrome is wired but the dashboard is unreachable (docker stack down, port
mismatch), Step 5 fails closed — log `verification gap: dashboard unreachable at <url>` and
surface it in the report. Do **not** treat dashboard-unreachable as "Step 5 passed."
````

- [ ] **Step 2: Verify the surrounding structure still reads correctly**

Confirm the section above `## Step 6: Compile findings report` flows correctly and that no
`Step 5` reference elsewhere in `workflow.md` (e.g. Step 6's report template, Step 7) now
contradicts the rewrite. The "Verification gaps" section already accommodates Step 5 gaps — no
change needed there.

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/visual-fidelity-check/workflow.md
git commit -m "feat(skill): rewrite visual-fidelity Step 5 as live-DOM inspection

Replaces the optional screenshot-diff step with a required five-substep
chrome-MCP inspection: computed-style color check and rendered-SVG icon
check against the Figma snapshot enrichment data."
```

## Task 8: Update `visual-fidelity-check` SKILL.md

**Files:**
- Modify: `.claude/skills/visual-fidelity-check/SKILL.md`

- [ ] **Step 1: Update the workflow-overview line**

In the `## Workflow` numbered list, replace:

```markdown
6. **Visual check** (optional) — render + screenshot + compare to Figma screen
```

with:

```markdown
6. **Live DOM check** (required when `dashboardUrl` is set and chrome is wired) — open the dashboard via the chrome MCP, read computed styles + rendered SVG, compare to the Figma snapshot enrichment
```

- [ ] **Step 2: Add `browsing` to Related skills**

In the `## Related skills` section, add a bullet:

```markdown
- `browsing` — drives the running dashboard via Chrome DevTools Protocol (`mcp__chrome__use_browser`); required by Step 5's live-DOM inspection
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/visual-fidelity-check/SKILL.md
git commit -m "docs(skill): SKILL.md overview reflects live-DOM Step 5 + browsing peer"
```

**PR B is complete.** Open it: `gh pr create` targeting `main`, titled
`feat(skill): visual-fidelity live-DOM Step 5 + browsing peer (CREW-146)`. Run the interactive
acceptance criteria from the spec before claiming done.

---

## Self-review notes

- **Spec coverage:** Change 1 → Task 2; Change 2 → Task 3; Change 3 → Task 4; Change 4 → Task 4
  (Steps 5–6); Change 5 → Task 5; Change 6 → Task 1; Change 7 → Task 7; Change 8 → Task 6.
  Change 4 also updates `SKILL.md`'s overview — covered by Task 8.
- **Green between tasks:** Task 3 keeps `writeMcpFile`'s external signature unchanged so
  `run.ts`/`resume.ts` compile; Task 4 then changes the signature and its callers together.
  Every task ends with a passing typecheck + test run.
- **Type consistency:** `SuperpowersChromePaths` (`{ mcpServerPath, skillsRoot }`) is produced
  by `resolveSuperpowersChrome` (Task 2) and consumed in Task 4 (`mcpServerPath`) and Task 5
  (`skillsRoot`). `BuildMcpConfigOptions` (`{ playwright?, chrome? }`, Task 3) is consumed by
  `writeMcpFile` (Task 4). `WriteMcpFileOptions` / `WriteMcpFileResult` (Task 4) are consumed
  by `run.ts`/`resume.ts` (Task 4). `SkillInjectionOptions.browsingSkillSource` (Task 5) is
  supplied by `run.ts` (Task 5).
