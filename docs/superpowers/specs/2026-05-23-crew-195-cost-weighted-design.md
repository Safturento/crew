# CREW-195 — Cost-weighted token display in TokensByTool

**Ticket:** [CREW-195](https://safturento.atlassian.net/browse/CREW-195)
**Epic:** [CREW-189](https://safturento.atlassian.net/browse/CREW-189)
**Blocked by:** [CREW-191](https://safturento.atlassian.net/browse/CREW-191) (B's per-category foundation)
**Date:** 2026-05-23

## Goal

Differentiate token costs by category (input / output / cache_read / cache_creation) and weight them by actual API pricing so TokensByTool reflects what each tool *actually costs* — not just how many tokens it consumed. Today the panel treats 1M cache-read tokens (~$0.30 on Sonnet) the same as 1M output tokens (~$15) — a 50× underreport on cost for cache-heavy tools.

## Non-goals

- **Per-agent / per-project pricing overrides.** Single source: hardcoded constants in `packages/shared/src/pricing.ts`.
- **Historical cost dashboards.** Drawer-scoped only. Cohort cost analysis is a separate concern.
- **Splitting Assistant into "text" vs "thinking" sub-rows.** Single Assistant row continues per B's decision; F adds cost weighting on top.
- **Multi-model attribution.** v1 assumes one model per agent run (the dominant model in transcripts). Multi-model accounting is a follow-up if it matters.
- **Bedrock / Vertex pricing differentials.** Crew uses the Anthropic API; those routes aren't relevant.

## Design decisions (brainstormed 2026-05-23)

| Q | Decision |
|---|---|
| Pricing source | Hardcoded `MODEL_PRICING` map in `packages/shared/src/pricing.ts`. Updated manually when Anthropic changes rates (~yearly). No runtime dependency, no TOML override. |
| Cost UI surface | Per-row cost column + panel grand total. `Bash · 12k tokens · $0.024` on each row; `Total: $1.47` at the top. |
| Format | USD with adaptive precision: `$0.0024` for sub-cent, `$0.12` for sub-dollar, `$1.47` for dollar+. Always with `$` prefix. |
| Sort | Existing tokens-descending sort preserved (cost-descending would be a toggle if useful later; YAGNI). |
| Unknown model fallback | Falls back to Sonnet 4.6 pricing with a `console.warn` once per session per unknown model. |

## Architecture

### `packages/shared/src/pricing.ts` — new module

```ts
export interface ModelRates {
  /** $ per million input tokens */
  input: number;
  /** $ per million output tokens */
  output: number;
  /** $ per million cache-write tokens */
  cacheCreation: number;
  /** $ per million cache-read tokens */
  cacheRead: number;
}

/**
 * Per-model pricing. Verified against the Anthropic pricing page at
 * the time of writing — re-check + update annually.
 */
export const MODEL_PRICING: Record<string, ModelRates> = {
  'claude-sonnet-4-6': { input: 3,  output: 15, cacheCreation: 3.75,  cacheRead: 0.30 },
  'claude-opus-4-7':   { input: 15, output: 75, cacheCreation: 18.75, cacheRead: 1.50 },
  'claude-haiku-4-5':  { input: 1,  output: 5,  cacheCreation: 1.25,  cacheRead: 0.10 },
};

const DEFAULT_FALLBACK_MODEL = 'claude-sonnet-4-6';

const warnedModels = new Set<string>();

export function ratesForModel(model: string | undefined): ModelRates {
  if (!model) return MODEL_PRICING[DEFAULT_FALLBACK_MODEL];
  // Exact match first, then prefix match for dated model IDs
  // (e.g. "claude-opus-4-7-20260603" → "claude-opus-4-7")
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  for (const key of Object.keys(MODEL_PRICING)) {
    if (model.startsWith(key)) return MODEL_PRICING[key];
  }
  if (!warnedModels.has(model)) {
    warnedModels.add(model);
    // eslint-disable-next-line no-console
    console.warn(`[pricing] Unknown model "${model}" — falling back to ${DEFAULT_FALLBACK_MODEL} pricing.`);
  }
  return MODEL_PRICING[DEFAULT_FALLBACK_MODEL];
}

export interface TokenBucket {
  input?: number;
  output?: number;
  cacheCreation?: number;
  cacheRead?: number;
}

/** Returns USD cost for the given bucket against the given model's rates. */
export function weightedTokenCost(model: string | undefined, tokens: TokenBucket): number {
  const rates = ratesForModel(model);
  return (
    ((tokens.input ?? 0) / 1_000_000) * rates.input +
    ((tokens.output ?? 0) / 1_000_000) * rates.output +
    ((tokens.cacheCreation ?? 0) / 1_000_000) * rates.cacheCreation +
    ((tokens.cacheRead ?? 0) / 1_000_000) * rates.cacheRead
  );
}

/**
 * Format a USD cost with adaptive precision.
 *   $0.0024 (sub-cent: 4 decimals)
 *   $0.12   (sub-dollar: 2 decimals)
 *   $12     (dollar+: integer)
 *   $123.45 (large: 2 decimals)
 */
export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 1) return `$${usd.toFixed(2)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd)}`;
}
```

### Daemon — extend `tokens_by_tool` shape (depends on B)

Once B (CREW-191) lands with the Assistant row in `tokens_by_tool`, F extends each row's shape from a single `tokens: number` to a per-category bucket:

```ts
// shared types — packages/shared/src/types.ts
export interface AgentDetailTokensByTool {
  tool: string;
  tokens: {
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
  };
  /** Existing aggregate total — keep for back-compat */
  totalTokens: number;
  /** Invocation count, when relevant. Existing daemon may already track this. */
  count?: number;
}
```

(B may have shipped with `tokens: number`. F changes that field to the bucket — breaking shape change, requires Bruno + frontend sync.)

Each row is computed by walking the agent's transcript events:
- For tool rows: assistant turns that called this tool contribute their `usage` to the bucket. Apportion by tool-call count if multiple tools fired in one turn (or attribute the whole turn to the first/last tool — pick one convention; "first" matches user intuition of "this tool started the turn").
- For the Assistant row: all `usage` from text/thinking-only assistant turns sums into the Assistant bucket.

(Implementation may want to refactor B's aggregator. Pre-work step in the plan calls this out.)

DB schema: no change required (`tokens_by_tool` is computed at query time).

### Frontend — `TokensByTool.tsx`

```tsx
import { weightedTokenCost, formatCost } from 'crew-shared';
// (`crew-shared` is the workspace alias; adjust to actual import path)

interface TokensByToolProps {
  rows: AgentDetailTokensByTool[];
  model: string;  // agent's dominant model — daemon should expose this on agent detail
}

function TokensByTool({ rows, model }: TokensByToolProps) {
  const enriched = useMemo(
    () => rows.map((r) => ({
      ...r,
      cost: weightedTokenCost(model, r.tokens),
    })),
    [rows, model],
  );
  const grandTotal = useMemo(() => enriched.reduce((sum, r) => sum + r.cost, 0), [enriched]);
  const sortedRows = sortAssistantFirstThenByTokens(enriched);

  return (
    <section>
      <header className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium">Tokens by tool</h3>
        <span className="font-mono text-xs text-muted-foreground">
          Total: <span className="text-foreground tabular-nums">{formatCost(grandTotal)}</span>
        </span>
      </header>
      {sortedRows.map((row) => (
        <TokenRow key={row.tool} row={row} maxTokens={maxOf(enriched)} />
      ))}
    </section>
  );
}

function TokenRow({ row, maxTokens }: { row: EnrichedRow; maxTokens: number }) {
  return (
    <div data-testid="tokens-by-tool-row" className="flex items-center gap-3">
      {iconForTool(row.tool)}
      <span className="flex-1 font-mono text-xs">{row.tool}</span>
      <Bar value={row.totalTokens} max={maxTokens} />
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {formatTokens(row.totalTokens)}
      </span>
      <span
        data-testid="tokens-by-tool-row-cost"
        className="font-mono text-xs tabular-nums text-foreground/80"
        title={`input ${formatTokens(row.tokens.input)} · output ${formatTokens(row.tokens.output)} · cache-write ${formatTokens(row.tokens.cacheCreation)} · cache-read ${formatTokens(row.tokens.cacheRead)}`}
      >
        {formatCost(row.cost)}
      </span>
    </div>
  );
}
```

Notes:
- The hover `title=` on the cost cell exposes the per-category breakdown without needing dedicated UI (acknowledges the "category breakdown" alternative from brainstorm without taking on its complexity).
- `formatTokens` is the existing utility (per-tool token formatter `4.2k`).
- `model` is a new prop. Daemon needs to surface the agent's model. Existing telemetry may already carry it (each transcript event has a `model` field — agent-level "dominant model" = mode-of-models across transcripts).

### Daemon — expose `model` on agent detail

If not already present, extend the `AgentDetail` shape to include `model: string`. Computed as the most-common model across the agent's transcript events (or the last one — both produce stable results for single-model agents, which is the common case).

## Testing

### `pricing.test.ts` (shared)

- `weightedTokenCost` against each MODEL_PRICING entry produces correct USD math.
- Unknown model warns once + falls back to Sonnet.
- Dated model IDs match prefix (e.g. `'claude-opus-4-7-20260603'` resolves to opus rates).
- `formatCost` cases: $0.0024 / $0.12 / $12.00 / $123.45 / very small (sub-1¢).

### Daemon

- Aggregator returns rows with the new bucket shape.
- Tool-call apportionment is deterministic (first-tool-in-turn convention or whatever convention is settled).
- Assistant row's bucket sums turns that have no tool_use blocks.
- Agent detail includes `model` field.

### Bruno

- Assert each row in `tokens_by_tool` has `tokens.{input,output,cacheCreation,cacheRead}` numbers.
- Assert agent detail has `model` field.

### Frontend

- TokensByTool renders cost cell per row.
- Cost cell tooltip includes per-category breakdown.
- Panel header shows grand total.
- Cost format matches `formatCost` convention.

### Visual fidelity

- `visual-fidelity-check` against CREW-102 fixture. Expected 0 high / 0-1 medium.

## Out of scope

- Per-event cost on TranscriptRow (timeline rows stay tokens-only; cost lives in the panel).
- "Show cost" toggle (always-on).
- Cost-descending sort (preserve tokens-descending).
- Historical cohort cost dashboards.
- Bedrock / Vertex pricing.
- Per-agent / per-project pricing overrides (TOML config etc.).
- Multi-model attribution within a single agent run.

## Risks

- **Pricing drift.** Anthropic updates pricing periodically. The hardcoded constants will go stale. Mitigation: source-of-truth comment in `pricing.ts` references the Anthropic pricing URL with a "verified YYYY-MM-DD" note. Add a yearly calendar reminder OR a CI check that hits the pricing page (overkill for v1).
- **First-tool-in-turn attribution.** When one assistant turn calls multiple tools, attributing the turn's full token usage to the first tool overcounts that tool. Alternatives: apportion equally across tools in the turn, or attribute to a generic "Mixed" bucket. Pick "first" for v1; flag as a known limitation; revisit if usage shows fatigue.
- **Cache stats availability.** Some older transcripts may have `null` for `cache_read_input_tokens` / `cache_creation_input_tokens` (older API versions). Treat null as 0; document.
- **`model` field availability.** Some transcripts may have `null` model. Fallback to default (Sonnet) per `ratesForModel`'s contract.
- **Cost feels exposing.** A "$47 spent on this agent" badge might prompt user anxiety. Optional mitigation: show cost only on per-row hover instead of always-on. Punt — start with always-on and adjust based on usage feedback.
