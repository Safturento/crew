# Figma snapshot — Plugin-API enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Plugin-API enrichment pass to `crew figma-snapshot` that populates per-instance `componentProperties` + paint-level `boundVariables` into the per-node JSONs, closing the specific-accuracy gap surfaced by the `visual-fidelity-check` calibration.

**Architecture:** Hybrid. The existing REST emit stays unchanged. A new `enrichSnapshotWithPluginApi` orchestrator runs after the REST pass, shells out to a `claude -p` subprocess with a structured prompt, and the subprocess uses the figma MCP `use_figma` tool to fetch Plugin-API data. The enriched data lands in a new `enrichment` field on each per-node JSON. Default-on with graceful fallback to REST-only when `claude` is absent or the subprocess fails.

**Tech Stack:** Node.js (`packages/cli/`), `execa` for subprocess management, vitest for tests, `claude` CLI as the bridge to Figma MCP.

**Spec:** [`docs/superpowers/specs/2026-05-13-figma-snapshot-plugin-api-enrichment-design.md`](../specs/2026-05-13-figma-snapshot-plugin-api-enrichment-design.md)

**Working directory:** `packages/cli/`

---

## Task 1: Add prompt builder

**Files:**

- Create: `packages/cli/src/lib/figma-snapshot/enrichment-prompt.ts`
- Create: `packages/cli/src/lib/figma-snapshot/enrichment-prompt.test.ts`

This module owns the prompt text + the JavaScript payload that the `use_figma` MCP call executes. The prompt is built once per invocation via `buildEnrichmentPrompt({ snapshotDir, fileKey })`.

### Step 1.1: Write failing test for `buildEnrichmentPrompt`

- [ ] Create `packages/cli/src/lib/figma-snapshot/enrichment-prompt.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildEnrichmentPrompt } from './enrichment-prompt.js';

describe('buildEnrichmentPrompt', () => {
  it('embeds the snapshot directory absolute path', () => {
    const prompt = buildEnrichmentPrompt({
      snapshotDir: '/tmp/my-snapshot',
      fileKey: 'ABC123',
    });
    expect(prompt).toContain('/tmp/my-snapshot');
  });

  it('embeds the figma file key', () => {
    const prompt = buildEnrichmentPrompt({
      snapshotDir: '/tmp/x',
      fileKey: '9FeJPriqdsdA4n9R5Xsrr8',
    });
    expect(prompt).toContain('9FeJPriqdsdA4n9R5Xsrr8');
  });

  it('includes the use_figma MCP tool name', () => {
    const prompt = buildEnrichmentPrompt({
      snapshotDir: '/tmp/x',
      fileKey: 'X',
    });
    expect(prompt).toContain('mcp__plugin_figma_figma__use_figma');
  });

  it('mentions the index.json input path', () => {
    const prompt = buildEnrichmentPrompt({
      snapshotDir: '/tmp/x',
      fileKey: 'X',
    });
    expect(prompt).toContain('index.json');
  });

  it('mentions the summary stdout contract', () => {
    const prompt = buildEnrichmentPrompt({
      snapshotDir: '/tmp/x',
      fileKey: 'X',
    });
    expect(prompt).toContain('enrichedNodeCount');
  });
});
```

### Step 1.2: Run failing test

- [ ] Run from `packages/cli/`:

```bash
npx vitest run src/lib/figma-snapshot/enrichment-prompt.test.ts
```

Expected: FAIL with "Cannot find module './enrichment-prompt.js'".

### Step 1.3: Implement `buildEnrichmentPrompt`

- [ ] Create `packages/cli/src/lib/figma-snapshot/enrichment-prompt.ts`:

```ts
export interface BuildEnrichmentPromptOptions {
  snapshotDir: string;
  fileKey: string;
}

/**
 * Build the prompt sent to `claude -p` for the Plugin-API enrichment pass.
 *
 * The prompt instructs Claude to read the REST-emitted snapshot, call the
 * figma MCP tool once with a script that iterates over every node ID, merge
 * the returned enrichment into each on-disk JSON, and write a summary.
 */
export function buildEnrichmentPrompt(opts: BuildEnrichmentPromptOptions): string {
  const { snapshotDir, fileKey } = opts;
  return `# crew figma-snapshot — Plugin-API enrichment task

