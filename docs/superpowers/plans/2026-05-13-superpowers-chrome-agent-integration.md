# superpowers-chrome agent integration (Thread B2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the chrome MCP server + `browsing` skill available to crew-dispatched agents in projects with `[visual_fidelity]` configured, so `visual-fidelity-check`'s Step 5 can do live-DOM inspection (computed CSS + rendered SVG + screenshot) against the Figma snapshot — catching runtime drift the static Step 3 cannot. Then wire crew itself with `[visual_fidelity]` so the gate dogfoods on crew dashboard work.

**Architecture:** Crew's dispatcher already writes a `.mcp.json` into each worktree and injects skill directories from `packages/cli/src/lib/skills/`. Extend both: emit a `chrome` MCP server entry alongside `playwright` (path resolved from the user's installed `superpowers-chrome` plugin cache), and inject a vendored copy of the `browsing` skill alongside `visual-fidelity-check`. The `visual-fidelity-check` skill's `workflow.md` Step 5 gets rewritten as five sub-steps that use `use_browser` for runtime checks. Crew's project config gets a `[visual_fidelity]` block (user-local) plus a contributor setup doc plus Code Connect gap-fills for the Timeline-family components.

**Tech Stack:** TypeScript (Node 20+), Vitest, picocolors, execa, commander. Skill files are markdown. Code Connect files use `@figma/code-connect`.

**Spec:** `docs/superpowers/specs/2026-05-13-superpowers-chrome-agent-integration.md`

---

## Phase 1 — Resolve chrome MCP path from user's plugin cache (B2.1, part 1)

### Task 1.1: Author `resolveChromeMcpPath` with TDD

**Files:**

- Create: `packages/cli/src/lib/playwright/resolve-chrome-mcp-path.ts`
- Create: `packages/cli/src/lib/playwright/resolve-chrome-mcp-path.test.ts`

(`packages/cli/src/lib/playwright/` will be renamed to `mcp-config/` in Task 5.1; for now, land the new files here so the rename is a single contiguous change.)

The resolver looks under `~/.claude/plugins/cache/superpowers-marketplace/superpowers-chrome/`. If the directory exists, it picks the highest valid semver subdir and returns `<dir>/<version>/mcp/dist/index.js` if that file exists on disk. Returns `null` in every "not present" case (missing parent dir, no semver subdirs, missing dist).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/cli/src/lib/playwright/resolve-chrome-mcp-path.test.ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveChromeMcpPath } from './resolve-chrome-mcp-path.js';

