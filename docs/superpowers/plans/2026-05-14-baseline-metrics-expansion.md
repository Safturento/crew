# Baseline-Metrics Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand `baseline_metrics` instrumentation with output-token volume, per-turn token decomposition, and per-tool attribution — landed before any Phase 2 (per-package AGENTS.md) PR merges so post-Phase-2 deltas are measurable against a richer baseline.

**Architecture:** Single-file change to `scripts/baseline-metrics-capture.ts`. Extract a pure `aggregateTokenStats(events)` function that walks the event list once and returns both the per-run aggregate and the per-turn rows. Build TDD coverage around the pure function in a sibling `*.test.ts` file. Schema changes are two new CREATE TABLE statements in the same script (matches existing DROP+CREATE pattern; the script *is* the migration mechanism).

**Tech Stack:** TypeScript, `better-sqlite3`, `vitest`, Node `--experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-05-14-baseline-metrics-expansion-design.md`

---

## Prerequisites

Before starting Task 1, create the implementation branch from `main`. The spec + this plan already live on `spec/baseline-metrics-expansion`; the implementation lands on its own ticket branch.

```bash
git checkout main
git pull
git checkout -b CREW-165   # or whatever ticket key is assigned
```

All task commits land on this branch. Task 8 pushes it and opens the PR.

---

## File Structure

- **Modify:** `scripts/baseline-metrics-capture.ts` — extend types, add `aggregateTokenStats` (exported), update `main()` CREATE TABLE + INSERTs, add per-turn table writes
- **Create:** `scripts/baseline-metrics-capture.test.ts` — vitest unit tests against an inline fixture
- **No other files touched.** The existing test runner picks up `scripts/*.test.ts` via the existing `npm run test:scripts` script (`vitest run --dir scripts`).

---

## Task 1: Test scaffold + fixture + first failing assertion (output_tokens_total)

**Files:**
- Create: `scripts/baseline-metrics-capture.test.ts`

- [ ] **Step 1: Write the failing test file**