You are a one-shot worker. Walk the snapshot at \`${snapshotDir}\` and add Plugin-API-only data to each per-node JSON (\`componentProperties\`, \`mainComponent\`, \`boundVariables\`). The REST data on disk is the source of truth for everything else — do not modify the \`raw\` field of any JSON file.

## Inputs

- Snapshot index: \`${snapshotDir}/index.json\`
- Figma file key: \`${fileKey}\`

## Procedure

1. Read \`${snapshotDir}/index.json\`. Extract the array of node IDs (the object's keys).
2. Call the \`mcp__plugin_figma_figma__use_figma\` MCP tool ONCE with the script in the section below. Substitute \`<NODE_IDS_JSON>\` with a JSON array of the node IDs (the keys from index.json). Pass \`fileKey: "${fileKey}"\` and \`skillNames: "figma-use"\`.
3. The script returns an object mapping nodeId → enrichment object (or \`{ error: "..." }\` per node that failed).
4. For each successful entry, read the corresponding metadata JSON file (per \`index.json\`'s \`metadataPath\` field, joined to \`${snapshotDir}\`), add the returned enrichment object as a top-level \`enrichment\` field on the JSON, and write the file back to disk. Do NOT modify the \`raw\` field.
5. When all files are written, output a single-line JSON summary to stdout matching this shape exactly (this is the LAST line of stdout, nothing after it):

   \`{"enrichedNodeCount": <number>, "errors": [{"nodeId": "<id>", "reason": "<message>"}]}\`

   Also write the same summary to \`${snapshotDir}/.enrichment-summary.json\`.

## Script to pass to use_figma

\`\`\`javascript
${ENRICHMENT_SCRIPT}
\`\`\`

The script must run on the file specified by \`fileKey\` above. Do not navigate pages — \`figma.getNodeByIdAsync\` resolves nodes regardless of current page.

Constraints:
- Do not create any other files in the snapshot directory.
- Do not modify the snapshot's PNG files.
- Do not retry on transient failures; report them in the \`errors\` array of the summary.
- Keep your reasoning concise. The summary JSON is the only output that matters for downstream tooling.`;
}

const ENRICHMENT_SCRIPT = `const ids = <NODE_IDS_JSON>;
const out = {};

async function paintTokenAlias(paint) {
  if (!paint || !paint.boundVariables || !paint.boundVariables.color || !paint.boundVariables.color.id) {
    return null;
  }
  const varId = paint.boundVariables.color.id;
  try {
    const v = await figma.variables.getVariableByIdAsync(varId);
    if (!v) return { variableId: varId, variableName: null, resolvedAlias: null, resolvedHex: null };
    const chain = [v.name];
    const c0 = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId);
    let val = c0 ? v.valuesByMode[c0.defaultModeId || c0.modes[0].modeId] : null;
    let hops = 0;
    while (val && typeof val === 'object' && 'id' in val && val.type === 'VARIABLE_ALIAS' && hops < 5) {
      hops++;
      const next = await figma.variables.getVariableByIdAsync(val.id);
      if (!next) break;
      chain.push(next.name);
      const nc = await figma.variables.getVariableCollectionByIdAsync(next.variableCollectionId);
      val = nc ? next.valuesByMode[nc.defaultModeId || nc.modes[0].modeId] : null;
    }
    let resolvedHex = null;
    if (val && typeof val === 'object' && 'r' in val) {
      resolvedHex = '#' +
        Math.round(val.r * 255).toString(16).padStart(2, '0').toUpperCase() +
        Math.round(val.g * 255).toString(16).padStart(2, '0').toUpperCase() +
        Math.round(val.b * 255).toString(16).padStart(2, '0').toUpperCase();
    }
    return { variableId: varId, variableName: v.name, resolvedAlias: chain.join(' -> '), resolvedHex };
  } catch (e) {
    return { variableId: varId, variableName: null, resolvedAlias: null, resolvedHex: null };
  }
}

for (const id of ids) {
  try {
    const node = await figma.getNodeByIdAsync(id);
    if (!node) { out[id] = { error: 'not found' }; continue; }

    const enrichment = {
      source: 'plugin-api',
      capturedAt: new Date().toISOString(),
      componentProperties: null,
      mainComponent: null,
      boundVariables: [],
    };

    if (node.type === 'INSTANCE') {
      const cp = node.componentProperties || {};
      enrichment.componentProperties = {};
      for (const key of Object.keys(cp)) {
        const prop = cp[key];
        let value = prop.value;
        if (prop.type === 'INSTANCE_SWAP' && prop.value) {
          try {
            const ref = await figma.getNodeByIdAsync(prop.value);
            if (ref) value = { id: prop.value, name: ref.name };
          } catch (e) { /* leave value as id */ }
        }
        enrichment.componentProperties[key.split('#')[0]] = value;
      }
      if (node.mainComponent) {
        enrichment.mainComponent = {
          id: node.mainComponent.id,
          name: node.mainComponent.name,
          parentSetName: node.mainComponent.parent ? node.mainComponent.parent.name : null,
        };
      }
    }

    const paintProps = ['fills', 'strokes', 'backgrounds'];
    for (const propName of paintProps) {
      const paints = node[propName];
      if (!Array.isArray(paints)) continue;
      for (let i = 0; i < paints.length; i++) {
        const paint = paints[i];
        if (!paint || paint.visible === false) continue;
        const info = await paintTokenAlias(paint);
        if (info) {
          enrichment.boundVariables.push({
            path: \`\${propName}[\${i}].color\`,
            ...info,
          });
        }
      }
    }

    out[id] = enrichment;
  } catch (e) {
    out[id] = { error: e && e.message ? e.message : String(e) };
  }
}

return out;
`;
```

### Step 1.4: Run test to verify pass

- [ ] Run from `packages/cli/`:

```bash
npx vitest run src/lib/figma-snapshot/enrichment-prompt.test.ts
```

Expected: 5/5 passing.

### Step 1.5: Commit

- [ ] Stage + commit:

```bash
git add packages/cli/src/lib/figma-snapshot/enrichment-prompt.ts \
        packages/cli/src/lib/figma-snapshot/enrichment-prompt.test.ts