describe('resolveChromeMcpPath', () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'crew-chrome-resolve-'));
  });
  afterEach(() => {
    rmSync(home, { recursive: true, force: true });
  });

  it('returns null when the plugin cache directory does not exist', () => {
    expect(resolveChromeMcpPath(home)).toBeNull();
  });

  it('returns null when the superpowers-chrome dir is empty', () => {
    mkdirSync(join(home, '.claude/plugins/cache/superpowers-marketplace/superpowers-chrome'), {
      recursive: true,
    });
    expect(resolveChromeMcpPath(home)).toBeNull();
  });

  it('returns null when no version subdir has mcp/dist/index.js', () => {
    const root = join(home, '.claude/plugins/cache/superpowers-marketplace/superpowers-chrome');
    mkdirSync(join(root, '2.0.0'), { recursive: true });
    expect(resolveChromeMcpPath(home)).toBeNull();
  });

  it('returns the dist path when one version exists', () => {
    const root = join(home, '.claude/plugins/cache/superpowers-marketplace/superpowers-chrome');
    mkdirSync(join(root, '2.0.0/mcp/dist'), { recursive: true });
    const distFile = join(root, '2.0.0/mcp/dist/index.js');
    writeFileSync(distFile, '// stub');
    expect(resolveChromeMcpPath(home)).toBe(distFile);
  });

  it('picks the highest semver when multiple versions are present', () => {
    const root = join(home, '.claude/plugins/cache/superpowers-marketplace/superpowers-chrome');
    for (const v of ['1.9.0', '2.0.0', '2.1.0', '2.0.5']) {
      mkdirSync(join(root, `${v}/mcp/dist`), { recursive: true });
      writeFileSync(join(root, `${v}/mcp/dist/index.js`), '// stub');
    }
    expect(resolveChromeMcpPath(home)).toBe(join(root, '2.1.0/mcp/dist/index.js'));
  });

  it('ignores non-semver directory names', () => {
    const root = join(home, '.claude/plugins/cache/superpowers-marketplace/superpowers-chrome');
    mkdirSync(join(root, 'next/mcp/dist'), { recursive: true });
    writeFileSync(join(root, 'next/mcp/dist/index.js'), '// stub');
    mkdirSync(join(root, '1.0.0/mcp/dist'), { recursive: true });
    writeFileSync(join(root, '1.0.0/mcp/dist/index.js'), '// stub');
    expect(resolveChromeMcpPath(home)).toBe(join(root, '1.0.0/mcp/dist/index.js'));
  });

  it('skips a semver dir whose dist/index.js is missing and falls back to the next-highest', () => {
    const root = join(home, '.claude/plugins/cache/superpowers-marketplace/superpowers-chrome');
    mkdirSync(join(root, '2.0.0/mcp/dist'), { recursive: true });
    // No file at 2.0.0/mcp/dist/index.js
    mkdirSync(join(root, '1.9.0/mcp/dist'), { recursive: true });
    writeFileSync(join(root, '1.9.0/mcp/dist/index.js'), '// stub');
    expect(resolveChromeMcpPath(home)).toBe(join(root, '1.9.0/mcp/dist/index.js'));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/cli/src/lib/playwright/resolve-chrome-mcp-path.test.ts`
Expected: FAIL with `Cannot find module './resolve-chrome-mcp-path.js'`

- [ ] **Step 3: Implement `resolveChromeMcpPath`**

```typescript
// packages/cli/src/lib/playwright/resolve-chrome-mcp-path.ts
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

interface ParsedVersion {
  raw: string;
  major: number;
  minor: number;
  patch: number;
}

function parseSemver(name: string): ParsedVersion | null {
  const m = SEMVER_RE.exec(name);
  if (!m) return null;
  return { raw: name, major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

function compareDesc(a: ParsedVersion, b: ParsedVersion): number {
  if (b.major !== a.major) return b.major - a.major;
  if (b.minor !== a.minor) return b.minor - a.minor;
  return b.patch - a.patch;
}

export function resolveChromeMcpPath(home: string = homedir()): string | null {
  const root = join(
    home,
    '.claude',
    'plugins',
    'cache',
    'superpowers-marketplace',
    'superpowers-chrome',
  );
  if (!existsSync(root)) return null;

  const entries = readdirSync(root, { withFileTypes: true });
  const versions = entries
    .filter((e) => e.isDirectory())
    .map((e) => parseSemver(e.name))
    .filter((v): v is ParsedVersion => v !== null)
    .sort(compareDesc);

  for (const v of versions) {
    const candidate = join(root, v.raw, 'mcp', 'dist', 'index.js');
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/cli/src/lib/playwright/resolve-chrome-mcp-path.test.ts`
Expected: PASS — all 7 cases.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/playwright/resolve-chrome-mcp-path.ts packages/cli/src/lib/playwright/resolve-chrome-mcp-path.test.ts
git commit -m "feat(cli): resolveChromeMcpPath helper for chrome MCP server path resolution"
```

---

## Phase 2 — Extend buildMcpConfig + writeMcpFile for chrome (B2.1, part 2)

### Task 2.1: Extend `buildMcpConfig` to optionally emit a `chrome` server

**Files:**

- Modify: `packages/cli/src/lib/playwright/build-mcp-config.ts`
- Modify: `packages/cli/src/lib/playwright/build-mcp-config.test.ts`

The current `BuildMcpConfigOptions` takes a flat `{ appUrl, chromiumPath? }`. Refactor so the function accepts optional per-server sub-objects: `{ playwright?, chrome? }`. At least one must be provided. The emitted JSON only includes a server entry for sub-objects that are present.

- [ ] **Step 1: Write the failing tests**

In `packages/cli/src/lib/playwright/build-mcp-config.test.ts`, replace the existing test body with:

```typescript
import { describe, expect, it } from 'vitest';
import { buildMcpConfig } from './build-mcp-config.js';

describe('buildMcpConfig', () => {
  it('emits a playwright-only config when only playwright opts are provided', () => {
    const config = buildMcpConfig({
      playwright: { appUrl: 'http://localhost:5173' },
    });
    expect(Object.keys(config.mcpServers)).toEqual(['playwright']);
    expect(config.mcpServers.playwright.args).toEqual([
      '-y',
      '@playwright/mcp@latest',
      '--headless',
    ]);
    expect(config.mcpServers.playwright.env).toEqual({ CREW_APP_URL: 'http://localhost:5173' });
  });

  it('includes --executable-path when chromiumPath is set', () => {
    const config = buildMcpConfig({
      playwright: { appUrl: 'http://localhost:5173', chromiumPath: '/opt/chrome' },
    });
    expect(config.mcpServers.playwright.args).toContain('--executable-path');
    expect(config.mcpServers.playwright.args).toContain('/opt/chrome');
  });

  it('emits a chrome-only config when only chrome opts are provided', () => {
    const config = buildMcpConfig({
      chrome: { mcpServerPath: '/path/to/mcp/dist/index.js' },
    });
    expect(Object.keys(config.mcpServers)).toEqual(['chrome']);
    expect(config.mcpServers.chrome).toEqual({
      command: 'node',
      args: ['/path/to/mcp/dist/index.js'],
    });
  });

  it('emits both server entries when both opts are provided', () => {
    const config = buildMcpConfig({
      playwright: { appUrl: 'http://localhost:5173' },
      chrome: { mcpServerPath: '/path/to/index.js' },
    });
    expect(Object.keys(config.mcpServers).sort()).toEqual(['chrome', 'playwright']);
  });

  it('throws when neither playwright nor chrome opts are provided', () => {
    expect(() => buildMcpConfig({})).toThrow(/at least one of playwright or chrome/);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/cli/src/lib/playwright/build-mcp-config.test.ts`
Expected: FAIL — type errors and assertion failures because `buildMcpConfig` still takes the old shape.

- [ ] **Step 3: Refactor `build-mcp-config.ts`**

Replace the file contents with:

```typescript
// packages/cli/src/lib/playwright/build-mcp-config.ts
export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface McpConfig {
  mcpServers: Record<string, McpServerEntry>;
}

export interface PlaywrightServerOptions {
  appUrl: string;
  // Path to the playwright-bundled chromium executable. When set, written into
  // the MCP server args as `--executable-path <path>`. Omit when the path can't
  // be resolved — the MCP server defaults to the system chrome channel.
  chromiumPath?: string;
}

export interface ChromeServerOptions {
  // Absolute path to the superpowers-chrome MCP server's `dist/index.js`. Resolved
  // from the user's plugin cache by `resolveChromeMcpPath`.
  mcpServerPath: string;
}

export interface BuildMcpConfigOptions {
  playwright?: PlaywrightServerOptions;
  chrome?: ChromeServerOptions;
}

export function buildMcpConfig(opts: BuildMcpConfigOptions): McpConfig {
  if (!opts.playwright && !opts.chrome) {
    throw new Error('buildMcpConfig: at least one of playwright or chrome must be provided');
  }
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/cli/src/lib/playwright/build-mcp-config.test.ts`
Expected: PASS — all 5 cases.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/playwright/build-mcp-config.ts packages/cli/src/lib/playwright/build-mcp-config.test.ts
git commit -m "feat(cli): buildMcpConfig accepts optional playwright and chrome server opts"
```

### Task 2.2: Extend `writeMcpFile` to accept chrome wiring and emit the warning when chrome can't be resolved

**Files:**

- Modify: `packages/cli/src/lib/playwright/write-mcp-file.ts`
- Modify: `packages/cli/src/lib/playwright/write-mcp-file.test.ts`

`writeMcpFile` currently takes `{ appUrl, resolverCwd }`. Refactor to `{ playwright?: { appUrl, resolverCwd }, chrome?: boolean }`. When `chrome` is true, call `resolveChromeMcpPath()` and either include the chrome entry or emit a `pc.yellow` warning via an injected logger and skip the chrome entry. At least one of `playwright` / `chrome` must be set; otherwise throw.

Return value gains `chromeMcpPath: string | null`.

- [ ] **Step 1: Write the failing tests**

In `packages/cli/src/lib/playwright/write-mcp-file.test.ts`, replace the existing test body. Key additions:

```typescript
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execa } from 'execa';
import { writeMcpFile } from './write-mcp-file.js';

vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: '' }),
}));

