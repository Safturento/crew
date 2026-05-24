import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import type { AgentDetailTokensByTool, TokenCategoryBucket } from '../data/types.js';
import { formatCost, weightedTokenCost, type TokenBucket } from '../pricing.js';
import { formatTokens } from '../format/tokens.js';
import { aggregateByAlias } from '../format/tool-alias.js';
import { TokenBarRow, TOKEN_BAR_ROW_GRID_CLASSES } from './TokenBarRow.js';

interface TokensByToolProps {
  tokensByTool: AgentDetailTokensByTool[];
  /** Agent-level total token count, rendered in the footer. */
  total: number;
  /**
   * Dominant model on the agent, used to weight each row's per-category
   * bucket by Anthropic API pricing (CREW-195). Empty string / undefined
   * falls back to Sonnet rates via the pricing helper.
   */
  model?: string;
}

/** Synthetic row label the daemon prepends for model output tokens (CREW-191). */
const ASSISTANT_ROW = 'Assistant';

interface AliasRow {
  alias: string;
  tokens: number;
  cost: number;
  bucket: TokenCategoryBucket;
  percent: number;
  title: string;
}

function emptyBucket(): TokenCategoryBucket {
  return { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 };
}

function sumBuckets(a: TokenCategoryBucket, b: TokenCategoryBucket): TokenCategoryBucket {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheCreation: a.cacheCreation + b.cacheCreation,
    cacheRead: a.cacheRead + b.cacheRead,
  };
}

function aggregateRows(
  tokensByTool: AgentDetailTokensByTool[],
  model: string | undefined,
): AliasRow[] {
  const aggregated = aggregateByAlias(
    tokensByTool.map(({ tool, totalTokens }) => ({ tool, tokens: totalTokens })),
  );
  // Re-walk the source rows to attach per-category buckets per alias — the
  // alias helper only sums totals, so the bucket merge happens here.
  const bucketsByAlias = new Map<string, TokenCategoryBucket>();
  for (const row of tokensByTool) {
    const alias = aggregated.find((a) => a.raw.includes(row.tool))?.alias ?? row.tool;
    const existing = bucketsByAlias.get(alias) ?? emptyBucket();
    bucketsByAlias.set(alias, sumBuckets(existing, row.tokens));
  }
  const sumTokens = aggregated.reduce((acc, r) => acc + r.tokens, 0);
  return aggregated.map((row) => {
    const bucket = bucketsByAlias.get(row.alias) ?? emptyBucket();
    return {
      alias: row.alias,
      tokens: row.tokens,
      cost: weightedTokenCost(model, bucket as TokenBucket),
      bucket,
      percent: sumTokens > 0 ? (row.tokens / sumTokens) * 100 : 0,
      title: `${row.alias} (${row.raw.join(', ')})`,
    };
  });
}

function pinAssistantFirst(rows: AliasRow[]): AliasRow[] {
  const idx = rows.findIndex((r) => r.alias === ASSISTANT_ROW);
  if (idx <= 0) return rows;
  const copy = rows.slice();
  const [assistant] = copy.splice(idx, 1);
  return [assistant, ...copy];
}

function breakdownTitle(bucket: TokenCategoryBucket): string {
  return [
    `input ${formatTokens(bucket.input)}`,
    `output ${formatTokens(bucket.output)}`,
    `cache-write ${formatTokens(bucket.cacheCreation)}`,
    `cache-read ${formatTokens(bucket.cacheRead)}`,
  ].join(' · ');
}

export function TokensByTool({ tokensByTool, total, model }: TokensByToolProps) {
  const aliasRows = useMemo(
    () => pinAssistantFirst(aggregateRows(tokensByTool, model)),
    [tokensByTool, model],
  );

  const grandCost = useMemo(
    () => aliasRows.reduce((acc, row) => acc + row.cost, 0),
    [aliasRows],
  );

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
        <span className="text-right">Cost</span>
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
              icon={
                row.alias === ASSISTANT_ROW ? (
                  <Sparkles aria-hidden className="size-3.5 text-foreground/70" />
                ) : null
              }
              cost={formatCost(row.cost)}
              costTitle={breakdownTitle(row.bucket)}
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
        <span
          data-testid="tokens-by-tool-grand-cost"
          className="text-right tabular-nums text-foreground"
        >
          {formatCost(grandCost)}
        </span>
      </div>
    </section>
  );
}