git commit -m "feat(cli): figma-snapshot enrichment-prompt builder"
```

---

## Task 2: Add `enrichSnapshotWithPluginApi` orchestrator

**Files:**

- Create: `packages/cli/src/lib/figma-snapshot/plugin-api-enrichment.ts`
- Create: `packages/cli/src/lib/figma-snapshot/plugin-api-enrichment.test.ts`
- Modify: `packages/cli/src/lib/figma-snapshot/index.ts`

The orchestrator probes for `claude`, spawns the subprocess, parses the summary, and returns a discriminated-union result.

### Step 2.1: Write failing test for the orchestrator

- [ ] Create `packages/cli/src/lib/figma-snapshot/plugin-api-enrichment.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import {
  enrichSnapshotWithPluginApi,
  type ClaudeRunner,
  type ClaudeProbe,
} from './plugin-api-enrichment.js';

describe('enrichSnapshotWithPluginApi', () => {
  const baseOpts = {
    snapshotDir: '/tmp/fake-snapshot',
    fileKey: 'ABC123',
    log: () => {},
    warn: () => {},
  };

  it('skips when claude is not on PATH', async () => {
    const probe: ClaudeProbe = async () => null;
    const runner = vi.fn();
    const result = await enrichSnapshotWithPluginApi({
      ...baseOpts,
      probeClaude: probe,
      runClaude: runner as never,
    });
    expect(result).toEqual({ kind: 'skipped', reason: 'claude not on PATH' });
    expect(runner).not.toHaveBeenCalled();
  });

  it('returns ok with parsed summary on subprocess success', async () => {
    const probe: ClaudeProbe = async () => '/usr/local/bin/claude';
    const runner: ClaudeRunner = async () => ({
      exitCode: 0,
      stdout: 'some preamble text\n{"enrichedNodeCount":5,"errors":[]}',
      stderr: '',
    });
    const result = await enrichSnapshotWithPluginApi({
      ...baseOpts,
      probeClaude: probe,
      runClaude: runner,
    });
    expect(result).toEqual({
      kind: 'ok',
      enrichedNodeCount: 5,
      errors: [],
    });
  });

  it('returns warning when subprocess exits non-zero', async () => {
    const probe: ClaudeProbe = async () => '/usr/local/bin/claude';
    const runner: ClaudeRunner = async () => ({
      exitCode: 1,
      stdout: '',
      stderr: 'oh no',
    });
    const result = await enrichSnapshotWithPluginApi({
      ...baseOpts,
      probeClaude: probe,
      runClaude: runner,
    });
    expect(result.kind).toBe('warning');
    if (result.kind === 'warning') {
      expect(result.reason).toMatch(/exit/i);
    }
  });

  it('returns warning when subprocess stdout has no JSON summary on last line', async () => {
    const probe: ClaudeProbe = async () => '/usr/local/bin/claude';
    const runner: ClaudeRunner = async () => ({
      exitCode: 0,
      stdout: 'I did the thing.\nBut forgot to print the summary.',
      stderr: '',
    });
    const result = await enrichSnapshotWithPluginApi({
      ...baseOpts,
      probeClaude: probe,
      runClaude: runner,
    });
    expect(result.kind).toBe('warning');
    if (result.kind === 'warning') {
      expect(result.reason).toMatch(/summary/i);
    }
  });

  it('returns warning when summary parses but enrichedNodeCount is missing', async () => {
    const probe: ClaudeProbe = async () => '/usr/local/bin/claude';
    const runner: ClaudeRunner = async () => ({
      exitCode: 0,
      stdout: '{"foo":"bar"}',
      stderr: '',
    });
    const result = await enrichSnapshotWithPluginApi({
      ...baseOpts,
      probeClaude: probe,
      runClaude: runner,
    });
    expect(result.kind).toBe('warning');
  });

  it('returns warning when subprocess throws (timeout, kill, etc.)', async () => {
    const probe: ClaudeProbe = async () => '/usr/local/bin/claude';
    const runner: ClaudeRunner = async () => {
      throw new Error('TimeoutError');
    };
    const result = await enrichSnapshotWithPluginApi({
      ...baseOpts,
      probeClaude: probe,
      runClaude: runner,
    });
    expect(result.kind).toBe('warning');
    if (result.kind === 'warning') {
      expect(result.reason).toMatch(/TimeoutError/);
    }
  });

  it('passes the built prompt to the runner via the -p flag pattern', async () => {
    const probe: ClaudeProbe = async () => '/usr/local/bin/claude';
    const runner = vi.fn(async () => ({
      exitCode: 0,
      stdout: '{"enrichedNodeCount":0,"errors":[]}',
      stderr: '',
    }));
    await enrichSnapshotWithPluginApi({
      ...baseOpts,
      probeClaude: probe,
      runClaude: runner,
    });
    expect(runner).toHaveBeenCalledTimes(1);
    const callArgs = runner.mock.calls[0][0];
    expect(callArgs.prompt).toContain(baseOpts.snapshotDir);
    expect(callArgs.prompt).toContain(baseOpts.fileKey);
  });
});
```

### Step 2.2: Run failing test

- [ ] Run:

```bash
npx vitest run src/lib/figma-snapshot/plugin-api-enrichment.test.ts
```

Expected: FAIL with "Cannot find module './plugin-api-enrichment.js'".

### Step 2.3: Implement the orchestrator

- [ ] Create `packages/cli/src/lib/figma-snapshot/plugin-api-enrichment.ts`:

```ts
import { execa } from 'execa';
import { which } from '../which.js';
import { buildEnrichmentPrompt } from './enrichment-prompt.js';