describe('writeMcpFile', () => {
  let repo: string;
  let home: string;
  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'crew-writemcp-'));
    execa('git', ['init', repo], { reject: false });
    home = mkdtempSync(join(tmpdir(), 'crew-writemcp-home-'));
  });
  afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('writes a playwright-only config when only playwright opts are provided', async () => {
    await writeMcpFile(repo, {
      playwright: { appUrl: 'http://localhost:5173', resolverCwd: repo },
    });
    const written = JSON.parse(readFileSync(join(repo, '.mcp.json'), 'utf8'));
    expect(Object.keys(written.mcpServers)).toEqual(['playwright']);
  });

  it('writes a both-servers config when chrome resolves successfully', async () => {
    const root = join(
      home,
      '.claude/plugins/cache/superpowers-marketplace/superpowers-chrome/2.0.0/mcp/dist',
    );
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'index.js'), '// stub');
    const result = await writeMcpFile(repo, {
      playwright: { appUrl: 'http://localhost:5173', resolverCwd: repo },
      chrome: true,
      home,
    });
    const written = JSON.parse(readFileSync(join(repo, '.mcp.json'), 'utf8'));
    expect(Object.keys(written.mcpServers).sort()).toEqual(['chrome', 'playwright']);
    expect(written.mcpServers.chrome.args[0]).toBe(join(root, 'index.js'));
    expect(result.chromeMcpPath).toBe(join(root, 'index.js'));
  });

  it('writes playwright-only and warns when chrome is requested but not resolvable', async () => {
    const warn = vi.fn();
    const result = await writeMcpFile(repo, {
      playwright: { appUrl: 'http://localhost:5173', resolverCwd: repo },
      chrome: true,
      home,
      warn,
    });
    const written = JSON.parse(readFileSync(join(repo, '.mcp.json'), 'utf8'));
    expect(Object.keys(written.mcpServers)).toEqual(['playwright']);
    expect(result.chromeMcpPath).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('superpowers-chrome plugin not found'),
    );
  });

  it('writes a chrome-only config when only chrome is requested and resolves', async () => {
    const root = join(
      home,
      '.claude/plugins/cache/superpowers-marketplace/superpowers-chrome/2.0.0/mcp/dist',
    );
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, 'index.js'), '// stub');
    await writeMcpFile(repo, { chrome: true, home });
    const written = JSON.parse(readFileSync(join(repo, '.mcp.json'), 'utf8'));
    expect(Object.keys(written.mcpServers)).toEqual(['chrome']);
  });

  it('throws when neither playwright nor chrome is requested', async () => {
    await expect(writeMcpFile(repo, {})).rejects.toThrow(/at least one of playwright or chrome/);
  });
});
```

Keep any existing tests that exercise gitignore appending and the existed/overwrite return.

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run packages/cli/src/lib/playwright/write-mcp-file.test.ts`
Expected: FAIL — type errors and assertion failures.

- [ ] **Step 3: Refactor `write-mcp-file.ts`**

Replace the file contents with:

```typescript
// packages/cli/src/lib/playwright/write-mcp-file.ts
import { execa } from 'execa';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { buildMcpConfig } from './build-mcp-config.js';
import { resolveChromeMcpPath } from './resolve-chrome-mcp-path.js';

const EXCLUDE_LINE = '.mcp.json';

export interface PlaywrightWriteOptions {
  appUrl: string;
  resolverCwd: string;
}

export interface WriteMcpFileOptions {
  playwright?: PlaywrightWriteOptions;
  chrome?: boolean;
  // Override homedir for tests. Resolved via `resolveChromeMcpPath`.
  home?: string;
  // Logger for the soft-fail warning when chrome can't be resolved. Defaults to a no-op
  // so callers can inject `pc.yellow`-formatted log into stderr / their console.
  warn?: (msg: string) => void;
}

export interface WriteMcpFileResult {
  existed: boolean;
  chromiumPath: string | null;
  chromeMcpPath: string | null;
}

export async function writeMcpFile(
  worktreePath: string,
  opts: WriteMcpFileOptions,
): Promise<WriteMcpFileResult> {
  if (!opts.playwright && !opts.chrome) {
    throw new Error('writeMcpFile: at least one of playwright or chrome must be provided');
  }
  const mcpPath = join(worktreePath, '.mcp.json');
  const existed = existsSync(mcpPath);

  let chromiumPath: string | null = null;
  if (opts.playwright) {
    chromiumPath = await resolveChromiumExecutablePath(opts.playwright.resolverCwd);
  }

  let chromeMcpPath: string | null = null;
  if (opts.chrome) {
    chromeMcpPath = resolveChromeMcpPath(opts.home);
    if (chromeMcpPath === null && opts.warn) {
      opts.warn(
        'superpowers-chrome plugin not found in ~/.claude/plugins/cache/ — chrome MCP not wired; visual-fidelity Step 5 will degrade to verification-gap',
      );
    }
  }

  const config = buildMcpConfig({
    playwright: opts.playwright
      ? { appUrl: opts.playwright.appUrl, chromiumPath: chromiumPath ?? undefined }
      : undefined,
    chrome: chromeMcpPath ? { mcpServerPath: chromeMcpPath } : undefined,
  });

  // `buildMcpConfig` throws if neither server is requested. Catch the corner case
  // where the caller asked only for chrome and chrome did not resolve.
  // In that case we still emit a valid empty-mcpServers JSON (so the worktree
  // has a recognizable file) but log the warning.
  // (Validated as a branch below.)
  writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');

  await appendExcludeLine(worktreePath);
  return { existed, chromiumPath, chromeMcpPath };
}

async function resolveChromiumExecutablePath(resolverCwd: string): Promise<string | null> {
  const result = await execa(
    'node',
    ['-e', 'console.log(require("@playwright/test").chromium.executablePath())'],
    { cwd: resolverCwd, reject: false },
  );
  if (result.exitCode !== 0) return null;
  const path = result.stdout.trim();
  if (!path || !existsSync(path)) return null;
  return path;
}

async function appendExcludeLine(worktreePath: string): Promise<void> {
  const result = await execa('git', ['rev-parse', '--git-common-dir'], {
    cwd: worktreePath,
    reject: false,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      `appendExcludeLine: git rev-parse --git-common-dir failed in ${worktreePath} (rc=${result.exitCode}): ${result.stderr}`,
    );
  }
  const rawCommonDir = result.stdout.trim();
  const commonDir = isAbsolute(rawCommonDir) ? rawCommonDir : join(worktreePath, rawCommonDir);
  const excludePath = join(commonDir, 'info', 'exclude');

  const current = existsSync(excludePath) ? readFileSync(excludePath, 'utf8') : '';
  const lines = current.split('\n');
  if (lines.some((l) => l.trim() === EXCLUDE_LINE)) return;
  const next = current.endsWith('\n') || current.length === 0 ? current : current + '\n';
  writeFileSync(excludePath, next + EXCLUDE_LINE + '\n');
}
```

