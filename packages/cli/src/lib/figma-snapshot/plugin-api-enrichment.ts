import { execa } from 'execa';
import { which } from '../which.js';
// Cross-imports the sibling `claude/` lib subdir on purpose: the
// `--dangerously-skip-permissions` flag + PATH augmentation must stay
// single-sourced with `lib/claude/spawn.ts`. A divergent spawn here that
// omitted the flag is the bug CREW-172 fixes — see that ticket.
import { CLAUDE_PERMISSION_FLAG, claudeSpawnEnv } from '../claude/spawn.js';
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

/**
 * Spawn the enrichment `claude` subprocess. Exported so a test can exercise
 * the real argv (the injected `runClaude` seam never reaches it).
 *
 * Unlike `spawnClaude{Fresh,Resume}` this captures `stdout` as a string (the
 * caller parses the JSON summary line) and enforces a timeout — but it shares
 * the spawn contract via `CLAUDE_PERMISSION_FLAG` + `claudeSpawnEnv()`.
 */
export const defaultRunner: ClaudeRunner = async ({ claudePath, prompt, cwd, timeoutMs }) => {
  const result = await execa(claudePath, [CLAUDE_PERMISSION_FLAG, '-p', prompt], {
    cwd,
    env: claudeSpawnEnv(),
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