Create `scripts/baseline-metrics-capture.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { aggregateTokenStats, type TranscriptEvent } from './baseline-metrics-capture.js';

const FIXTURE_EVENTS: TranscriptEvent[] = [
  // Turn 1: assistant calls one Bash
  {
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', id: 'tu_001', name: 'Bash', input: { command: 'echo hi' } },
      ],
      usage: {
        input_tokens: 0,
        cache_read_input_tokens: 100,
        cache_creation_input_tokens: 50,
        output_tokens: 200,
      },
    },
  },
  // tool_result for tu_001 — 6 chars → 1 token under chars/4
  {
    type: 'user',
    message: {
      content: [{ type: 'tool_result', tool_use_id: 'tu_001', content: 'hello\n' }],
    },
  },
  // Turn 2: assistant calls Read AND Bash
  {
    type: 'assistant',
    message: {
      content: [
        { type: 'tool_use', id: 'tu_002', name: 'Read', input: { file_path: '/foo' } },
        { type: 'tool_use', id: 'tu_003', name: 'Bash', input: { command: 'ls' } },
      ],
      usage: {
        input_tokens: 10,
        cache_read_input_tokens: 150,
        cache_creation_input_tokens: 0,
        output_tokens: 300,
      },
    },
  },
  // tool_results for tu_002 (900 chars → 225 tokens) and tu_003 (8 chars → 2 tokens)
  {
    type: 'user',
    message: {
      content: [
        { type: 'tool_result', tool_use_id: 'tu_002', content: 'long file content '.repeat(50) },
        { type: 'tool_result', tool_use_id: 'tu_003', content: 'foo\nbar\n' },
      ],
    },
  },
  // Turn 3: assistant text only, no tool_use
  {
    type: 'assistant',
    message: {
      content: [],
      usage: {
        input_tokens: 5,
        cache_read_input_tokens: 200,
        cache_creation_input_tokens: 0,
        output_tokens: 400,
      },
    },
  },
];

describe('aggregateTokenStats', () => {
  it('sums output_tokens across all turns', () => {
    const stats = aggregateTokenStats(FIXTURE_EVENTS);
    expect(stats.output.total).toBe(900); // 200 + 300 + 400
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:scripts -- baseline-metrics-capture`
Expected: FAIL with `SyntaxError`, `Module not found`, or "aggregateTokenStats is not exported" (the function doesn't exist yet).

- [ ] **Step 3: Implement minimal exports to satisfy the test**

Edit `scripts/baseline-metrics-capture.ts`. Add `output_tokens` to the usage type, export `TranscriptEvent`, and add a minimal `aggregateTokenStats` that returns only what this test asserts.

Change the `TranscriptEvent` interface (existing) — add `output_tokens` to `usage`, and `export` the interface:

```typescript
export interface TranscriptEvent {
  type?: string;
  subtype?: string;
  compactMetadata?: {
    trigger?: 'manual' | 'auto';
    preTokens?: number;
    durationMs?: number;
  };
  message?: {
    content?: ToolUseItem[];
    usage?: {
      input_tokens?: number;
      cache_read_input_tokens?: number;
      cache_creation_input_tokens?: number;
      output_tokens?: number;
    };
  };
}
```

Add new types and the minimal aggregator near the top of the file (after the `TranscriptEvent` interface, before `readTranscript`):

```typescript
export interface AggregatedStats {
  output: { total: number; meanPerTurn: number; maxPerTurn: number };
}

export function aggregateTokenStats(events: TranscriptEvent[]): AggregatedStats {
  let outputTotal = 0;
  for (const ev of events) {
    outputTotal += ev.message?.usage?.output_tokens ?? 0;
  }
  return {
    output: { total: outputTotal, meanPerTurn: 0, maxPerTurn: 0 },
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:scripts -- baseline-metrics-capture`
Expected: PASS — 1 test, 1 assertion.

- [ ] **Step 5: Commit**

```bash
git add scripts/baseline-metrics-capture.ts scripts/baseline-metrics-capture.test.ts
git commit -m "test(baseline): scaffold aggregateTokenStats + output_tokens total"
```

---

## Task 2: Output mean + max per turn, turnCount, toolCallCount, prClaim

**Files:**
- Modify: `scripts/baseline-metrics-capture.test.ts`
- Modify: `scripts/baseline-metrics-capture.ts`

- [ ] **Step 1: Extend the test with new assertions**

Append to the `describe('aggregateTokenStats', ...)` block in the test file:

```typescript
  it('computes output mean and max per turn', () => {
    const stats = aggregateTokenStats(FIXTURE_EVENTS);
    expect(stats.output.maxPerTurn).toBe(400);
    expect(stats.output.meanPerTurn).toBe(300); // floor(900 / 3)
  });

  it('counts turns (usage events) and tool_use calls', () => {
    const stats = aggregateTokenStats(FIXTURE_EVENTS);
    expect(stats.turnCount).toBe(3);
    expect(stats.toolCallCount).toBe(3); // 1 + 2 + 0
  });

  it('captures the last turn snapshot as prClaim (backward-compat with lastPrClaimTokens)', () => {
    const stats = aggregateTokenStats(FIXTURE_EVENTS);
    expect(stats.prClaim).toEqual({
      total: 205,         // 5 + 200 + 0
      uncached: 5,
      cacheRead: 200,
      cacheCreate: 0,
    });
  });
```

- [ ] **Step 2: Run the tests to verify failure**

Run: `npm run test:scripts -- baseline-metrics-capture`
Expected: 3 new FAILs (`maxPerTurn` is 0, `turnCount` undefined, `prClaim` undefined).

- [ ] **Step 3: Extend `AggregatedStats` and `aggregateTokenStats`**

Replace the `AggregatedStats` interface and `aggregateTokenStats` body in `scripts/baseline-metrics-capture.ts`:

```typescript
export interface AggregatedStats {
  prClaim: { total: number; uncached: number; cacheRead: number; cacheCreate: number };
  output: { total: number; meanPerTurn: number; maxPerTurn: number };
  turnCount: number;
  toolCallCount: number;
}

export function aggregateTokenStats(events: TranscriptEvent[]): AggregatedStats {
  let outputTotal = 0;
  let outputMax = 0;
  let turnCount = 0;
  let toolCallCount = 0;
  let prClaim = { total: 0, uncached: 0, cacheRead: 0, cacheCreate: 0 };

  for (const ev of events) {
    for (const item of ev.message?.content ?? []) {
      if (item.type === 'tool_use') toolCallCount++;
    }
    const u = ev.message?.usage;
    if (!u) continue;
    turnCount++;
    const output = u.output_tokens ?? 0;
    outputTotal += output;
    if (output > outputMax) outputMax = output;
    const uncached = u.input_tokens ?? 0;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    const cacheCreate = u.cache_creation_input_tokens ?? 0;
    const total = uncached + cacheRead + cacheCreate;
    if (total > 0) {
      prClaim = { total, uncached, cacheRead, cacheCreate };
    }
  }

  return {
    prClaim,
    output: {
      total: outputTotal,
      meanPerTurn: turnCount > 0 ? Math.floor(outputTotal / turnCount) : 0,
      maxPerTurn: outputMax,
    },
    turnCount,
    toolCallCount,
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test:scripts -- baseline-metrics-capture`
Expected: 4 PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/baseline-metrics-capture.ts scripts/baseline-metrics-capture.test.ts
git commit -m "feat(baseline): aggregate output mean/max, turns, tool calls, prClaim snapshot"
```

---

## Task 3: Per-turn rows (`perTurnRows`)

**Files:**
- Modify: `scripts/baseline-metrics-capture.test.ts`
- Modify: `scripts/baseline-metrics-capture.ts`

- [ ] **Step 1: Add a test asserting the per-turn shape**

Append to the test file's describe block:

```typescript
  it('emits one perTurnRow per usage event with full decomposition', () => {
    const stats = aggregateTokenStats(FIXTURE_EVENTS);
    expect(stats.perTurnRows).toHaveLength(3);

    expect(stats.perTurnRows[0]).toMatchObject({
      turn_index: 0,
      uncached_tokens: 0,
      cache_read_tokens: 100,
      cache_creation_tokens: 50,
      total_tokens: 150,
      output_tokens: 200,
      tool_calls_this_turn: 1,
      tool_calls_breakdown: { Bash: 1 },
    });

    expect(stats.perTurnRows[1]).toMatchObject({
      turn_index: 1,
      uncached_tokens: 10,
      cache_read_tokens: 150,
      cache_creation_tokens: 0,
      total_tokens: 160,
      output_tokens: 300,
      tool_calls_this_turn: 2,
      tool_calls_breakdown: { Read: 1, Bash: 1 },
    });

    expect(stats.perTurnRows[2]).toMatchObject({
      turn_index: 2,
      uncached_tokens: 5,
      cache_read_tokens: 200,
      cache_creation_tokens: 0,
      total_tokens: 205,
      output_tokens: 400,
      tool_calls_this_turn: 0,
      tool_calls_breakdown: {},
    });
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test:scripts -- baseline-metrics-capture`
Expected: FAIL (`stats.perTurnRows` is undefined).

- [ ] **Step 3: Extend types + aggregator with per-turn rows**

In `scripts/baseline-metrics-capture.ts`, add `PerTurnRow` interface (above `AggregatedStats`):

```typescript
export interface PerTurnRow {
  turn_index: number;
  uncached_tokens: number;
  cache_read_tokens: number;
  cache_creation_tokens: number;
  total_tokens: number;
  output_tokens: number;
  tool_calls_this_turn: number;
  tool_calls_breakdown: Record<string, number>;
}
```

Add `perTurnRows: PerTurnRow[]` to `AggregatedStats`:

```typescript
export interface AggregatedStats {
  prClaim: { total: number; uncached: number; cacheRead: number; cacheCreate: number };
  output: { total: number; meanPerTurn: number; maxPerTurn: number };
  perTurnRows: PerTurnRow[];
  turnCount: number;
  toolCallCount: number;
}
```

Update `aggregateTokenStats` body to build per-turn rows. Replace the inner per-event loop with this (still inside the function):

```typescript
  const perTurnRows: PerTurnRow[] = [];
  let outputTotal = 0;
  let outputMax = 0;
  let toolCallCount = 0;
  let prClaim = { total: 0, uncached: 0, cacheRead: 0, cacheCreate: 0 };

  for (const ev of events) {
    const items = ev.message?.content ?? [];
    const thisTurnBreakdown: Record<string, number> = {};
    let thisTurnToolUses = 0;
    for (const item of items) {
      if (item.type === 'tool_use') {
        thisTurnToolUses++;
        toolCallCount++;
        const name = item.name ?? 'unknown';
        thisTurnBreakdown[name] = (thisTurnBreakdown[name] ?? 0) + 1;
      }
    }
    const u = ev.message?.usage;
    if (!u) continue;
    const output = u.output_tokens ?? 0;
    outputTotal += output;
    if (output > outputMax) outputMax = output;
    const uncached = u.input_tokens ?? 0;
    const cacheRead = u.cache_read_input_tokens ?? 0;
    const cacheCreate = u.cache_creation_input_tokens ?? 0;
    const total = uncached + cacheRead + cacheCreate;
    if (total > 0) {
      prClaim = { total, uncached, cacheRead, cacheCreate };
    }
    perTurnRows.push({
      turn_index: perTurnRows.length,
      uncached_tokens: uncached,
      cache_read_tokens: cacheRead,
      cache_creation_tokens: cacheCreate,
      total_tokens: total,
      output_tokens: output,
      tool_calls_this_turn: thisTurnToolUses,
      tool_calls_breakdown: thisTurnBreakdown,
    });
  }

  return {
    prClaim,
    output: {
      total: outputTotal,
      meanPerTurn: perTurnRows.length > 0 ? Math.floor(outputTotal / perTurnRows.length) : 0,
      maxPerTurn: outputMax,
    },
    perTurnRows,
    turnCount: perTurnRows.length,
    toolCallCount,
  };
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test:scripts -- baseline-metrics-capture`
Expected: 5 PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/baseline-metrics-capture.ts scripts/baseline-metrics-capture.test.ts
git commit -m "feat(baseline): per-turn token decomposition rows in aggregator"
```

---

## Task 4: Per-tool aggregate breakdown + tool-result size attribution

**Files:**
- Modify: `scripts/baseline-metrics-capture.test.ts`
- Modify: `scripts/baseline-metrics-capture.ts`

This task wires `tool_use_id` ↔ `tool_result.tool_use_id` so result sizes can be attributed to the tool name. Same single-pass pattern: a `tool_use` registers its id in a map; a later `tool_result` looks up the name and accumulates `chars / 4`.

- [ ] **Step 1: Extend the TranscriptEvent type to model `tool_result` items**

In `scripts/baseline-metrics-capture.ts`, replace the current `ToolUseItem` interface with two interfaces and a union, and update `TranscriptEvent.message.content` to use it:

```typescript
interface ToolUseItem {
  type: 'tool_use';
  id?: string;
  name?: string;
  input?: { command?: string };
}

interface ToolResultItem {
  type: 'tool_result';
  tool_use_id?: string;
  content?: string | Array<{ type?: string; text?: string }>;
}

interface OtherContentItem {
  type?: string;
}

type ContentItem = ToolUseItem | ToolResultItem | OtherContentItem;
```

Update the `TranscriptEvent` `message.content` type:

```typescript
  message?: {
    content?: ContentItem[];
    usage?: { /* unchanged */ };
  };
```

You will need narrow checks where `extractBashCommands` reads `item.input?.command` — update that function:

```typescript
function extractBashCommands(events: TranscriptEvent[]): string[] {
  const out: string[] = [];
  for (const ev of events) {
    const items = ev.message?.content ?? [];
    for (const item of items) {
      if (item.type === 'tool_use' && item.name === 'Bash' && 'input' in item && item.input?.command) {
        out.push(item.input.command);
      }
    }
  }
  return out;
}
```

- [ ] **Step 2: Add tests for the per-tool aggregate**

Append to the describe block in the test file:

```typescript
  it('attributes tool_result size to the originating tool via tool_use_id (chars/4 heuristic)', () => {
    const stats = aggregateTokenStats(FIXTURE_EVENTS);
    // Bash: tu_001 result 'hello\n' = 6 chars → floor(6/4) = 1
    //       tu_003 result 'foo\nbar\n' = 8 chars → floor(8/4) = 2
    expect(stats.toolBreakdown.Bash).toEqual({ calls: 2, result_tokens_est: 3 });
    // Read: tu_002 result is 'long file content '.repeat(50) = 900 chars → 225
    expect(stats.toolBreakdown.Read).toEqual({ calls: 1, result_tokens_est: 225 });
  });
```

- [ ] **Step 3: Run tests to verify failure**

Run: `npm run test:scripts -- baseline-metrics-capture`
Expected: FAIL (`stats.toolBreakdown` is undefined).

- [ ] **Step 4: Implement per-tool breakdown with tool_use_id matching**

In `scripts/baseline-metrics-capture.ts`, add the `ToolBreakdownEntry` interface and extend `AggregatedStats`:

```typescript
export interface ToolBreakdownEntry {
  calls: number;
  result_tokens_est: number;
}

export interface AggregatedStats {
  prClaim: { total: number; uncached: number; cacheRead: number; cacheCreate: number };
  output: { total: number; meanPerTurn: number; maxPerTurn: number };
  toolBreakdown: Record<string, ToolBreakdownEntry>;
  perTurnRows: PerTurnRow[];
  turnCount: number;
  toolCallCount: number;
}
```

Add a helper for tool_result size (above `aggregateTokenStats`):

```typescript
// Estimate tool_result content size in tokens via the chars/4 heuristic
// (Claude's standard rule of thumb). ~10% error; documented in the spec.
function toolResultTokens(content: ToolResultItem['content']): number {
  if (typeof content === 'string') return Math.floor(content.length / 4);
  if (Array.isArray(content)) {
    const chars = content.reduce((sum, c) => sum + (c.text?.length ?? 0), 0);
    return Math.floor(chars / 4);
  }
  return 0;
}
```

Extend `aggregateTokenStats` to build `toolBreakdown`. Add a `toolUseIdToName` map and a `toolBreakdown` record at the top of the function, and update the inner loops:

```typescript
  const perTurnRows: PerTurnRow[] = [];
  const toolBreakdown: Record<string, ToolBreakdownEntry> = {};
  const toolUseIdToName = new Map<string, string>();
  let outputTotal = 0;
  let outputMax = 0;
  let toolCallCount = 0;
  let prClaim = { total: 0, uncached: 0, cacheRead: 0, cacheCreate: 0 };

  for (const ev of events) {
    const items = ev.message?.content ?? [];
    const thisTurnBreakdown: Record<string, number> = {};
    let thisTurnToolUses = 0;
    for (const item of items) {
      if (item.type === 'tool_use') {
        thisTurnToolUses++;
        toolCallCount++;
        const name = item.name ?? 'unknown';
        thisTurnBreakdown[name] = (thisTurnBreakdown[name] ?? 0) + 1;
        toolBreakdown[name] ??= { calls: 0, result_tokens_est: 0 };
        toolBreakdown[name].calls++;
        if (item.id) toolUseIdToName.set(item.id, name);
      } else if (item.type === 'tool_result') {
        const name = item.tool_use_id ? toolUseIdToName.get(item.tool_use_id) : undefined;
        if (name) {
          toolBreakdown[name] ??= { calls: 0, result_tokens_est: 0 };
          toolBreakdown[name].result_tokens_est += toolResultTokens(item.content);
        }
      }
    }
    // ... rest of usage handling unchanged from Task 3 ...
```

(Leave the `usage` block, `prClaim` update, and `perTurnRows.push` exactly as they were in Task 3.)

Update the return statement to include `toolBreakdown`:

```typescript
  return {
    prClaim,
    output: {
      total: outputTotal,
      meanPerTurn: perTurnRows.length > 0 ? Math.floor(outputTotal / perTurnRows.length) : 0,
      maxPerTurn: outputMax,
    },
    toolBreakdown,
    perTurnRows,
    turnCount: perTurnRows.length,
    toolCallCount,
  };
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm run test:scripts -- baseline-metrics-capture`
Expected: 6 PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/baseline-metrics-capture.ts scripts/baseline-metrics-capture.test.ts
git commit -m "feat(baseline): per-tool token attribution via tool_use_id"
```

---

## Task 5: Max tool result size

**Files:**
- Modify: `scripts/baseline-metrics-capture.test.ts`
- Modify: `scripts/baseline-metrics-capture.ts`

- [ ] **Step 1: Add a test asserting max tool-result size**

Append to the describe block:

```typescript
  it('captures the largest single tool_result size (in tokens)', () => {
    const stats = aggregateTokenStats(FIXTURE_EVENTS);
    // largest is tu_002's result → 225 tokens
    expect(stats.maxToolResultSizeTokens).toBe(225);
  });
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm run test:scripts -- baseline-metrics-capture`
Expected: FAIL (`maxToolResultSizeTokens` undefined).

- [ ] **Step 3: Track max in the existing tool_result branch**

In `scripts/baseline-metrics-capture.ts`, add `maxToolResultSizeTokens` to `AggregatedStats`:

```typescript
export interface AggregatedStats {
  prClaim: { total: number; uncached: number; cacheRead: number; cacheCreate: number };
  output: { total: number; meanPerTurn: number; maxPerTurn: number };
  toolBreakdown: Record<string, ToolBreakdownEntry>;
  maxToolResultSizeTokens: number;
  perTurnRows: PerTurnRow[];
  turnCount: number;
  toolCallCount: number;
}
```

Declare and update the variable inside `aggregateTokenStats`. Add `let maxToolResultSizeTokens = 0;` to the var declarations near the top, and update the `tool_result` branch:

```typescript
      } else if (item.type === 'tool_result') {
        const tokens = toolResultTokens(item.content);
        if (tokens > maxToolResultSizeTokens) maxToolResultSizeTokens = tokens;
        const name = item.tool_use_id ? toolUseIdToName.get(item.tool_use_id) : undefined;
        if (name) {
          toolBreakdown[name] ??= { calls: 0, result_tokens_est: 0 };
          toolBreakdown[name].result_tokens_est += tokens;
        }
      }
```

Add `maxToolResultSizeTokens` to the return:

```typescript
  return {
    prClaim,
    output: { /* ... */ },
    toolBreakdown,
    maxToolResultSizeTokens,
    perTurnRows,
    turnCount: perTurnRows.length,
    toolCallCount,
  };
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test:scripts -- baseline-metrics-capture`
Expected: 7 PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/baseline-metrics-capture.ts scripts/baseline-metrics-capture.test.ts
git commit -m "feat(baseline): track max tool_result size in tokens"
```

---

## Task 6: Wire aggregator into `main()` — schema expansion + INSERTs

**Files:**
- Modify: `scripts/baseline-metrics-capture.ts` (`main()` function and surrounding code)

This task is the only one touching `main()`. Behavior change: the script now creates two tables, computes the richer stats, and inserts the per-turn rows in a transaction. The `pr_claim_*` columns retain their existing semantics (last-turn snapshot) for backward compatibility — they map from `stats.prClaim`.

- [ ] **Step 1: Replace the `baseline_metrics` `CREATE TABLE` with the expanded schema**

Find the `db.exec(\`DROP TABLE IF EXISTS baseline_metrics\`);` block (currently around line 170). Replace both the DROP and the CREATE TABLE with:

```typescript
  db.exec(`DROP TABLE IF EXISTS baseline_metrics`);
  db.exec(`DROP TABLE IF EXISTS baseline_metrics_per_turn`);
  db.exec(`CREATE TABLE baseline_metrics (
    run_id INTEGER PRIMARY KEY,
    cleanliness_pass_count INTEGER,
    turn_count INTEGER,
    tool_call_count INTEGER,
    compaction_count INTEGER,
    auto_compaction_count INTEGER,
    max_pre_compact_tokens INTEGER,
    pr_claim_input_tokens INTEGER,
    pr_claim_uncached_tokens INTEGER,
    pr_claim_cache_read_tokens INTEGER,
    pr_claim_cache_creation_tokens INTEGER,
    output_tokens_total INTEGER NOT NULL,
    output_tokens_mean_per_turn INTEGER NOT NULL,
    output_tokens_max_per_turn INTEGER NOT NULL,
    max_tool_result_size_tokens INTEGER NOT NULL,
    tool_token_breakdown TEXT NOT NULL,
    captured_at TEXT NOT NULL
  )`);
  db.exec(`CREATE TABLE baseline_metrics_per_turn (
    run_id INTEGER NOT NULL,
    turn_index INTEGER NOT NULL,
    uncached_tokens INTEGER NOT NULL,
    cache_read_tokens INTEGER NOT NULL,
    cache_creation_tokens INTEGER NOT NULL,
    total_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    tool_calls_this_turn INTEGER NOT NULL,
    tool_calls_breakdown TEXT NOT NULL,
    PRIMARY KEY (run_id, turn_index)
  )`);
```

- [ ] **Step 2: Replace the per-run aggregation block to use `aggregateTokenStats`**

Find the existing per-run loop body (after the `transcriptPath` resolution). Replace these lines:

```typescript
    const events = await readTranscript(transcriptPath);
    const commands = extractBashCommands(events);
    const cleanlinessCount = countCleanlinessChecks(commands);
    const turns = countTurns(events);
    const toolCalls = countToolCalls(events);
    const compactions = compactionStats(events);
    const tokens = lastPrClaimTokens(events);
```

with:

```typescript
    const events = await readTranscript(transcriptPath);
    const commands = extractBashCommands(events);
    const cleanlinessCount = countCleanlinessChecks(commands);
    const compactions = compactionStats(events);
    const stats = aggregateTokenStats(events);
```

- [ ] **Step 3: Replace the `INSERT INTO baseline_metrics` with the expanded version**

Replace the existing `db.prepare(...).run(...)` block with:

```typescript
    db.prepare(
      `INSERT INTO baseline_metrics (
         run_id, cleanliness_pass_count, turn_count, tool_call_count,
         compaction_count, auto_compaction_count, max_pre_compact_tokens,
         pr_claim_input_tokens, pr_claim_uncached_tokens,
         pr_claim_cache_read_tokens, pr_claim_cache_creation_tokens,
         output_tokens_total, output_tokens_mean_per_turn, output_tokens_max_per_turn,
         max_tool_result_size_tokens, tool_token_breakdown,
         captured_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      row.id,
      cleanlinessCount,
      stats.turnCount,
      stats.toolCallCount,
      compactions.total,
      compactions.auto,
      compactions.maxPreTokens,
      stats.prClaim.total,
      stats.prClaim.uncached,
      stats.prClaim.cacheRead,
      stats.prClaim.cacheCreate,
      stats.output.total,
      stats.output.meanPerTurn,
      stats.output.maxPerTurn,
      stats.maxToolResultSizeTokens,
      JSON.stringify(stats.toolBreakdown),
      new Date().toISOString(),
    );
```

- [ ] **Step 4: Add transaction-wrapped per-turn INSERTs**

Directly after the previous `db.prepare(...).run(...)` block (still inside the `for (const row of rows)` loop), add:

```typescript
    const insertTurn = db.prepare(
      `INSERT INTO baseline_metrics_per_turn (
         run_id, turn_index,
         uncached_tokens, cache_read_tokens, cache_creation_tokens,
         total_tokens, output_tokens,
         tool_calls_this_turn, tool_calls_breakdown
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const insertAllTurns = db.transaction((turns: typeof stats.perTurnRows) => {
      for (const turn of turns) {
        insertTurn.run(
          row.id,
          turn.turn_index,
          turn.uncached_tokens,
          turn.cache_read_tokens,
          turn.cache_creation_tokens,
          turn.total_tokens,
          turn.output_tokens,
          turn.tool_calls_this_turn,
          JSON.stringify(turn.tool_calls_breakdown),
        );
      }
    });
    insertAllTurns(stats.perTurnRows);
```

- [ ] **Step 5: Remove the now-unused helpers**

These are subsumed by `aggregateTokenStats`. Delete them entirely from `scripts/baseline-metrics-capture.ts`:

```typescript
function lastPrClaimTokens(events: TranscriptEvent[]): PrClaimTokens { /* ... */ }
function countTurns(events: TranscriptEvent[]): number { /* ... */ }
function countToolCalls(events: TranscriptEvent[]): number { /* ... */ }
```

Also delete the `interface PrClaimTokens { ... }` block; it's no longer used.

- [ ] **Step 6: Run scripts tests + typecheck + lint**

Run: `npm run test:scripts -- baseline-metrics-capture`
Expected: 7 PASS (no regressions).

Run: `npm run typecheck`
Expected: PASS.

Run: `npm run lint`
Expected: PASS.

If lint complains about unused imports (e.g., `PrClaimTokens` references), clean them up and re-run.

- [ ] **Step 7: Commit**

```bash
git add scripts/baseline-metrics-capture.ts
git commit -m "feat(baseline): expand schema with output, per-turn series, per-tool breakdown"
```

---

## Task 7: Update the console log line

**Files:**
- Modify: `scripts/baseline-metrics-capture.ts` (console.log inside `main()`)

- [ ] **Step 1: Replace the per-run summary line**

In `main()`, find the existing `console.log(\`run ${row.id}: cleanliness=...\`)` block. Replace it with:

```typescript
    const compactSuffix =
      compactions.total > 0
        ? `, compact=${compactions.total}(${compactions.auto} auto, peak=${compactions.maxPreTokens})`
        : '';
    console.log(
      `run ${row.id}: cleanliness=${cleanlinessCount}/${CLEANLINESS_COMMANDS.length}, ` +
      `turns=${stats.turnCount}, tools=${stats.toolCallCount}, ` +
      `tokens=${stats.prClaim.total} (cached=${stats.prClaim.cacheRead}), ` +
      `output=${stats.output.total} (mean=${stats.output.meanPerTurn}, max=${stats.output.maxPerTurn}), ` +
      `maxToolResult=${stats.maxToolResultSizeTokens}${compactSuffix}`,
    );
```

- [ ] **Step 2: Confirm scripts tests still pass**

Run: `npm run test:scripts -- baseline-metrics-capture`
Expected: 7 PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/baseline-metrics-capture.ts
git commit -m "feat(baseline): expand per-run console summary with output + max tool result"
```

---

## Task 8: End-to-end verification against the real daemon DB

**Files:** None modified — this task is verification only.

This task runs the capture script in the same Docker container path the production baseline uses, and confirms the new schema populates correctly.

- [ ] **Step 1: Run baseline capture against the docker daemon container**

Run: `npm run baseline:capture`
Expected: script prints one `run N:` line per completed run, including the new `output=...` and `maxToolResult=...` segments. No errors.

If you get an error about Docker permission or the daemon container not being up, run the daemon first:
Run: `docker compose up -d daemon`
Then retry `npm run baseline:capture`.

- [ ] **Step 2: SQL spot-check the expanded schema**

Run, then paste the queries one at a time:

```bash
docker compose exec daemon sqlite3 /state/state.db
```

Inside the sqlite shell:

```sql
-- 1) Output tokens populated for every run with non-zero turns
SELECT COUNT(*) AS runs_missing_output
FROM baseline_metrics
WHERE output_tokens_total = 0 AND turn_count > 0;
-- Expected: 0

-- 2) tool_token_breakdown is always valid JSON
SELECT COUNT(*) AS invalid_breakdown
FROM baseline_metrics
WHERE json_valid(tool_token_breakdown) = 0;
-- Expected: 0

-- 3) Per-turn row count matches turn_count
SELECT b.run_id, b.turn_count, COUNT(p.turn_index) AS per_turn_rows
FROM baseline_metrics b
LEFT JOIN baseline_metrics_per_turn p ON p.run_id = b.run_id
GROUP BY b.run_id
HAVING b.turn_count != per_turn_rows;
-- Expected: 0 rows