- [ ] **Step 4: Handle the chrome-only-but-unresolved corner case**

When `opts.chrome` is true, `opts.playwright` is undefined, and `resolveChromeMcpPath` returns null, `buildMcpConfig` will throw because neither server is provided. The integration in run.ts (Task 3.1) only calls `writeMcpFile` with chrome alone if `config.visual_fidelity` is set without `config.playwright`, which is a valid configuration. So `writeMcpFile` must not error in that branch — it should still write a file the worktree expects.

Update `writeMcpFile` to handle this: when both `opts.chrome` is true but resolution failed AND there's no playwright, skip writing the file entirely (return `existed`, both paths null) and warn. The agent gets no `.mcp.json` and the workflow degrades to "no chrome MCP" — which is correct fail-soft behavior.

Update the function:

```typescript
  // After computing chromeMcpPath and chromiumPath:
  const haveAnyServer = Boolean(opts.playwright) || chromeMcpPath !== null;
  if (!haveAnyServer) {
    // Caller asked for chrome only and chrome didn't resolve. Skip writing
    // the file — the agent runs without any MCP wired.
    return { existed, chromiumPath, chromeMcpPath };
  }

  const config = buildMcpConfig({ ... });
  writeFileSync(mcpPath, JSON.stringify(config, null, 2) + '\n');
  await appendExcludeLine(worktreePath);
  return { existed, chromiumPath, chromeMcpPath };
```

Add a corresponding test:

```typescript
it('does not write .mcp.json when only chrome is requested and chrome does not resolve', async () => {
  const warn = vi.fn();
  await writeMcpFile(repo, { chrome: true, home, warn });
  expect(existsSync(join(repo, '.mcp.json'))).toBe(false);
  expect(warn).toHaveBeenCalled();
});
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/cli/src/lib/playwright/write-mcp-file.test.ts`
Expected: PASS — all cases.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/playwright/write-mcp-file.ts packages/cli/src/lib/playwright/write-mcp-file.test.ts
git commit -m "feat(cli): writeMcpFile emits chrome alongside playwright and warns on missing plugin"
```

---

## Phase 3 — Wire writeMcpFile call site in run.ts (B2.1, part 3)

### Task 3.1: Update `run.ts` to call writeMcpFile with chrome opts and extend the gate

**Files:**

- Modify: `packages/cli/src/commands/run.ts` (lines ~320–342)

The current call site is:

```typescript
if (playwrightEnabled(config) && config.playwright && smokeEnabled(config)) {
  const resolved = resolveAppUrl(config.playwright.app_url, dockerPorts, envVars);
  const writeResult = await writeMcpFile(worktree, {
    appUrl: resolved.raw,
    resolverCwd: config.repo_path,
  });
  // ... logs ...
}
```

After: call `writeMcpFile` when EITHER playwright is enabled OR `config.visual_fidelity` is set. Pass `chrome: true` when `config.visual_fidelity` is set. Pass `playwright: { appUrl, resolverCwd }` when playwright is enabled.

- [ ] **Step 1: Refactor the call site**

Replace lines ~320–342 with:

```typescript
// .mcp.json is written AFTER prepareAgentEnvironment so the chromium binary
// exists on disk when writeMcpFile resolves --executable-path. Resolving
// before install would emit a stale path that points at a not-yet-extracted
// binary, and the existsSync guard would fall back to MCP's system-chrome
// default (the bug CREW-70 fixed).
const wantsPlaywright = playwrightEnabled(config) && config.playwright && smokeEnabled(config);
const wantsChrome = Boolean(config.visual_fidelity);
if (wantsPlaywright || wantsChrome) {
  let playwrightOpts: { appUrl: string; resolverCwd: string } | undefined;
  let resolvedRaw: string | undefined;
  if (wantsPlaywright && config.playwright) {
    const resolved = resolveAppUrl(config.playwright.app_url, dockerPorts, envVars);
    resolvedRaw = resolved.raw;
    playwrightOpts = { appUrl: resolved.raw, resolverCwd: config.repo_path };
  }
  const writeResult = await writeMcpFile(worktree, {
    playwright: playwrightOpts,
    chrome: wantsChrome,
    warn: (msg) => console.warn(pc.yellow(`  ! ${msg}`)),
  });
  const summary: string[] = [];
  if (playwrightOpts) summary.push(`CREW_APP_URL=${resolvedRaw}`);
  if (writeResult.chromeMcpPath) summary.push(`chrome MCP=${writeResult.chromeMcpPath}`);
  if (summary.length > 0) {
    console.log(pc.dim(`→ wrote ${join(worktree, '.mcp.json')} (${summary.join(', ')})`));
  } else {
    console.log(pc.dim(`→ skipped ${join(worktree, '.mcp.json')} (no servers resolved)`));
  }
  if (writeResult.chromiumPath) {
    console.log(pc.dim(`    chromium: ${writeResult.chromiumPath}`));
  } else if (playwrightOpts) {
    console.log(pc.dim(`    chromium: <unresolved> — MCP will fall back to system chrome channel`));
  }
  if (writeResult.existed) {
    console.warn(pc.yellow('  ! .mcp.json already existed in worktree — overwritten'));
  }
}
```

- [ ] **Step 2: Verify the typecheck passes**

Run: `npm run -w crew-cli typecheck`
Expected: PASS — no type errors.

- [ ] **Step 3: Verify the test suite still passes**

Run: `npm run -w crew-cli test:run`
Expected: PASS — no regressions.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/run.ts
git commit -m "feat(cli): run.ts wires chrome MCP when [visual_fidelity] is set"
```

