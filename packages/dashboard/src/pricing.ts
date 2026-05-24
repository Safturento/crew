/**
 * Anthropic API pricing for cost-weighted token display (CREW-195).
 *
 * Rates verified against https://www.anthropic.com/pricing on 2026-05-23.
 * Re-check + update annually (or when Anthropic announces price changes).
 */

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

export const MODEL_PRICING: Record<string, ModelRates> = {
  'claude-sonnet-4-6': { input: 3, output: 15, cacheCreation: 3.75, cacheRead: 0.3 },
  'claude-opus-4-7': { input: 15, output: 75, cacheCreation: 18.75, cacheRead: 1.5 },
  'claude-haiku-4-5': { input: 1, output: 5, cacheCreation: 1.25, cacheRead: 0.1 },
};

const DEFAULT_FALLBACK_MODEL = 'claude-sonnet-4-6';

const warnedModels = new Set<string>();

export function ratesForModel(model: string | undefined): ModelRates {
  if (!model) return MODEL_PRICING[DEFAULT_FALLBACK_MODEL];
  // Exact match wins, then prefix match for dated model IDs
  // (e.g. "claude-opus-4-7-20260603" → "claude-opus-4-7").
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];
  for (const key of Object.keys(MODEL_PRICING)) {
    if (model.startsWith(key)) return MODEL_PRICING[key];
  }
  if (!warnedModels.has(model)) {
    warnedModels.add(model);
    console.warn(
      `[pricing] Unknown model "${model}" — falling back to ${DEFAULT_FALLBACK_MODEL} pricing.`,
    );
  }
  return MODEL_PRICING[DEFAULT_FALLBACK_MODEL];
}

export interface TokenBucket {
  input?: number;
  output?: number;
  cacheCreation?: number;
  cacheRead?: number;
}

/** USD cost for the given bucket against the given model's rates. */
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
 *   $12.34  (dollar+: 2 decimals)
 *   $123    (hundreds+: integer)
 */
export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  if (usd < 100) return `$${usd.toFixed(2)}`;
  return `$${Math.round(usd)}`;
}
