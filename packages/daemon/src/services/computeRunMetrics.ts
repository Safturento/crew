import { extractBashCommands } from 'crew-shared';
import type { MetricInputs } from './MetricsService.js';

/**
 * Loose transcript-event shape `computeRunMetrics` reads. It is a structural
 * subset of `crew-shared`'s `TranscriptEvent` union — the function only ever
 * touches `message.content` tool_use items and the assistant `message.usage`
 * block, so a narrower interface keeps it independent of the full union and
 * trivial to fixture in tests.
 */
export interface MetricEvent {
  type?: string;
  message?: {
    content?:
      | Array<{
          type: string;
          name?: string;
          input?: { command?: string; file_path?: string };
        }>
      | string;
    usage?: {
      input_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
    };
  };
}

export interface ComputeRunMetricsOptions {
  /**
   * Worktree-relative paths of the repo's agent-context docs (the root
   * AGENTS.md, per-package AGENTS.md files, and the .agents topic docs).
   * Empty when the worktree has no such docs — `docLoadCoveragePct` is then
   * `null` rather than a misleading 0 or 100.
   */
  agentDocRelPaths: readonly string[];
}

// A run "passed cleanliness" when it ran at least one verification command —
// the lint/typecheck/test/format sweep crew agents run before a PR. Matched
// either as a package-manager script (`npm run lint`, `pnpm test:run`) or a
// direct tool invocation (`npx tsc`, `vitest run`). Deliberately narrow so an
// incidental "test" substring (e.g. `cat test.txt`) is not mistaken for one.
const VERIFICATION_COMMAND =
  /\b(?:(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?[\w:-]*(?:lint|typecheck|type-check|test|format)|tsc|eslint|prettier|vitest|jest|playwright)\b/;

/**
 * Derives the four Layer-1 metrics for a completed run from its transcript.
 *
 * - `cleanlinessPass`     — 1 when a verification command (lint/typecheck/
 *                           test/format) appears in the transcript.
 * - `prClaimInputTokens`  — context size (input + both cache token classes)
 *                           of the turn that issued `gh pr create`; `null`
 *                           when the run never opened a PR.
 * - `docLoadCoveragePct`  — percentage of the worktree's agent-context docs
 *                           the run actually `Read`; `null` when the worktree
 *                           has no agent docs to cover.
 * - `parityViolations`    — always `null` here. No transcript-only signal for
 *                           `.agents/` parity exists until the Phase 3 commit
 *                           hook (CREW-160) lands — see docs/followups.md.
 */
export function computeRunMetrics(
  events: readonly MetricEvent[],
  opts: ComputeRunMetricsOptions,
): MetricInputs {
  const commands = extractBashCommands(events);
  const cleanlinessPass = commands.some((c) => VERIFICATION_COMMAND.test(c)) ? 1 : 0;

  return {
    cleanlinessPass,
    prClaimInputTokens: findPrClaimInputTokens(events),
    docLoadCoveragePct: computeDocLoadCoverage(events, opts.agentDocRelPaths),
    parityViolations: null,
  };
}

/** Context size of the assistant turn that ran `gh pr create`, or null. */
function findPrClaimInputTokens(events: readonly MetricEvent[]): number | null {
  for (const ev of events) {
    const content = ev.message?.content;
    if (!Array.isArray(content)) continue;
    const prClaim = content.some(
      (item) =>
        item.type === 'tool_use' &&
        item.name === 'Bash' &&
        (item.input?.command ?? '').trimStart().startsWith('gh pr create'),
    );
    if (!prClaim) continue;
    const usage = ev.message?.usage;
    if (!usage) return null;
    return (
      (usage.input_tokens ?? 0) +
      (usage.cache_read_input_tokens ?? 0) +
      (usage.cache_creation_input_tokens ?? 0)
    );
  }
  return null;
}

/** Percentage of the worktree's agent docs the run opened, or null. */
function computeDocLoadCoverage(
  events: readonly MetricEvent[],
  agentDocRelPaths: readonly string[],
): number | null {
  if (agentDocRelPaths.length === 0) return null;

  const readPaths = new Set<string>();
  for (const ev of events) {
    const content = ev.message?.content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (item.type === 'tool_use' && item.name === 'Read' && item.input?.file_path) {
        readPaths.add(item.input.file_path);
      }
    }
  }

  const loaded = agentDocRelPaths.filter((doc) =>
    [...readPaths].some((p) => p === doc || p.endsWith(`/${doc}`)),
  );
  return Math.round((loaded.length / agentDocRelPaths.length) * 100);
}
