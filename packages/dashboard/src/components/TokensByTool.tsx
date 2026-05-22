import type { AgentDetailTokensByTool } from '../data/types.js';
import { formatTokens } from '../format/tokens.js';
import { TokenBarRow, TOKEN_BAR_ROW_GRID_CLASSES } from './TokenBarRow.js';

interface TokensByToolProps {
  tokensByTool: AgentDetailTokensByTool[];
  /** Agent-level total token count, rendered in the footer. */
  total: number;
}

const HEADER_FOOTER_TEXT = 'text-xs uppercase tracking-wide';

export function TokensByTool({ tokensByTool, total }: TokensByToolProps) {
  return (
    <section
      role="region"
      aria-label="Tokens by tool"
      className="overflow-hidden rounded-[10px] border border-border bg-card"
    >
      <div className={`${TOKEN_BAR_ROW_GRID_CLASSES} ${HEADER_FOOTER_TEXT} text-muted-foreground`}>
        <span className="font-mono">Tool</span>
        <span className="text-right font-mono">Tokens</span>
        <span aria-hidden />
        <span className="text-right font-mono">Share</span>
      </div>
      <div data-testid="tokens-by-tool-body">
        {tokensByTool.length === 0 ? (
          <div className="border-t border-border px-3.5 py-6 text-center text-sm italic text-muted-foreground">
            No tool usage yet
          </div>
        ) : (
          tokensByTool.map((row) => (
            <TokenBarRow key={row.tool} tool={row.tool} tokens={row.tokens} percent={row.percent} />
          ))
        )}
      </div>
      <div
        data-testid="tokens-by-tool-footer"
        className={`${TOKEN_BAR_ROW_GRID_CLASSES} border-t border-border ${HEADER_FOOTER_TEXT}`}
      >
        <span className="font-mono text-foreground">Total</span>
        <span className="text-right font-mono tabular-nums text-foreground">
          {formatTokens(total)}
        </span>
        <span aria-hidden />
        <span aria-hidden />
      </div>
    </section>
  );
}