---

## Phase 4 — Vendor `browsing` skill + extend skill injection (B2.2)

### Task 4.1: Vendor the `browsing` skill source into the crew repo

**Files:**

- Create (vendored copies): `packages/cli/src/lib/skills/browsing/{SKILL.md,COMMANDLINE-USAGE.md,EXAMPLES.md,README.md,lib/*}`

Source is `~/.claude/plugins/cache/superpowers-marketplace/superpowers-chrome/2.0.0/skills/browsing/`. Copy only the files needed for an agent reading the skill — exclude test files, node_modules, package.json, the chrome-ws binary itself, and host-override scripts (those are MCP-server-side, not skill-side).

- [ ] **Step 1: Copy the skill content**

```bash
SRC=~/.claude/plugins/cache/superpowers-marketplace/superpowers-chrome/2.0.0/skills/browsing
DEST=packages/cli/src/lib/skills/browsing
mkdir -p "$DEST"
cp "$SRC/SKILL.md" "$DEST/"
cp "$SRC/COMMANDLINE-USAGE.md" "$DEST/"
cp "$SRC/EXAMPLES.md" "$DEST/"
cp "$SRC/README.md" "$DEST/"
if [ -d "$SRC/lib" ]; then
  mkdir -p "$DEST/lib"
  cp -r "$SRC/lib/." "$DEST/lib/"
fi
```

- [ ] **Step 2: Verify the copied files render correctly**

```bash
ls -la packages/cli/src/lib/skills/browsing/
head -20 packages/cli/src/lib/skills/browsing/SKILL.md
```

Expected: SKILL.md starts with the YAML frontmatter `name: browsing`. Other files present.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/lib/skills/browsing/
git commit -m "feat(cli): vendor superpowers-chrome browsing skill (v2.0.0)"
```

### Task 4.2: Extend `SKILL_APPLICABILITY` to include `browsing`

**Files:**

- Modify: `packages/cli/src/lib/run/skill-injection.ts`
- Modify: `packages/cli/src/lib/run/skill-injection.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/cli/src/lib/run/skill-injection.test.ts`, add:

```typescript
it('includes both visual-fidelity-check and browsing when visual_fidelity is configured', () => {
  const config = makeConfig({
    visual_fidelity: {
      figma_file_key: 'key',
      figma_pages: ['Composites'],
      component_dir: 'src/components',
      dashboard_url: 'http://localhost:5173',
      snapshot_path: '.crew/figma-snapshot',
      code_connect_glob: '**/*.figma.tsx',
      skip_snapshot: false,
    },
  });
  expect(skillsApplicableTo(config).sort()).toEqual(['browsing', 'visual-fidelity-check']);
});