export type ClaudeProbe = () => Promise<string | null>;

export interface ClaudeRunArgs {
  claudePath: string;
  prompt: string;
  cwd: string;
  timeoutMs: number;
}

export interface ClaudeRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export type ClaudeRunner = (args: ClaudeRunArgs) => Promise<ClaudeRunResult>;

export interface EnrichSnapshotOptions {
  snapshotDir: string;
  fileKey: string;
  log: (msg: string) => void;
  warn: (msg: string) => void;
  /** Test seam — defaults to looking for `claude` on PATH. */
  probeClaude?: ClaudeProbe;
  /** Test seam — defaults to spawning via execa. */
  runClaude?: ClaudeRunner;
  /** Subprocess timeout. Default 90s. */
  timeoutMs?: number;
}

export type EnrichSnapshotResult =
  | { kind: 'skipped'; reason: string }
  | { kind: 'ok'; enrichedNodeCount: number; errors: Array<{ nodeId: string; reason: string }> }
  | { kind: 'warning'; reason: string };

const DEFAULT_TIMEOUT_MS = 90_000;

const defaultProbe: ClaudeProbe = async () => {
  const found = await which('claude');
  return found ?? null;
};

const defaultRunner: ClaudeRunner = async ({ claudePath, prompt, cwd, timeoutMs }) => {
  const result = await execa(claudePath, ['-p', prompt], {
    cwd,
    timeout: timeoutMs,
    reject: false,
  });
  return {
    exitCode: result.exitCode ?? 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
};

function extractSummary(stdout: string): unknown {
  const lines = stdout.trim().split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith('{') && line.endsWith('}')) {
      try {
        return JSON.parse(line);
      } catch {
        // keep looking
      }
    }
  }
  return null;
}

/**
 * Run a Plugin-API enrichment pass on an existing REST-emitted snapshot.
 *
 * Non-fatal — failures (claude missing, subprocess crash, malformed output)
 * return a `warning` result so the caller can continue with REST-only data.
 */
