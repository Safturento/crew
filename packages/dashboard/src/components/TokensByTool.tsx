import { useMemo } from 'react';

import type { AgentDetailTokensByTool } from '../data/types.js';
import { formatTokens } from '../format/tokens.js';
import { aggregateByAlias } from '../format/tool-alias.js';
import { TokenBarRow, TOKEN_BAR_ROW_GRID_CLASSES } from './TokenBarRow.js';

interface TokensByToolProps {
  tokensByTool: AgentDetailTokensByTool[];
  /** Agent-level total token count, rendered in the footer. */
  total: number;
}

export function TokensByTool({ tokensByTool, total }: TokensByToolProps) {
  const aliasRows = useMemo(() => {
    const aggregated = aggregateByAlias(tokensByTool.map(({ tool, tokens }) => ({ tool, tokens })));
    const sum = aggregated.reduce((acc, row) => acc + row.tokens, 0);
    return aggregated.map((row) => ({
      alias: row.alias,
      tokens: row.tokens,
      percent: sum > 0 ? (row.tokens / sum) * 100 : 0,
      title: `${row.alias} (${row.raw.join(', ')})`,
    }));
  }, [tokensByTool]);

  return (
    <section
      role="region"
      aria-label="Tokens by tool"
      className="overflow-hidden rounded-[10px] border border-border bg-card"
    >
      <div
        className={`${TOKEN_BAR_ROW_GRID_CLASSES} font-mono text-xs uppercase tracking-wide text-muted-foreground`}
      >
        <span>Tool</span>
        <span className="text-right">Tokens</span>
        <span aria-hidden />
        <span className="text-right">Share</span>
      </div>
      <div data-testid="tokens-by-tool-body">
        {aliasRows.length === 0 ? (
          <div className="border-t border-border px-3.5 py-6 text-center text-sm italic text-muted-foreground">
            No tool usage yet
          </div>
        ) : (
          aliasRows.map((row) => (
            <TokenBarRow
              key={row.alias}
              tool={row.alias}
              tokens={row.tokens}
              percent={row.percent}
              title={row.title}
            />
          ))
        )}
      </div>
      <div
        data-testid="tokens-by-tool-footer"
        className={`${TOKEN_BAR_ROW_GRID_CLASSES} border-t border-border font-mono text-sm text-foreground`}
      >
        <span>Total</span>
        <span className="text-right tabular-nums">{formatTokens(total)}</span>
        <span aria-hidden />
        <span aria-hidden />
      </div>
    </section>
  );
}