it('returns an empty list when visual_fidelity is not configured', () => {
  const config = makeConfig({});
  expect(skillsApplicableTo(config)).toEqual([]);
});
```

(Reuse `makeConfig` helper or import it from the existing test setup.)

- [ ] **Step 2: Run the test to verify the new case fails**

Run: `npx vitest run packages/cli/src/lib/run/skill-injection.test.ts`
Expected: FAIL — `skillsApplicableTo` returns only `['visual-fidelity-check']`.

- [ ] **Step 3: Update `skill-injection.ts`**

Replace the `SKILL_APPLICABILITY` const in `packages/cli/src/lib/run/skill-injection.ts`:

```typescript
const SKILL_APPLICABILITY: ReadonlyArray<{
  name: string;
  applicable: (config: ProjectConfig) => boolean;
}> = [
  {
    name: 'visual-fidelity-check',
    applicable: (config) => Boolean(config.visual_fidelity),
  },
  {
    name: 'browsing',
    applicable: (config) => Boolean(config.visual_fidelity),
  },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run packages/cli/src/lib/run/skill-injection.test.ts`
Expected: PASS — both cases.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/run/skill-injection.ts packages/cli/src/lib/run/skill-injection.test.ts
git commit -m "feat(cli): inject browsing skill alongside visual-fidelity-check"
```

---

## Phase 5 — Rename `playwright/` → `mcp-config/` (B2.1, completing the rename)

### Task 5.1: Rename the directory and update all imports

**Files:**

- Move: `packages/cli/src/lib/playwright/` → `packages/cli/src/lib/mcp-config/`
- Modify: every import that references `lib/playwright/`

- [ ] **Step 1: Discover the import sites**

Run: `grep -rn "lib/playwright" packages/cli/src --include="*.ts" --include="*.tsx"`
Expected: a handful of files (run.ts, index.ts, possibly others).

- [ ] **Step 2: Perform the rename**

```bash
git mv packages/cli/src/lib/playwright packages/cli/src/lib/mcp-config
```

- [ ] **Step 3: Update imports**

For each file the grep in Step 1 surfaced, replace `lib/playwright` with `lib/mcp-config`. Common locations:

- `packages/cli/src/lib/index.ts` — the public re-export.
- `packages/cli/src/commands/run.ts` — already touched in Task 3.1.

- [ ] **Step 4: Verify the tree compiles**

Run: `npm run -w crew-cli typecheck`
Expected: PASS — no module-not-found errors.

- [ ] **Step 5: Run the full test suite**

Run: `npm run -w crew-cli test:run`
Expected: PASS — no regressions.

- [ ] **Step 6: Commit**

```bash
git add -A packages/cli/src/lib/mcp-config packages/cli/src/lib/index.ts packages/cli/src/commands/run.ts
git commit -m "refactor(cli): rename lib/playwright/ to lib/mcp-config/ now that chrome lives there"
```

---

## Phase 6 — Rewrite visual-fidelity-check Step 5 + SKILL.md overview (B2.3 + B2.4)

### Task 6.1: Rewrite `workflow.md` Step 5

**Files:**

- Modify: `packages/cli/src/lib/skills/visual-fidelity-check/workflow.md`

Locate the current `## Step 5: Visual check (optional, requires dashboardUrl)` section. Replace it with the five sub-steps below.

- [ ] **Step 1: Replace the Step 5 section**

Find this current content (and the surrounding markers):

```markdown
## Step 5: Visual check (optional, requires dashboardUrl)

If `dashboardUrl` is set in project config AND the dashboard is reachable:

1. Open the dashboard via Playwright MCP (or whatever browser-control MCP is wired up).
2. For each touched component, navigate to a screen that exercises it (agent drawer, projects page, etc. — use the component's known usage sites).
3. Screenshot the relevant region.
4. Compare to Figma's screen-level screenshot from `<snapshotPath>/screens/`. Describe what you see in both, side-by-side. Look for:
   - Missing borders or fills
   - Wrong icon glyphs
   - Padding / spacing differences
   - Text size or weight differences
   - Color shift (even small ones)
5. For each visual mismatch, flag as a finding. If the structural / caller checks already caught it, link them in the visual finding instead of duplicating.

If the dashboard is unreachable: skip step 5, note the gap in the report, proceed (visual check is optional, structural + caller are required).
```

Replace it with:

````markdown
## Step 5: Live DOM check (required when `dashboardUrl` is set and chrome MCP is wired)

This step uses the `browsing` skill's `mcp__chrome__use_browser` tool to inspect the rendered DOM directly — reading computed CSS, the rendered `<svg>` for icons, and a viewport screenshot via auto-capture. Step 5 catches drift the static Step 3 cannot (Tailwind purging, specificity wars, theme overrides, conditional rendering bugs).

**Required when:** `dashboardUrl` is set in project config AND the worktree's `.mcp.json` includes a `chrome` server entry. (The dispatcher writes the chrome entry when the user has `superpowers-chrome` installed; missing chrome means the step degrades to a verification gap, not "passed".)

### Step 5.1 — Open the dashboard

Use `mcp__chrome__use_browser` with `action: "navigate"`, payload set to the resolved `dashboardUrl` from project config. Then `action: "await_element"` on a known landing-page selector (the dashboard's root layout element) with a generous timeout.

If chrome is unreachable or the navigate fails: log "verification gap: chrome unreachable at `<url>`" and skip 5.2–5.5. **Do not** mark Step 5 as passed.

### Step 5.2 — Identify the live element for each touched (component, variant)

For each (component, variant) the code can produce, identify the dashboard route or in-app navigation that surfaces an instance. Reuse the caller-map work from Step 4 — it already enumerates call sites. Pick a screen that exercises the variant.

Selector identification is the agent's responsibility per dispatch:

1. **Prefer `data-*` attributes** if the project's components expose them (`[data-component="agent-row"]`, etc.).
2. **Fall back to class signatures** that uniquely identify the variant (`.bg-state-running.border-state-running\/30`).
3. **Last resort: structural selectors** (`main > section > .first-row`). If you use a structural selector, log a verification-gap note in the report — the selector is fragile.

### Step 5.3 — Color-property check

For each touched (component, variant) instance:

1. Query the live element via the selector identified in 5.2.
2. Use `use_browser` `action: "eval"` with a small payload:
   ```js
   const el = document.querySelector('<selector>');
   const cs = getComputedStyle(el);
   return { bg: cs.backgroundColor, border: cs.borderColor, color: cs.color };
   ```
````

3. CDP returns each value in `rgb(R, G, B)` or `rgba(R, G, B, A)` form. Convert to `#RRGGBB` (and note alpha separately if present).
4. Look up the same paint role in the Figma snapshot's `enrichment.boundVariables` for this node. Compare `resolvedHex` to the computed value.
5. On mismatch: finding. Severity follows the existing rules (large hex delta = high; near-identical = low). Cite the live element's selector, the computed CSS value, and the Figma `resolvedAlias` + `resolvedHex`.

### Step 5.4 — Icon check

For each touched component whose Figma reference has an `Icon` INSTANCE_SWAP property (read from `enrichment.componentProperties.Icon`):

1. Query the icon slot via selector (`[data-icon-slot]`, the first child, etc.).
2. Use `use_browser` `action: "eval"` to inspect the rendered child:
   ```js
   const slot = document.querySelector('<selector>');
   const svg = slot.querySelector('svg');
   const span = slot.querySelector('span:not(:has(svg))');
   return {
     hasSvg: !!svg,
     svgOuter: svg?.outerHTML?.slice(0, 500),
     svgLucide:
       svg?.getAttribute('data-lucide') ||
       [...(svg?.classList || [])].find((c) => c.startsWith('lucide-')),
     spanText: span?.textContent,
     slotText: slot.textContent,
   };
   ```
3. Cases:
   - **`hasSvg` true, `svgLucide` matches `enrichment.componentProperties.Icon.name`** (e.g. both `lucide/circle`) → no finding.
   - **`hasSvg` true, `svgLucide` mismatches** → finding, severity ≥ medium. Name the expected lucide glyph in the fix.
   - **`hasSvg` false, `spanText` is a Unicode glyph** (↗, ✓, ×, etc.) → finding, severity ≥ medium. Name the expected lucide glyph.
   - **`hasSvg` false, `slot` is a styled `<span>`** (CSS-only icon) → finding, severity ≥ medium. Name the expected lucide glyph and call out the CSS-only-approximation pattern.

Step 5.4 is the _runtime_ counterpart to Step 4's caller-side icon check. Step 4 catches the source pattern; Step 5.4 catches cases where the source looks right but the rendered DOM disagrees (className override, conditional rendering, prop-forwarding bug).

### Step 5.5 — Screenshot capture and cross-reference

`use_browser`'s auto-capture saves a viewport PNG on every action — by the time you've completed 5.1–5.4, you have a stack of screenshots. Cite the most recent one (after navigation to the relevant screen) in the report. Cross-reference it with `<snapshotPath>/screens/<screen-node>.png` from the Figma snapshot.

If 5.1–5.4 already surfaced findings, link the screenshot pair as supporting evidence rather than redundantly describing the same diff in prose.

**Failure mode (dashboard unreachable mid-run):** if Step 5.1 succeeded but a subsequent action fails because docker stopped / port mismatch / etc., fail closed — log "verification gap: dashboard became unreachable at <action>" and surface in the report. Do not treat as "Step 5 passed."

````

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/lib/skills/visual-fidelity-check/workflow.md
git commit -m "feat(skill): rewrite visual-fidelity Step 5 as live-DOM inspection with chrome"
````

### Task 6.2: Update `SKILL.md` workflow overview and Related skills

**Files:**

- Modify: `packages/cli/src/lib/skills/visual-fidelity-check/SKILL.md`

- [ ] **Step 1: Update the Workflow overview list**

Locate the existing line:

```markdown
6. **Visual check** (optional) — render + screenshot + compare to Figma screen
```

Replace with:

```markdown
6. **Live DOM check** (required when `dashboardUrl` is set and chrome MCP is wired) — read computed CSS + rendered `<svg>` via `mcp__chrome__use_browser`, compare to Figma snapshot's enrichment data
```

- [ ] **Step 2: Update the Related skills section**

Locate the existing "Related skills" section. Add a `browsing` entry. The section becomes:

```markdown
## Related skills

- `browsing` — controls the running dashboard via Chrome DevTools Protocol; required by Step 5 (live DOM inspection)
- `superpowers:writing-skills` — for iterating this skill
- `figma:figma-use` — only if you need to fetch live Figma data (the on-disk snapshot covers normal runs)
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/lib/skills/visual-fidelity-check/SKILL.md
git commit -m "feat(skill): SKILL.md overview reflects live-DOM Step 5 + browsing as peer"
```

---

## End of first ticket (B2.1–B2.4)

Phases 1–6 above belong to **Ticket 1: Wire chrome MCP + browsing skill + live-DOM Step 5**. Phase 7 below is **Ticket 2: Wire `[visual_fidelity]` into crew's own project** — independent, can ship in parallel.

---

## Phase 7 — Wire `[visual_fidelity]` into crew + Code Connect gap-fills (B2.5)

### Task 7.1: Author the contributor setup doc

**Files:**

- Create: `docs/visual-fidelity-setup.md`

- [ ] **Step 1: Write the doc**

````markdown
# Visual fidelity setup (per-contributor)

Crew uses the `visual-fidelity-check` skill in autonomous `crew run CREW-*` dispatches when the project's `[visual_fidelity]` block is configured. Because the project config lives at `~/.config/crew/projects/crew.toml` (user-local, machine-specific), each contributor wires this themselves.

## Paste the block

Add the following section to your `~/.config/crew/projects/crew.toml`:

```toml
[visual_fidelity]
figma_file_key = "9FeJPriqdsdA4n9R5Xsrr8"
figma_pages = ["Composites", "Dashboard Screens"]
component_dir = "packages/dashboard/src/components"
dashboard_url = "${APP_URL}"
```
````

(`snapshot_path` defaults to `.crew/figma-snapshot`; `code_connect_glob` defaults to `**/*.figma.tsx`. Override either if you need to.)

## Verify

From the crew repo root:

```sh
crew figma-snapshot
```

This populates `.crew/figma-snapshot/` (gitignored) with `index.json` and per-node JSON files including the `enrichment` field. Check the output reports a non-zero `nodesExported`.

## Why this isn't in the repo

The project config (`crew.toml`) lives in `~/.config/crew/projects/` rather than the repo because individual contributors may run with different setups (figma file forks, different snapshot paths, etc.). The `figma_file_key` above points at the canonical Crew design file and is safe to share, but the broader pattern is "config in `~/.config/crew/`, not in the repo".

````

- [ ] **Step 2: Link from README.md**

Find the "Local development" section in `README.md`. Add a bullet:

```markdown
- **Visual fidelity setup.** See [`docs/visual-fidelity-setup.md`](./docs/visual-fidelity-setup.md) for the `[visual_fidelity]` block to paste into your local `~/.config/crew/projects/crew.toml`.
````

- [ ] **Step 3: Commit**

```bash
git add docs/visual-fidelity-setup.md README.md
git commit -m "docs: visual-fidelity-setup contributor guide"
```

### Task 7.2: Author `.figma.tsx` for Timeline-family components

**Files:**

- Create: `packages/dashboard/src/components/Timeline/Timeline.figma.tsx`
- Create: `packages/dashboard/src/components/Timeline/EventCard.figma.tsx`
- Create: `packages/dashboard/src/components/Timeline/FilterChips.figma.tsx`
- Create: `packages/dashboard/src/components/Timeline/LiveModeToggle.figma.tsx`
- Create: `packages/dashboard/src/components/Timeline/SearchBar.figma.tsx`

For each Timeline component:

- [ ] **Step 1: Look up the Figma node ID**

Use `mcp__plugin_figma_figma__get_design_context` against the Crew file (`9FeJPriqdsdA4n9R5Xsrr8`) on the `Dashboard Screens` and `Composites` pages. Identify each Timeline component's canonical node.

- [ ] **Step 2: Author the `.figma.tsx` file**

Pattern (use `AgentRow.figma.tsx` as a reference for shape and import style):

```tsx
// packages/dashboard/src/components/Timeline/Timeline.figma.tsx
import figma from '@figma/code-connect';
import { Timeline } from './Timeline';

figma.connect(
  Timeline,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=<node-id>',
  {
    props: {
      // map Figma component properties to React props
    },
    example: () => <Timeline />,
  },
);
```

Repeat for `EventCard`, `FilterChips`, `LiveModeToggle`, `SearchBar`.

- [ ] **Step 3: Commit each as you go**

```bash
git add packages/dashboard/src/components/Timeline/Timeline.figma.tsx
git commit -m "feat(dashboard): Code Connect mapping for Timeline"
# ... repeat per file
```

### Task 7.3: Audit `ColumnHeaderRow` and `ProjectsTable`; author Code Connect if Figma counterpart exists

**Files:**

- Possibly create: `packages/dashboard/src/components/ColumnHeaderRow.figma.tsx`
- Possibly create: `packages/dashboard/src/components/ProjectsTable.figma.tsx`

- [ ] **Step 1: Search the Crew Figma file for counterparts**

Use `mcp__plugin_figma_figma__search_design_system` or browse the Dashboard Screens page for `ColumnHeaderRow` and `ProjectsTable` equivalents.

- [ ] **Step 2: Author Code Connect files where counterparts exist**

For each counterpart found, author a `.figma.tsx` following Task 7.2's pattern.

- [ ] **Step 3: If no counterpart, note in the PR description**

If neither has a Figma counterpart, surface it in the PR description: "`ColumnHeaderRow` and `ProjectsTable` have no Figma counterparts and remain unmapped." `ErrorFallback` is acknowledged as a generic primitive with no counterpart.

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/components/*.figma.tsx
git commit -m "feat(dashboard): Code Connect mappings for ColumnHeaderRow + ProjectsTable"
```

(Skip the commit if no new files were authored.)

### Task 7.4: Run `crew figma-snapshot` and verify output

**Files:**

- Verify (no files modified): `.crew/figma-snapshot/index.json`, sample per-node JSON

- [ ] **Step 1: Paste the TOML block into your local config**

Per Task 7.1's doc, paste the `[visual_fidelity]` block into `~/.config/crew/projects/crew.toml`. (Do this in your local shell; not part of the PR.)

- [ ] **Step 2: Run the snapshot command**

```sh
cd /home/safturento/Repos/crew
crew figma-snapshot
```

Expected output: `✓ figma-snapshot complete (N nodes)` where N > 0.

- [ ] **Step 3: Spot-check the output**

```sh
cat .crew/figma-snapshot/index.json | jq '.nodes | length'
# Expected: matches the nodesExported count above

ls .crew/figma-snapshot/*.json | head -3
cat $(ls .crew/figma-snapshot/*.json | head -1) | jq '.enrichment | keys'
# Expected: ["boundVariables", "componentProperties", "mainComponent"] (or a subset)
```

If `enrichment` is absent on a node it shouldn't be, the snapshot fell back to REST-only mode. Investigate the figma-snapshot logs.

- [ ] **Step 4: Note in the PR description**

Include the snapshot output line and a one-sentence summary of the spot-check ("snapshot exported N nodes; enrichment present on sampled node X").

(No commit — `.crew/figma-snapshot/` is gitignored.)

### Task 7.5: Move the followup entry (if any) to Resolved

**Files:**

- Modify: `docs/followups.md`

If `docs/followups.md` has an entry filed for the visual-fidelity B2 / superpowers-chrome work during prior planning, move it from `## Active` to `## Resolved`, append `**Resolved 2026-05-13:** one-line summary.`, and update the `## Contents` ToC.

- [ ] **Step 1: Scan for the entry**

```sh
grep -n "superpowers-chrome\|visual-fidelity.*B2\|chrome.*MCP" docs/followups.md
```

- [ ] **Step 2: Move the entry (if it exists)**

Edit `docs/followups.md` to cut the entry from `## Active`, paste under `## Resolved`, append the resolution note, and update both ToC bullets.

- [ ] **Step 3: Commit**

```bash
git add docs/followups.md
git commit -m "docs(followups): resolve superpowers-chrome integration"
```

(Skip the commit if no matching entry was found.)

---

## Self-review checklist

After all phases complete, before opening PRs:

- [ ] **Spec coverage**: every section of the spec maps to at least one task above.
  - B2.1 → Phases 1, 2, 3, 5 ✓
  - B2.2 → Phase 4 ✓
  - B2.3 → Phase 6 (Task 6.1) ✓
  - B2.4 → Phase 6 (Task 6.2) ✓
  - B2.5 → Phase 7 ✓
- [ ] **No placeholders**: search the plan for "TBD", "TODO", "etc.", "similar to". The only acceptable "etc." is one inside a code snippet that lists examples; verify each is concrete enough.
- [ ] **Type consistency**: `buildMcpConfig` accepts `{ playwright?, chrome? }` everywhere; `writeMcpFile` returns `{ existed, chromiumPath, chromeMcpPath }` everywhere; `WriteMcpFileOptions` exposes `playwright?`, `chrome?`, `home?`, `warn?` consistently.
- [ ] Verify each `git mv` in Phase 5 leaves no orphan imports — re-grep after the rename.