-- 4) Per-turn tool_calls_this_turn sums to aggregate tool_call_count
SELECT b.run_id, b.tool_call_count, COALESCE(SUM(p.tool_calls_this_turn), 0) AS sum_per_turn
FROM baseline_metrics b
LEFT JOIN baseline_metrics_per_turn p ON p.run_id = b.run_id
GROUP BY b.run_id
HAVING b.tool_call_count != sum_per_turn;
-- Expected: 0 rows

-- 5) Glance at the actual data — top 5 runs by output_tokens
SELECT run_id, turn_count, output_tokens_total, output_tokens_max_per_turn, max_tool_result_size_tokens
FROM baseline_metrics
ORDER BY output_tokens_total DESC LIMIT 5;
-- Expected: nonzero values; values are plausible (e.g., max_tool_result_size_tokens in the thousands, output_tokens_max_per_turn < 10000)
```

Exit the sqlite shell: `.quit`

- [ ] **Step 3: Final cleanliness gate**

Run in order:
```bash
npm run lint
npm run typecheck
npm run test:run
npm run format:check
```
All four must pass.

- [ ] **Step 4: Push and open the PR**

The branch is already `CREW-165` (created in Prerequisites). Push and PR:

```bash
git push -u origin CREW-165
gh pr create --title "expand baseline_metrics: output + per-turn + per-tool attribution" --body "$(cat <<'EOF'
## Summary
- Add output_tokens (total / mean / max) to per-run baseline_metrics
- Add new baseline_metrics_per_turn table with per-turn token decomposition (schema matches the per-turn followup's eventual run_turn_metrics shape)
- Add per-tool attribution via tool_use_id matching, stored as JSON in tool_token_breakdown
- Add max_tool_result_size_tokens to surface bash-bloat tail

Lands before any Phase 2 (per-package AGENTS.md) PR merges so the post-Phase-2 baseline captures the axes needed to evaluate progressive-disclosure's impact.

Spec: docs/superpowers/specs/2026-05-14-baseline-metrics-expansion-design.md
Plan: docs/superpowers/plans/2026-05-14-baseline-metrics-expansion.md

## Test plan
- [x] npm run test:scripts — unit tests against inline fixture
- [x] npm run baseline:capture — end-to-end against docker daemon
- [x] SQL spot checks (output > 0, json_valid, per-turn row count, tool_calls sum)
- [x] npm run lint / typecheck / test:run / format:check all pass

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Surface the PR URL when done.

---

## Spec coverage check

| Spec requirement | Task |
|---|---|
| Add `output_tokens_total`, `output_tokens_mean_per_turn`, `output_tokens_max_per_turn` to `baseline_metrics` | Tasks 1, 2, 6 |
| Add `max_tool_result_size_tokens` | Tasks 5, 6 |
| Add `tool_token_breakdown` JSON column at run aggregate level | Tasks 4, 6 |
| Create `baseline_metrics_per_turn` table with followup-matching columns | Tasks 3, 6 |
| Per-turn `tool_calls_breakdown` JSON | Tasks 3, 6 |
| `chars / 4` heuristic for tool-result size, documented inline | Task 4 (Step 4 helper) |
| Single-pass aggregator with `tool_use_id` ↔ `tool_result.tool_use_id` matching | Task 4 |
| Transaction-wrapped per-turn INSERTs | Task 6 (Step 4) |
| Console summary includes new output fields | Task 7 |
| Existing `pr_claim_*` semantics preserved (last-turn snapshot) | Task 2 (`prClaim` test) + Task 6 (INSERT mapping) |
| Vitest unit test against inline fixture | Tasks 1–5 |
| End-to-end via `npm run baseline:capture` | Task 8 |
| SQL spot checks (output > 0, json_valid, per-turn count == turn_count, tool_calls sum) | Task 8 |
| Cleanliness gates (lint, typecheck, test:run, format:check) pass | Task 8 (Step 3) |
| Merge order: this PR → re-baseline → Phase 2 PRs | Out of code scope; handled at ticket-link time |
