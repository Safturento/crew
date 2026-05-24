# CREW-195 — Cost-weighted token display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TokensByTool shows per-row cost (`$0.024`) + panel grand total (`Total: $1.47`), computed from per-category tokens (input / output / cache_read / cache_creation) × per-model Anthropic API pricing.

**Architecture:** New `packages/shared/src/pricing.ts` with hardcoded MODEL_PRICING + `weightedTokenCost` + `formatCost`. Daemon extends `tokens_by_tool` shape from `{tool, tokens: number}` to `{tool, tokens: {input, output, cacheCreation, cacheRead}, totalTokens, count?}` (builds on B's foundation). Daemon also exposes the agent's dominant `model`. TokensByTool consumes the new shape + model prop, renders cost cell per row + grand total in header.

**Tech Stack:** TS/Node + Tailwind v4. No new runtime deps.

**Spec:** [`docs/superpowers/specs/2026-05-23-crew-195-cost-weighted-design.md`](../specs/2026-05-23-crew-195-cost-weighted-design.md)
**Ticket:** [CREW-195](https://safturento.atlassian.net/browse/CREW-195) (Epic [CREW-189](https://safturento.atlassian.net/browse/CREW-189), **blocked by [CREW-191](https://safturento.atlassian.net/browse/CREW-191)**)

---

## Pre-work

Wait for [CREW-191](https://safturento.atlassian.net/browse/CREW-191) (B) to land on main. That PR adds the Assistant row to `tokens_by_tool` and establishes the aggregator pattern this plan extends. Confirm by inspecting the merged code:

```bash
git -C <repo> log --oneline main -- packages/daemon/src/services/AgentsService.ts | head -5
git -C <repo> log --oneline main -- packages/daemon/src/transcripts/ | head -5
```

Locate the aggregator function (B's pre-work step found it). Note its current return shape — this plan changes it.

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Create | `packages/shared/src/pricing.ts` | MODEL_PRICING + weightedTokenCost + formatCost |
| Create | `packages/shared/src/pricing.test.ts` | Cost math + format coverage |
| Modify | `packages/shared/src/types.ts` (or wherever `AgentDetail` lives) | `AgentDetailTokensByTool.tokens` becomes a bucket; add `totalTokens`; add agent-level `model` field |
| Modify | `packages/shared/src/index.ts` | Export new pricing module |
| Modify | `packages/daemon/src/<aggregator>.ts` | Compute per-category bucket per row; compute agent's dominant model |
| Modify | `packages/daemon/src/<aggregator>.test.ts` | Update + new tests for bucket shape |
| Modify | `bruno/<agent-detail>.bru` | Assert new bucket shape + model field |
| Modify | `packages/dashboard/src/components/TokensByTool.tsx` | Consume bucket shape; render cost cell + total; pass model prop |
| Modify | `packages/dashboard/src/components/TokensByTool.test.tsx` | Cost cell + total + tooltip tests |
| Modify | `packages/dashboard/src/components/AgentBody.tsx` (or TokensByTool's parent) | Pass `model` prop from `AgentDetail` |

---

## Task 1: `shared/src/pricing.ts` module

**Files:**
- Create: `packages/shared/src/pricing.ts`
- Create: `packages/shared/src/pricing.test.ts`
- Modify: `packages/shared/src/index.ts`

- [ ] **Step 1: Write failing tests**

`pricing.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';

import {
  MODEL_PRICING,
  ratesForModel,
  weightedTokenCost,
  formatCost,
} from './pricing.js';

describe('MODEL_PRICING', () => {
  it('contains the three current Anthropic models', () => {
    expect(MODEL_PRICING['claude-sonnet-4-6']).toBeDefined();
    expect(MODEL_PRICING['claude-opus-4-7']).toBeDefined();
    expect(MODEL_PRICING['claude-haiku-4-5']).toBeDefined();
  });
});

describe('ratesForModel', () => {
  it('returns exact-match rates', () => {
    expect(ratesForModel('claude-sonnet-4-6').output).toBe(15);
  });
  it('matches dated model IDs via prefix', () => {
    expect(ratesForModel('claude-opus-4-7-20260603').output).toBe(75);
  });
  it('falls back to Sonnet for unknown models with a one-time warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    ratesForModel('claude-unknown-9-0');
    ratesForModel('claude-unknown-9-0');  // second call: no warn (already in set)
    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
  it('returns Sonnet pricing for undefined model', () => {
    expect(ratesForModel(undefined).output).toBe(15);
  });
});

describe('weightedTokenCost', () => {
  it('sums per-category tokens × per-million rate', () => {
    // 1M output tokens on Sonnet = $15
    expect(weightedTokenCost('claude-sonnet-4-6', { output: 1_000_000 })).toBe(15);
    // 100k cache_read tokens on Sonnet = $0.03
    expect(weightedTokenCost('claude-sonnet-4-6', { cacheRead: 100_000 })).toBeCloseTo(0.03);
    // Combined: 1k input + 500 output on Haiku = 0.001 + 0.0025 = 0.0035
    expect(weightedTokenCost('claude-haiku-4-5', { input: 1000, output: 500 })).toBeCloseTo(0.0035);
  });

  it('treats missing fields as 0', () => {
    expect(weightedTokenCost('claude-sonnet-4-6', {})).toBe(0);
  });
});

describe('formatCost', () => {
  it('uses 4 decimals for sub-cent', () => {
    expect(formatCost(0.0024)).toBe('$0.0024');
  });
  it('uses 2 decimals for sub-dollar', () => {
    expect(formatCost(0.12)).toBe('$0.12');
  });
  it('uses 2 decimals for dollar+', () => {
    expect(formatCost(12.34)).toBe('$12.34');
  });
  it('uses integer for hundreds+', () => {
    expect(formatCost(123.45)).toBe('$123');
  });
  it('handles zero', () => {
    expect(formatCost(0)).toBe('$0.0000');
  });
});
```

- [ ] **Step 2: Run to verify fails**

```bash
npm run test:run --workspace=crew-shared -- pricing
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement** (copy from spec § Architecture verbatim)

- [ ] **Step 4: Re-run tests**

```bash
npm run test:run --workspace=crew-shared -- pricing
```

Expected: PASS.

- [ ] **Step 5: Add to `index.ts` exports**

```ts
export * from './pricing.js';
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/pricing.ts packages/shared/src/pricing.test.ts packages/shared/src/index.ts
git commit -m "feat(shared): MODEL_PRICING constants + weightedTokenCost + formatCost (CREW-195)

Sonnet 4.6 / Opus 4.7 / Haiku 4.5 rates from the Anthropic pricing
page (verified 2026-05-23). Dated model IDs resolved via prefix.
Unknown models fall back to Sonnet with a one-time console.warn.

formatCost uses adaptive precision: 4 decimals sub-cent, 2 decimals
sub-dollar, integer hundreds+."
```

---

## Task 2: Daemon — per-category bucket shape + dominant model

**Files:**
- Modify: `packages/shared/src/types.ts` — `AgentDetailTokensByTool` + agent-level `model`
- Modify: `packages/daemon/src/<aggregator>.ts`
- Modify: `packages/daemon/src/<aggregator>.test.ts`

- [ ] **Step 1: Update shared types**

```ts
export interface AgentDetailTokensByTool {
  tool: string;
  tokens: {
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
  };
  /** Sum of all bucket entries — convenience for existing consumers + sort. */
  totalTokens: number;
  count?: number;  // invocation count (existing) — kept where relevant
}

export interface AgentDetail {
  // existing fields
  model: string;        // ← NEW: dominant model in this agent's transcripts
  tokens_by_tool: AgentDetailTokensByTool[];
}
```

- [ ] **Step 2: Write failing daemon tests**

In the aggregator's test:

```ts
it('rows carry per-category token buckets', () => {
  const events = [
    makeAssistantEvent({
      model: 'claude-sonnet-4-6',
      usage: { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 5000 },
      blocks: [{ type: 'tool_use', name: 'Bash', input: {} }],
    }),
  ];
  const result = buildTokensByTool(events);
  const bash = result.find((r) => r.tool === 'Bash')!;
  expect(bash.tokens.input).toBe(1000);
  expect(bash.tokens.output).toBe(100);
  expect(bash.tokens.cacheRead).toBe(5000);
  expect(bash.totalTokens).toBe(6100);
});

it('first-tool-in-turn attribution: multi-tool turn attributes to first', () => {
  const events = [
    makeAssistantEvent({
      usage: { output_tokens: 200 },
      blocks: [
        { type: 'tool_use', name: 'Bash', input: {} },
        { type: 'tool_use', name: 'Edit', input: {} },
      ],
    }),
  ];
  const result = buildTokensByTool(events);
  expect(result.find((r) => r.tool === 'Bash')!.tokens.output).toBe(200);
  expect(result.find((r) => r.tool === 'Edit')!.tokens.output).toBe(0);
});

it('Assistant row gets text-only turns', () => {
  const events = [
    makeAssistantEvent({ usage: { output_tokens: 50 }, blocks: [{ type: 'text', text: 'hi' }] }),
  ];
  const result = buildTokensByTool(events);
  expect(result.find((r) => r.tool === 'Assistant')!.tokens.output).toBe(50);
});

it('treats null/undefined cache fields as 0', () => {
  const events = [
    makeAssistantEvent({
      usage: { input_tokens: 100, output_tokens: 50 },  // no cache fields
      blocks: [{ type: 'tool_use', name: 'Bash', input: {} }],
    }),
  ];
  const result = buildTokensByTool(events);
  const bash = result.find((r) => r.tool === 'Bash')!;
  expect(bash.tokens.cacheRead).toBe(0);
  expect(bash.tokens.cacheCreation).toBe(0);
});

it('agent detail exposes dominant model', () => {
  const events = [
    makeAssistantEvent({ model: 'claude-sonnet-4-6', blocks: [{ type: 'text', text: 'a' }] }),
    makeAssistantEvent({ model: 'claude-sonnet-4-6', blocks: [{ type: 'text', text: 'b' }] }),
    makeAssistantEvent({ model: 'claude-haiku-4-5',  blocks: [{ type: 'text', text: 'c' }] }),
  ];
  const detail = buildAgentDetail(events, /* ... */);
  expect(detail.model).toBe('claude-sonnet-4-6');  // mode-of-models
});
```

- [ ] **Step 3: Run to verify fails**

Expected: FAIL — old shape doesn't carry buckets; no `model` field.

- [ ] **Step 4: Extend the aggregator + agent detail builder**

Refactor the aggregator to:
- Build per-tool buckets from each assistant turn's `usage`.
- Attribute to the first `tool_use` block in the turn (deterministic).
- Empty-tool turns contribute to the Assistant row.
- Sum each row's `totalTokens` for sort + back-compat.

Refactor `buildAgentDetail` (or equivalent) to compute `model` as the most-common model across transcript events.

- [ ] **Step 5: Re-run + commit**

```bash
npm run test:run --workspace=crew-daemon
git add packages/shared/src/types.ts \
        packages/daemon/src/<aggregator location>
git commit -m "feat(daemon): tokens_by_tool per-category buckets + agent-level dominant model (CREW-195)

Rows now carry tokens.{input, output, cacheCreation, cacheRead} +
totalTokens convenience field. First-tool-in-turn attribution for
multi-tool turns. Agent detail exposes the dominant model (mode of
transcript events' model field) so the frontend can pick pricing rates."
```

---

## Task 3: Bruno smoke updates

**Files:**
- Modify: relevant `.bru` files

- [ ] **Step 1: Update assertions**

```javascript
test("tokens_by_tool rows have per-category buckets", () => {
  const rows = res.getBody().tokens_by_tool;
  for (const row of rows) {
    expect(row.tokens).to.have.keys('input', 'output', 'cacheCreation', 'cacheRead');
    expect(row).to.have.property('totalTokens');
  }
});

test("agent detail exposes dominant model", () => {
  const detail = res.getBody();
  expect(detail.model).to.be.a('string');
  expect(detail.model).to.match(/^claude-/);
});
```

- [ ] **Step 2: Run smoke**

```bash
npm run bruno:smoke
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add bruno/
git commit -m "test(bruno): assert per-category tokens_by_tool buckets + agent model (CREW-195)"
```

---

## Task 4: Frontend — TokensByTool cost cell + grand total

**Files:**
- Modify: `packages/dashboard/src/components/TokensByTool.tsx`
- Modify: `packages/dashboard/src/components/TokensByTool.test.tsx`
- Modify: `packages/dashboard/src/components/AgentBody.tsx` (or wherever TokensByTool is mounted, to pass `model`)

- [ ] **Step 1: Write failing tests**

```tsx
import { weightedTokenCost, formatCost } from 'crew-shared';

it('renders a cost cell per row', () => {
  const rows = [
    { tool: 'Bash', tokens: { input: 1000, output: 100, cacheCreation: 0, cacheRead: 0 }, totalTokens: 1100 },
  ];
  render(<TokensByTool rows={rows} model="claude-sonnet-4-6" />);
  // Bash: 1000 input + 100 output on Sonnet = $0.003 + $0.0015 = $0.0045
  expect(screen.getByTestId('tokens-by-tool-row-cost')).toHaveTextContent('$0.0045');
});

it('renders the grand total in the panel header', () => {
  const rows = [
    { tool: 'Bash',      tokens: { input: 0, output: 1_000_000, cacheCreation: 0, cacheRead: 0 }, totalTokens: 1_000_000 },
    { tool: 'Assistant', tokens: { input: 0, output: 500_000,   cacheCreation: 0, cacheRead: 0 }, totalTokens: 500_000 },
  ];
  render(<TokensByTool rows={rows} model="claude-sonnet-4-6" />);
  // 1.5M output on Sonnet = $22.50
  expect(screen.getByText(/Total:/)).toHaveTextContent('$22.50');
});

it('cost cell title exposes per-category breakdown on hover', () => {
  const rows = [
    { tool: 'Bash', tokens: { input: 1000, output: 100, cacheCreation: 0, cacheRead: 5000 }, totalTokens: 6100 },
  ];
  render(<TokensByTool rows={rows} model="claude-sonnet-4-6" />);
  const cost = screen.getByTestId('tokens-by-tool-row-cost');
  expect(cost.getAttribute('title')).toMatch(/input.*1\.0k.*output.*100.*cache-read.*5\.0k/);
});

it('preserves Assistant-first sort from CREW-191', () => {
  const rows = [
    { tool: 'Bash',      tokens: { input: 0, output: 999_000_000, cacheCreation: 0, cacheRead: 0 }, totalTokens: 999_000_000 },
    { tool: 'Assistant', tokens: { input: 0, output: 100,         cacheCreation: 0, cacheRead: 0 }, totalTokens: 100 },
  ];
  render(<TokensByTool rows={rows} model="claude-sonnet-4-6" />);
  const allRows = screen.getAllByTestId('tokens-by-tool-row');
  expect(allRows[0]).toHaveTextContent('Assistant');
});
```

- [ ] **Step 2: Run to verify fails**

Expected: FAIL — no cost cell, no grand total.

- [ ] **Step 3: Implement** (see spec § Architecture)

Key snippets in `TokensByTool.tsx`:

```tsx
const enriched = useMemo(
  () => rows.map((r) => ({ ...r, cost: weightedTokenCost(model, r.tokens) })),
  [rows, model],
);
const grandTotal = useMemo(() => enriched.reduce((s, r) => s + r.cost, 0), [enriched]);
```

Render the cost cell + tooltip per spec.

Update `AgentBody.tsx` (or TokensByTool's caller) to pass `model={detail.model}`.

- [ ] **Step 4: Re-run + commit**

```bash
npm run test:run --workspace=crew-dashboard -- TokensByTool
git add packages/dashboard/src/components/TokensByTool.tsx \
        packages/dashboard/src/components/TokensByTool.test.tsx \
        packages/dashboard/src/components/AgentBody.tsx
git commit -m "feat(dashboard): TokensByTool per-row cost cell + grand total (CREW-195)

Each row shows weighted cost using shared.weightedTokenCost(model, bucket).
Hover title= exposes per-category breakdown so users get the cache vs
output split without dedicated UI. Grand total surfaces in panel header.
AgentBody passes the agent's model from AgentDetail."
```

---

## Task 5: Final verification + docs

- [ ] `npm run lint` — green
- [ ] `npm run typecheck` — green across all workspaces
- [ ] `npm run test:run` — green
- [ ] `npm run bruno:smoke` — green
- [ ] Visual smoke: CREW-102 fixture shows cost cell on each row + grand total at the top of TokensByTool
- [ ] `visual-fidelity-check` against CREW-102 — report at `docs/visual-fidelity-reports/CREW-195.md`
- [ ] Verify MODEL_PRICING constants against the [Anthropic pricing page](https://www.anthropic.com/pricing) at implementation time; update `pricing.ts` header comment with the verification date

PR title: `feat(dashboard+daemon+shared): cost-weighted token display in TokensByTool (CREW-195)`
