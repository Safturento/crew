import type { ReactNode } from 'react';

import { formatTokens } from '../format/tokens.js';

interface TokenBarRowProps {
  tool: string;
  tokens: number;
  /** Share of the agent's total tool-call tokens, 0–100. */
  percent: number;
  /**
   * Optional hover/title text. Used by TokensByTool to list the raw
   * `tool_name` values that contribute to an aliased row (e.g.
   * "MCP:Jira (jira_get_issue, jira_transition_issue)").
   */
  title?: string;
  /**
   * Optional leading icon, rendered before the tool label. Used by
   * TokensByTool to mark the synthetic "Assistant" row with a sparkles
   * glyph (CREW-191) — tool rows pass nothing.
   */
  icon?: ReactNode;
  /**
   * Pre-formatted USD cost for the row (CREW-195). Rendered in a dedicated
   * cell when provided; omitted entirely otherwise so callers that don't
   * weight by cost are unaffected.
   */
  cost?: string;
  /** Hover/title for the cost cell — per-category bucket breakdown. */
  costTitle?: string;
}

const TOKEN_BAR_ROW_GRID =
  'grid grid-cols-[1fr_auto_3fr_auto_auto] items-center gap-4 px-3.5 py-2';

export function TokenBarRow({
  tool,
  tokens,
  percent,
  title,
  icon,
  cost,
  costTitle,
}: TokenBarRowProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className={`${TOKEN_BAR_ROW_GRID} border-t border-border text-sm`} title={title}>
      <span className="flex items-center gap-1.5 font-mono text-foreground">
        {icon ? <span aria-hidden>{icon}</span> : null}
        <span>{tool}</span>
      </span>
      <span className="text-right font-mono tabular-nums text-foreground">
        {formatTokens(tokens)}
      </span>
      <div
        className="relative h-1.5 overflow-hidden rounded-full bg-muted"
        role="presentation"
        aria-hidden
      >
        <div
          data-testid="token-bar-fill"
          className="h-full rounded-full bg-foreground/40"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-right font-mono tabular-nums text-muted-foreground">
        {percent.toFixed(1)}%
      </span>
      {cost !== undefined ? (
        <span
          data-testid="tokens-by-tool-row-cost"
          className="text-right font-mono tabular-nums text-foreground/80"
          title={costTitle}
        >
          {cost}
        </span>
      ) : (
        <span aria-hidden />
      )}
    </div>
  );
}

/** Grid template that `TokensByTool` reuses so the header labels align with row cells. */
export const TOKEN_BAR_ROW_GRID_CLASSES = TOKEN_BAR_ROW_GRID;