export async function enrichSnapshotWithPluginApi(
  opts: EnrichSnapshotOptions,
): Promise<EnrichSnapshotResult> {
  const probe = opts.probeClaude ?? defaultProbe;
  const run = opts.runClaude ?? defaultRunner;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const claudePath = await probe();
  if (!claudePath) {
    opts.warn('claude not on PATH; Plugin-API enrichment skipped (snapshot remains REST-only)');
    return { kind: 'skipped', reason: 'claude not on PATH' };
  }

  const prompt = buildEnrichmentPrompt({
    snapshotDir: opts.snapshotDir,
    fileKey: opts.fileKey,
  });

  let runResult: ClaudeRunResult;
  try {
    runResult = await run({
      claudePath,
      prompt,
      cwd: opts.snapshotDir,
      timeoutMs,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    opts.warn(`figma-snapshot enrichment subprocess failed: ${reason}`);
    return { kind: 'warning', reason };
  }

  if (runResult.exitCode !== 0) {
    const stderrSnippet = runResult.stderr.split(/\r?\n/).slice(0, 5).join(' ');
    const reason = `claude exited ${runResult.exitCode}: ${stderrSnippet || '(no stderr)'}`;
    opts.warn(`figma-snapshot enrichment: ${reason}`);
    return { kind: 'warning', reason };
  }

  const summary = extractSummary(runResult.stdout);
  if (
    !summary ||
    typeof summary !== 'object' ||
    !('enrichedNodeCount' in summary) ||
    typeof (summary as { enrichedNodeCount: unknown }).enrichedNodeCount !== 'number'
  ) {
    const reason = 'subprocess stdout did not contain a valid JSON summary';
    opts.warn(`figma-snapshot enrichment: ${reason}`);
    return { kind: 'warning', reason };
  }

  const parsed = summary as {
    enrichedNodeCount: number;
    errors?: Array<{ nodeId: string; reason: string }>;
  };
  const errors = Array.isArray(parsed.errors) ? parsed.errors : [];
  opts.log(
    `figma-snapshot enrichment: ${parsed.enrichedNodeCount} nodes enriched${errors.length ? `, ${errors.length} errors` : ''}`,
  );
  if (errors.length > 0) {
    for (const e of errors.slice(0, 5)) {
      opts.warn(`  · ${e.nodeId}: ${e.reason}`);
    }
    if (errors.length > 5) {
      opts.warn(`  · ... and ${errors.length - 5} more`);
    }
  }
  return { kind: 'ok', enrichedNodeCount: parsed.enrichedNodeCount, errors };
}
```

### Step 2.4: Add `which` helper if it doesn't already exist

Inspect `packages/cli/src/lib/` for an existing `which` utility. If none exists:

- [ ] Create `packages/cli/src/lib/which.ts`:

```ts
import { execa } from 'execa';

/**
 * Resolve a binary on PATH; returns null if not found.
 * Equivalent to shell `which <name>` but pure Node/typed.
 */
export async function which(name: string): Promise<string | null> {
  try {
    const result = await execa('which', [name], { reject: false });
    if (result.exitCode === 0 && result.stdout) {
      return result.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}
```

If such a helper already exists at another path, use that and skip creating a new file. Update the orchestrator's import accordingly.

### Step 2.5: Update the figma-snapshot module's barrel export

- [ ] Modify `packages/cli/src/lib/figma-snapshot/index.ts` to re-export the new orchestrator. Read the existing file first:

```bash
cat packages/cli/src/lib/figma-snapshot/index.ts
```

Then add to its exports list:

```ts
export * from './plugin-api-enrichment.js';
export * from './enrichment-prompt.js';
```

### Step 2.6: Run tests to verify pass

- [ ] Run:

```bash
npx vitest run src/lib/figma-snapshot/plugin-api-enrichment.test.ts
```

Expected: 7/7 passing.

### Step 2.7: Commit

- [ ] Stage + commit:

```bash
git add packages/cli/src/lib/figma-snapshot/plugin-api-enrichment.ts \
        packages/cli/src/lib/figma-snapshot/plugin-api-enrichment.test.ts \
        packages/cli/src/lib/figma-snapshot/index.ts
# Also stage which.ts if you created it:
git add packages/cli/src/lib/which.ts 2>/dev/null || true
git commit -m "feat(cli): enrichSnapshotWithPluginApi orchestrator (subprocess + summary parser)"
```

---

## Task 3: Wire enrichment into `runFigmaSnapshot`

**Files:**

- Modify: `packages/cli/src/commands/figma-snapshot.ts`
- Modify: `packages/cli/src/commands/figma-snapshot.test.ts`

The existing `runFigmaSnapshot` calls `emitSnapshot` to do the REST pass. Add a follow-up call to `enrichSnapshotWithPluginApi`. The enrichment status surfaces in the return value so `runPreDispatchFigmaSnapshot` (in CREW-140) can log it.

### Step 3.1: Read existing `runFigmaSnapshot` to find the integration point

- [ ] Run:

```bash
cat packages/cli/src/commands/figma-snapshot.ts
```

Locate the function `runFigmaSnapshot` and the line where `emitSnapshot` returns. The new enrichment call goes immediately after, before the final return.

### Step 3.2: Write failing test for the enrichment integration

- [ ] Add to `packages/cli/src/commands/figma-snapshot.test.ts` (read the existing file first to match its style):

```ts
import { describe, it, expect, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runFigmaSnapshot } from './figma-snapshot.js';

describe('runFigmaSnapshot — enrichment pass', () => {
  it('calls enrichSnapshotWithPluginApi after emitSnapshot when visual_fidelity is configured', async () => {
    const worktree = mkdtempSync(join(tmpdir(), 'crew-fig-snap-enr-'));
    const mockClient = {
      getFile: async () => ({
        document: {
          id: '0:0',
          name: 'Document',
          type: 'DOCUMENT',
          children: [
            {
              id: '212:630',
              name: 'Composites',
              type: 'CANVAS',
              children: [{ id: '272:120', name: 'Pill', type: 'COMPONENT_SET', children: [] }],
            },
          ],
        },
      }),
      getImages: async () => ({ images: { '272:120': 'https://cdn/x.png' } }),
    };
    const enrichSpy = vi.fn().mockResolvedValue({ kind: 'ok', enrichedNodeCount: 1, errors: [] });
    const result = await runFigmaSnapshot({
      worktree,
      config: {
        visual_fidelity: {
          figma_file_key: 'FILEKEY',
          figma_pages: ['Composites'],
          component_dir: 'src',
          dashboard_url: 'http://localhost:3000',
          snapshot_path: '.crew/figma-snapshot',
          code_connect_glob: '**/*.figma.tsx',
          skip_snapshot: false,
        },
      } as never,
      log: () => {},
      clientFactory: () => mockClient as never,
      fetchImage: async () => Buffer.from('fake'),
      enrich: enrichSpy as never,
    });
    expect(enrichSpy).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(result.enrichment).toEqual({ kind: 'ok', enrichedNodeCount: 1, errors: [] });
    rmSync(worktree, { recursive: true });
  });

  it('completes with REST-only snapshot when enrichment skips', async () => {
    const worktree = mkdtempSync(join(tmpdir(), 'crew-fig-snap-enr-'));
    const mockClient = {
      getFile: async () => ({
        document: { id: '0:0', name: 'Doc', type: 'DOCUMENT', children: [] },
      }),
      getImages: async () => ({ images: {} }),
    };
    const enrichSpy = vi.fn().mockResolvedValue({ kind: 'skipped', reason: 'claude not on PATH' });
    const result = await runFigmaSnapshot({
      worktree,
      config: {
        visual_fidelity: {
          figma_file_key: 'FILEKEY',
          figma_pages: ['Composites'],
          component_dir: 'src',
          dashboard_url: 'http://localhost:3000',
          snapshot_path: '.crew/figma-snapshot',
          code_connect_glob: '**/*.figma.tsx',
          skip_snapshot: false,
        },
      } as never,
      log: () => {},
      clientFactory: () => mockClient as never,
      fetchImage: async () => Buffer.from('fake'),
      enrich: enrichSpy as never,
    });
    expect(result.ok).toBe(true);
    expect(result.enrichment).toEqual({ kind: 'skipped', reason: 'claude not on PATH' });
    rmSync(worktree, { recursive: true });
  });
});
```

### Step 3.3: Run failing test

- [ ] Run:

```bash
npx vitest run src/commands/figma-snapshot.test.ts
```

Expected: failure on the two new tests — `runFigmaSnapshot` doesn't accept an `enrich` dependency yet, and its result doesn't have an `enrichment` field.

### Step 3.4: Update `runFigmaSnapshot` to invoke the enrichment

- [ ] Modify `packages/cli/src/commands/figma-snapshot.ts`:

Add to imports:

```ts
import {
  enrichSnapshotWithPluginApi,
  type EnrichSnapshotResult,
} from '../lib/figma-snapshot/index.js';
```

Extend `FigmaSnapshotDeps`:

```ts
export interface FigmaSnapshotDeps {
  worktree: string;
  config: ProjectConfig;
  log: (msg: string) => void;
  clientFactory?: () => FigmaRestClient;
  fetchImage?: (url: string) => Promise<Buffer>;
  /** Test seam — defaults to `enrichSnapshotWithPluginApi`. */
  enrich?: (opts: {
    snapshotDir: string;
    fileKey: string;
    log: (msg: string) => void;
    warn: (msg: string) => void;
  }) => Promise<EnrichSnapshotResult>;
}
```

Extend `FigmaSnapshotResult`:

```ts
export interface FigmaSnapshotResult {
  ok: boolean;
  reason?: string;
  nodesExported?: number;
  enrichment?: EnrichSnapshotResult;
}
```

Inside `runFigmaSnapshot`, after the existing `emitSnapshot` call and before the final `return { ok: true, nodesExported }`:

```ts
const enrichRunner = deps.enrich ?? enrichSnapshotWithPluginApi;
const enrichmentResult = await enrichRunner({
  snapshotDir: outDir,
  fileKey: vf.figma_file_key,
  log: deps.log,
  warn: (msg) => deps.log(msg),
});
```

(The orchestrator already calls `warn` for problems; the parent surfaces them through the same `log`. The dispatch-side caller — `runPreDispatchFigmaSnapshot` — owns the `warn` channel for the parent shell.)

Final return shape:

```ts
return { ok: true, nodesExported, enrichment: enrichmentResult };
```

### Step 3.5: Run tests to verify pass

- [ ] Run:

```bash
npx vitest run src/commands/figma-snapshot.test.ts
```

Expected: all tests pass, including the two new enrichment tests.

### Step 3.6: Commit

- [ ] Stage + commit:

```bash
git add packages/cli/src/commands/figma-snapshot.ts \
        packages/cli/src/commands/figma-snapshot.test.ts
git commit -m "feat(cli): runFigmaSnapshot invokes Plugin-API enrichment after REST emit"
```

---

## Task 4: README update

**Files:**

- Modify: `README.md`

Document the new dependency on `claude` for full-fidelity snapshots, the fallback behavior, and the `FIGMA_API_TOKEN` env requirement (still REST-side).

### Step 4.1: Find the existing visual-fidelity section

- [ ] Run:

```bash
grep -n "visual_fidelity\|figma-snapshot\|FIGMA_API_TOKEN" README.md | head -10
```

There should be a section from CREW-139 documenting the basic snapshot setup.

### Step 4.2: Update the README

- [ ] Add to the relevant section (after the basic `[visual_fidelity]` TOML example):

```markdown
\`crew figma-snapshot\` runs two passes:

1. **REST pass** (always-on) — fetches the file structure + per-node screenshots
   via the Figma REST API. Requires \`FIGMA_API_TOKEN\` in your shell.
2. **Plugin-API enrichment pass** (default-on, optional) — when the \`claude\`
   CLI is available on \`PATH\`, shells out to a one-shot subprocess that adds
   per-instance \`componentProperties\` + paint-level variable bindings to the
   snapshot JSONs. Required for the \`visual-fidelity-check\` skill to produce
   specifically-correct fixes (e.g. naming the right lucide icon). If \`claude\`
   isn't on \`PATH\`, the enrichment pass is skipped with a warning; the
   snapshot remains usable at REST-pattern level.

Both passes run automatically when \`crew run\` dispatches a ticket with
\`[visual_fidelity]\` configured. To run standalone:

\`\`\`bash
export FIGMA_API_TOKEN=<token>
crew figma-snapshot
\`\`\`
```

### Step 4.3: Commit

- [ ] Stage + commit:

```bash
git add README.md
git commit -m "docs(readme): document Plugin-API enrichment pass + claude dependency"
```

---

## Task 5: End-to-end smoke verification (manual; no commit)

This task is verification only — no code changes. Run it locally after the implementation lands.

### Step 5.1: Confirm `claude` is on PATH

- [ ] Run:

```bash
which claude
```

Expected: a path is printed.

### Step 5.2: Confirm `FIGMA_API_TOKEN` is set + crew's visual-fidelity config exists

- [ ] Run:

```bash
echo "FIGMA_API_TOKEN set: ${FIGMA_API_TOKEN:+yes}${FIGMA_API_TOKEN:-no}"
cat ~/.config/crew/projects/crew.toml | grep -A5 visual_fidelity
```

Expected: token marker is `yes`; TOML block has `figma_file_key`, `figma_pages`, etc.

### Step 5.3: Run `crew figma-snapshot` standalone

- [ ] From the crew worktree:

```bash
cd ~/Repos/crew
crew figma-snapshot
```

Expected output (something like):

```
figma-snapshot: exporting pages Composites, Dashboard Screens → /home/.../.crew/figma-snapshot
figma-snapshot: exported 50 nodes
figma-snapshot enrichment: 50 nodes enriched
```

### Step 5.4: Spot-check the enriched JSON

- [ ] Pick a known instance node (e.g. the Waiting pill on the agent drawer screen) and inspect:

```bash
jq '.enrichment' .crew/figma-snapshot/screens/<some-id>.json
```

Expected: an object with `componentProperties`, `mainComponent`, and `boundVariables` populated. Verify:

- `componentProperties.intensity` matches the Figma instance's variant (e.g. `"mid"`)
- `componentProperties.color` matches (`"waiting"`)
- `boundVariables` contains paint-level entries with `resolvedAlias` strings + `resolvedHex` values
- `mainComponent.name` reads as `type=pill, color=waiting, intensity=mid` (or similar variant identifier)

### Step 5.5: Fallback verification

- [ ] Temporarily rename `claude` (or run in a shell without it on PATH) and re-run `crew figma-snapshot`:

```bash
PATH=$(echo $PATH | tr ':' '\n' | grep -v claude | paste -sd:) crew figma-snapshot
```

Expected output includes a warning line:

```
figma-snapshot enrichment: claude not on PATH; Plugin-API enrichment skipped
```

And the snapshot succeeds with REST-only data (no `enrichment` field in the JSONs, or `enrichment` field absent).

### Step 5.6: Time the full run

- [ ] Run:

```bash
time crew figma-snapshot
```

Expected: total wall time around 20-60 seconds depending on file size + `claude` cold-start. If it consistently exceeds 90s, the orchestrator's timeout fires — file as a followup to tune.

---

## Final verification

After tasks 1-4 land:

```bash
cd packages/cli
npm run typecheck && npm run lint && npm run test
```

Expected: all clean. Plus Task 5's manual smoke if `FIGMA_API_TOKEN` is available.

---

## Spec coverage check

| Spec section                                                                   | Plan tasks                                                                      |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Architecture (hybrid; enrichment runs after REST emit)                         | Task 3                                                                          |
| Bridge protocol (`claude -p` subprocess)                                       | Task 2 (orchestrator) + Task 1 (prompt builder)                                 |
| Failure modes (skip, timeout, non-zero, malformed, missing fields)             | Task 2 (each tested)                                                            |
| Enriched data shape (`componentProperties`, `mainComponent`, `boundVariables`) | Task 1 (JS payload produces this shape)                                         |
| `componentProperties` shape (INSTANCE_SWAP refs resolved)                      | Task 1 (JS payload)                                                             |
| `boundVariables` shape (flattened, alias chain, resolved hex)                  | Task 1 (JS payload)                                                             |
| Default-on with graceful fallback                                              | Task 2 + Task 3 (enrichment result threads through but doesn't fail the parent) |
| No caching for v1                                                              | Plan does not introduce any cache; runs every dispatch                          |
| Unit tests for skip/success/error paths                                        | Task 2 (7 cases)                                                                |
| Integration test (subprocess writes enriched JSON)                             | Plan deviates — see "Plan deviations"                                           |
| Manual end-to-end smoke                                                        | Task 5                                                                          |
| Skill re-calibration after this lands                                          | Out of scope (follow-up activity, per spec)                                     |

## Plan deviations from spec

- **Integration test deferred.** The spec called for an integration test where a stubbed subprocess writes enriched JSON to disk and the parent reads it back. The plan's Task 2 covers the orchestrator's behavior unit-test-style; the _file mutation_ is performed by Claude inside the subprocess, not by our code. Writing a meaningful integration test would require simulating Claude's filesystem writes — which is the same as just trusting the prompt. Task 5's manual smoke covers the real end-to-end path. If the manual smoke flakes, file an integration test as a followup.
- **Plan-phase decision on `skip_plugin_api_enrichment` config flag:** **deferred to a followup, not included in v1.** Rationale: the existing `skip_snapshot` flag already disables the whole snapshot. CI environments that don't want Plugin-API enrichment can suppress the warn line via stderr filtering. A dedicated flag is YAGNI until someone files an issue.
- **The `which` helper might already exist.** Plan instructs the implementer to inspect the codebase first and reuse if found. If not, a small new file at `packages/cli/src/lib/which.ts`.

## Followups (file at PR-merge time if any new ones surface)

- **Direct MCP client** as a v2 replacement for the subprocess approach if startup latency or LLM cost become a measurable problem.
- **Snapshot caching** keyed on Figma file version, once regeneration time grows.
- **`skip_plugin_api_enrichment` config flag**, if CI noise from the warn-line becomes a real friction.
