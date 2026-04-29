import { readFileSync } from 'node:fs';
import { listSessionsForRepo, type SessionSummary } from './discovery.js';
import { parseTranscript, parseToolCall, type ToolCall } from 'crew-shared';

export interface FindLatestSessionForBranchOptions {
  repoPath: string;
  branch: string;
  projectsRoot?: string;
}

/**
 * Among the sessions for a repo, return the one whose recorded `gitBranch`
 * matches `branch` and was modified most recently. Returns null if no
 * matching session exists.
 */
export function findLatestSessionForBranch(
  opts: FindLatestSessionForBranchOptions,
): SessionSummary | null {
  const candidates = listSessionsForRepo({
    repoPath: opts.repoPath,
    projectsRoot: opts.projectsRoot,
  });
  for (const session of candidates) {
    if (session.branch === opts.branch) return session;
  }
  return null;
}

export interface SessionStatus {
  timeline: ToolCall[];
  tokensByTool: Record<string, number>;
  totalOutputTokens: number;
  /** Wall-clock gap between first and last tool call. Null if <2 calls. */
  runtimeMs: number | null;
  /** Last tool call observed, the agent's "current step". */
  currentStep: ToolCall | null;
}

/**
 * Compute the detailed status of a single session from its transcript file.
 */
export function summarizeSessionStatus(transcriptPath: string): SessionStatus {
  const events = parseTranscript(readFileSync(transcriptPath, 'utf8'));
  const timeline: ToolCall[] = [];
  const tokensByTool: Record<string, number> = {};
  let totalOutputTokens = 0;

  for (const event of events) {
    const call = parseToolCall(event);
    if (!call) continue;
    timeline.push(call);
    tokensByTool[call.name] = (tokensByTool[call.name] ?? 0) + call.outputTokens;
    totalOutputTokens += call.outputTokens;
  }

  const first = timeline[0];
  const last = timeline[timeline.length - 1];
  const runtimeMs =
    first && last && first !== last
      ? new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()
      : null;

  return {
    timeline,
    tokensByTool,
    totalOutputTokens,
    runtimeMs,
    currentStep: last ?? null,
  };
}
