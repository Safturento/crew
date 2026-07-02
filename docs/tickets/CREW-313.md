# CREW-313 — Runner rework G: dispatch-gate visibility

Jira: https://safturento.atlassian.net/browse/CREW-313

## Goal

No pre-spawn startup failure is invisible. Three gaps to close:

1. The dispatch preflight + playwright-install tail of `prepareAgentEnvironment` (and the
   remaining unbracketed pre-spawn paths — Bruno env write, skill/hook injection) aren't
   wrapped in `bracketStartupPhase`, so a throw there emits no `failed` phase.
2. `TimelineService.getTimeline` never merges the `runs` row's structured `failed-start`
   diagnosis, so a preflight death leaves an all-green timeline with the reason unreachable.
3. `GET /api/agents/:key` 404s for a zero-run agent (pre-registration death), so the drawer
   can't open for a worktree-phase failure even though the timeline endpoint has the reason.

## Relevant files

- `packages/shared/src/transcripts/schemas.ts` — startup subtype tuple + system event union; add
  `crew_startup_dispatch_preflight`, `crew_startup_playwright_install`, `crew_startup_bruno_env`,
  `crew_startup_skill_injection`, and the synthetic `crew_failed_start` variant.
- `packages/cli/src/lib/run/agent-environment.ts` — bracket `installPlaywrightBrowsers` + `runPreflight`.
- `packages/cli/src/commands/run.ts` — bracket Bruno env write + skill/hook injection; sync the local
  `StartupFailSubtype` alias.
- `packages/daemon/src/services/TimelineService.ts` — merge the latest `failed-start` run's failure
  fields as a synthetic terminal `crew_failed_start` event.
- `packages/daemon/src/services/AgentsService.ts` — `getByKey` returns the agents row (null run-derived
  fields) for a zero-run agent instead of null.
- `packages/dashboard/src/components/Timeline/event-labels.ts` + `eventClassification.ts` +
  `TranscriptRow.tsx` — labels + classification + rendering for the new phases and `crew_failed_start`.

## Decisions

- **Scope-3 minor paths get their own startup phases** (`crew_startup_bruno_env`,
  `crew_startup_skill_injection`) rather than folding into existing ones — the only way a throw there
  becomes a visible red phase, and it matches the per-concern `crew_startup_mcp` precedent. Skill +
  hook injection share one phase (sequential, both worktree-setup).
- **Two carriers for the dispatch-preflight diagnosis.** The bracket makes a red phase appear; the
  synthetic `crew_failed_start` merge (from the `runs` row) carries the full structured diagnosis
  (check/headline/remediation/output). Complementary — both render, no dedup.
- **`getByKey` returns null only when the agents row is missing.** A zero-run agents row yields a
  minimal detail with state derived from the transition log (same machinery as `list()`).

## Notes

Acceptance criteria + root-cause analysis live in the Jira description. Followup entry moved to
`docs/followups/resolved.md` as part of this PR.
