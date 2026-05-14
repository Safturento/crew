# Baseline-metrics expansion: output tokens + per-turn series + per-tool attribution

> Scope a richer `baseline_metrics` schema and capture it **before any Phase 2 (per-package AGENTS.md) PR merges**, so post-Phase-2 deltas land against a baseline that actually captures the axes we'll need to evaluate progressive-disclosure's impact.

## Background

`baseline_metrics`, introduced under CREW-154 (PR #199 + token-decomposition follow-ups #202 and #203), captures one row per completed `crew run`. Today it records turn count, tool-call count, cleanliness-check coverage, compaction stats, and an input-token decomposition (`uncached / cache_read / cache_creation`). The PR-claim turn's `usage` block drives the input-side numbers.

A sample of seven recent crew run transcripts (195M total tokens, ~$440 of Opus cost) surfaced three concrete instrumentation gaps that prevent meaningful before/after analysis for Phase 2:

1. **Output tokens aren't recorded at all.** The capture script's `TranscriptEvent.message.usage` type doesn't even declare `output_tokens`. Output is ~14% of cost in the sampled runs — small relative to cache reads but not negligible, and not something we can currently see.
2. **No per-turn time series.** The aggregate row collapses a 200+-turn trajectory into a single point. To validate that per-package AGENTS.md actually shrinks per-turn cached context (rather than just shifting where the bytes live), we need to compare cache-size-over-time curves, not just end-state totals.
3. **No per-tool attribution.** Bash dominates tool calls (30–50% of `tool_use` events in the sample) and Bash results land permanently in cached context. Without per-tool token attribution we can't size up which tools drive bloat.

These gaps need to close before Phase 2 merges. Otherwise the post-Phase-2 baseline is being compared against a less-instrumented snapshot and the interesting questions ("did per-turn cache_read drop? did Bash's share of context shrink?") aren't answerable.

## Goal

Expand `baseline_metrics` instrumentation along three axes, captured by the existing `scripts/baseline-metrics-capture.ts`, landed and re-baselined **before the first Phase 2 PR merges**:

- **Output-token volume** (per-run aggregate + per-turn series)
- **Per-turn token decomposition** as a time-series, columns matching the followup at `docs/followups.md#2026-05-14--per-turn-metric-series-so-cache-size-can-be-graphed-over-a-run`
- **Per-tool attribution** at the run aggregate level (and tool counts per turn for shape diagnostics)

## Non-goals

- **No behavior change in crew dispatch.** No prompt edits, no harness changes, no skill-injection tweaks. Pure instrumentation.
- **No dashboard or visualization.** Data lands in SQLite; UI is downstream.
- **No turn-count reduction or output-tightening strategies.** Those depend on this data and are scoped as future work (a separate brainstorm thread once Phase 2 is measurable).
- **No daemon-side live ingestion.** The followup's eventual home for per-turn data is the daemon's `MetricsService` writing to a `run_turn_metrics` table (CREW-164 territory). This spec lands the same data in the baseline snapshot script's table; the schema is designed to mirror what the daemon table will eventually hold. The followup stays open.
- **No historical backfill.** Capture script already `DROP`s + recreates on every run; re-running capture *is* the migration.

## Success criteria

- `npm run baseline:capture` produces rows in expanded `baseline_metrics` and the new `baseline_metrics_per_turn` for every completed crew run.
- SQL queries can answer:
  - "What's the output-token distribution across runs?"
  - "What does cache_read look like over the lifetime of run X?"
  - "Which tools account for the most cached-context weight?"
  - "Do cleanliness-check turns drag a large cache_read?"
- The expanded schema is in main, and a fresh baseline is captured, before any Phase 2 PR (per-package AGENTS.md migration) merges.

## Design

### Schema — expanded `baseline_metrics`

Additive only. All existing columns retained for query compatibility:

```sql
CREATE TABLE baseline_metrics (
  -- existing columns unchanged --
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
  -- NEW: output axis (per-run aggregate) --
  output_tokens_total INTEGER NOT NULL,
  output_tokens_mean_per_turn INTEGER NOT NULL,
  output_tokens_max_per_turn INTEGER NOT NULL,
  -- NEW: bash-bloat tail --
  max_tool_result_size_tokens INTEGER NOT NULL,
  -- NEW: per-tool attribution at run level (JSON1) --
  tool_token_breakdown TEXT NOT NULL,
  captured_at TEXT NOT NULL
)
```

`tool_token_breakdown` is a JSON object keyed by tool name, e.g.

```json
{
  "Bash":     { "calls": 118, "result_tokens_est": 42500 },
  "Read":     { "calls": 37,  "result_tokens_est": 15600 },
  "TodoWrite":{ "calls": 9,   "result_tokens_est": 320  }
}
```

SQLite's JSON1 (`json_extract(..., '$.Bash.result_tokens_est')`) makes per-tool queries painless without committing to a fixed tool enumeration in the column list.

### Schema — new `baseline_metrics_per_turn`

Column names chosen to match the per-turn followup's eventual `run_turn_metrics` shape, so that the daemon-side implementation later is a straight schema copy:

```sql
CREATE TABLE baseline_metrics_per_turn (
  run_id INTEGER NOT NULL,
  turn_index INTEGER NOT NULL,
  uncached_tokens INTEGER NOT NULL,
  cache_read_tokens INTEGER NOT NULL,
  cache_creation_tokens INTEGER NOT NULL,
  total_tokens INTEGER NOT NULL,            -- sum of the three input components
  output_tokens INTEGER NOT NULL,
  tool_calls_this_turn INTEGER NOT NULL,
  tool_calls_breakdown TEXT NOT NULL,       -- JSON: {"Bash":2,"Read":1,...}
  PRIMARY KEY (run_id, turn_index)
)
```

Both tables are dropped and recreated on every `baseline:capture` invocation (matches the existing pattern). No FK constraint on `run_id` — matches existing convention; `runs.id` is the implied join.

### Tool-result size estimation

The followup and the new scalar columns both speak in "tokens", but transcripts carry raw character content. We use a `chars / 4` heuristic — Claude's standard rule of thumb — and document it inline. Baseline is for trends and shape diagnostics, not billing reconciliation; ~10% estimation error is fine and avoids adding a tokenizer dependency to a script that today is dep-light.

### Capture-script changes (`scripts/baseline-metrics-capture.ts`)

1. **Type extension.** Add `output_tokens` to the `TranscriptEvent.message.usage` interface.
2. **Single-pass aggregator.** Replace `lastPrClaimTokens` with a broader `aggregateTokenStats(events)` that returns:
   - the per-turn rows for the new table (`turn_index`, `uncached_tokens`, `cache_read_tokens`, `cache_creation_tokens`, `total_tokens`, `output_tokens`, `tool_calls_this_turn`, `tool_calls_breakdown`)
   - the per-run aggregate (output total/mean/max, max tool result size, run-level `tool_token_breakdown`)
   - the existing PR-claim turn snapshot (kept verbatim for the `pr_claim_*` columns — preserves backward compatibility)
   - turn count, tool-call count (folded in from `countTurns` / `countToolCalls` so the script only walks the event list once)
3. **Tool-result sizing.** During the same pass, on `tool_result` items measure `(content as string).length / 4` rounded down. Track:
   - global max → `max_tool_result_size_tokens`
   - per-tool sum → contributes to `tool_token_breakdown.<tool>.result_tokens_est`
4. **Per-turn writes.** Wrap per-run `INSERT`s into `baseline_metrics_per_turn` in `db.transaction()` — ~200 rows/run is trivial but the transaction halves wall time on the larger runs.
5. **Console output.** Existing log line stays; append `, output=<total>K` for parity with the existing `tokens=<total>` summary, so a stdout-skim of the script confirms the new column is populating.

The existing helpers (`extractBashCommands`, `countCleanlinessChecks`) stay as-is; their iteration is independent.

### Ticketing & PR ordering

- **One ticket**, new key under CREW-153 epic (next available — likely CREW-165). Title: "expand baseline_metrics: output + per-turn + per-tool attribution".
- **Dependency edges in Jira:** every existing Phase 2 ticket gets a new "is blocked by" link to this new ticket. The Phase 2 epic plan already enumerates which tickets are Phase 2; this just adds an edge.
- **Merge order:**
  1. This PR merges to main.
  2. `npm run baseline:capture` runs against the docker daemon container — produces the richer "pre-Phase-2" snapshot.
  3. Phase 2 PRs (CREW-155+) merge sequentially per the epic's parallelism plan.
  4. After each Phase 2 PR, re-run `npm run baseline:capture` to refresh the snapshot. Compare deltas via SQL or ad-hoc node scripts.

Since the capture script DROPs + recreates the tables on every run, there's no migration risk and no schema drift across re-baselines.

## Testing

- **Unit test** (Vitest, `scripts/baseline-metrics-capture.test.ts` — new file): feed a known small JSONL fixture (one of the existing short transcripts under `~/.claude/projects/.../*.jsonl`, copied into a `scripts/fixtures/` directory and abbreviated). Assert:
  - `output_tokens_total` equals the sum of `output_tokens` in the per-turn rows
  - `tool_calls_breakdown` JSON parses and keys match the tool names in the fixture
  - `baseline_metrics_per_turn` row count equals `baseline_metrics.turn_count` for the fixture's run
- **End-to-end spot-check** via SQL after running capture against the real daemon DB:
  - `SELECT COUNT(*) FROM baseline_metrics WHERE output_tokens_total = 0` should be 0 for any run with `turn_count > 0`
  - `SELECT json_valid(tool_token_breakdown) FROM baseline_metrics` returns all 1s
  - `SELECT SUM(tool_calls_this_turn) FROM baseline_metrics_per_turn WHERE run_id = X` equals `tool_call_count` from `baseline_metrics` for the same run
- **Cleanliness gates** all pass: `npm run lint`, `npm run typecheck`, `npm run test:run`, `npm run format:check`. (`npm run bruno:smoke` not applicable — no HTTP routes touched.)

## Open considerations (documented, not blocking)

- **The followup at `docs/followups.md#2026-05-14--per-turn-metric-series-so-cache-size-can-be-graphed-over-a-run` stays open.** Its real home is daemon-side ingestion via `MetricsService` writing to `run_turn_metrics`. The schema we land here is the canonical shape for that future table; the open-question section of the followup (sample rate, retention) still applies to the daemon work and is not decided here.
- **The `pr_claim_*` column-name prefix is now mildly misleading** since we're capturing data beyond the PR-claim turn. Renaming would churn any external query that already uses those names. Defer renaming to the CREW-164 daemon-side work, where the schema is moving anyway.
- **Output token cost is ~14% of crew run cost.** This spec instruments it but does not act on it. A future brainstorm on output-axis strategies (terseness defaults, model routing, structured outputs) becomes data-driven once we can see distributions across runs.
- **Cache-read cost is the bigger lever (64.6% of crew run cost)**, driven by turn count × per-turn context size. Phase 2's per-package AGENTS.md attacks per-turn context; a separate future effort on turn-count reduction is the natural companion. Both are scoped *after* this spec ships, using the data it surfaces.

## Risks

- **Schema-mirroring risk.** The followup's eventual `run_turn_metrics` table might end up with slightly different column names if CREW-164 picks new conventions. Mitigation: this spec calls the followup out explicitly and the column names here are chosen from the followup's text. Any later rename in the daemon table is a one-time rewrite, not a structural problem.
- **Heuristic-token-estimation drift.** `chars / 4` can be off by 10–15% for code-heavy content. Mitigation: we document the heuristic and never bill or gate on these numbers — they're for trend comparison. If exact tokens are ever needed, swap in `@anthropic-ai/tokenizer` in one place.
- **Phase 2 unblocked slippage.** If this PR takes longer than expected and Phase 2 starts merging without it, the post-Phase-2 baseline is captured under the old schema. Mitigation: the merge-order section above; explicit Jira dependency edges; the work itself is ~1 day.
