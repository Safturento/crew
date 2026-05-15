# CREW-164 — Phase 4 metrics pipeline

Jira: https://safturento.atlassian.net/browse/CREW-164

## Goal

Wire the Layer-1 metrics pipeline end-to-end: transcript-parser extractors, a
`runs`-table migration, a `MetricsService`, a `GET /api/metrics` route, dashboard
widgets, and transcript-driven capture on run completion.

## Relevant files

- `packages/shared/src/transcripts/extract-bash-commands.ts` / `extract-read-paths.ts` — new extractors
- `packages/daemon/src/migrations/0003_run_metrics.ts` — adds 5 metric columns to `runs`
- `packages/daemon/src/services/MetricsService.ts` — record + aggregate
- `packages/daemon/src/services/computeRunMetrics.ts` — transcript → `MetricInputs`
- `packages/daemon/src/routes/metrics.ts` — `GET /api/metrics?baseline=<bool>`
- `packages/daemon/src/routes/runs.ts` — capture metrics on run completion
- `packages/dashboard/src/components/MetricsTrendWidget.tsx` — landing-page widget
- `bruno/endpoints/metrics/get.bru` — API smoke coverage

## Decisions

- **Route path is `/api/metrics`** — the plan wrote `/metrics`, but every daemon
  route is mounted under `/api/`. Followed the repo convention.
- **`MetricsService` takes a `{ db }` deps object** — matches `AgentsService`;
  the plan's verbatim `new MetricsService(db)` is reference-only.
- **Dashboard mount points adapted** — the plan named `AgentsListPage` /
  `AgentDetailPage`, which don't exist. Widget mounts in `AgentsList` (the
  landing view); per-run metrics surface in `AgentBody` (agent detail).
- **`computeRunMetrics` derives 3 of 4 metrics** — `cleanlinessPass` and
  `prClaimInputTokens` from the transcript, `docLoadCoveragePct` from the
  worktree's agent-doc inventory. `parityViolations` is left `null` — no
  transcript-only signal exists until the Phase 3 parity hook (CREW-160) lands.
  Captured as a followup.

## Notes

Plan: `docs/superpowers/plans/2026-05-13-agent-progressive-disclosure-system.md`,
"Ticket #11 — Phase 4 Metrics pipeline" (Steps 1–28).
