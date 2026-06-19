# CREW-264 — `deriveState` should honor the transition log + override provenance over legacy terminal guards

Jira: https://safturento.atlassian.net/browse/CREW-264

## Goal

Fix two coupled defects in `AgentsService.deriveState` (one PR):

- **Defect 1 (CREW-252 footgun):** a completed exit-0 run with no PR and an empty/non-terminal transition log resolves to `idle`, never a fabricated `finished`. `finished` only from `finishCompletedOk`.
- **Defect 2 (CREW-258/259 escape hatch):** an operator override OUT of `finished`/`error`/`pr_merged` survives a list + detail re-derive instead of reverting after the SSE flip.

## Relevant files

- `packages/daemon/src/services/AgentsService.ts` — `deriveState` (the guard ladder + the `return 'finished'` fallthrough), plus the `list()` and `getByKey` projections that build `DeriveStateInput`.
- `packages/daemon/src/services/AgentsService.test.ts` — unit coverage.
- `packages/daemon/src/services/IngestService.ts` — `recordStateOverride` writes the `source='override'` transition (read-only context).
- `packages/daemon/src/migrations/0012_state_transitions_source.ts` — the `source` provenance column (CREW-259) this fix keys on.

## Decisions

- **Defect 2 keyed on `source='override'`, not "any newer transition".** Answers the followup's open question in favor of the safer option — legacy/backfilled agents keep the terminal guards; only the explicit operator escape hatch bypasses them.
- **"Latest transition is an override" ⇒ honor `currentState`.** `currentState` is already projected from the latest `(ts, id)` row, so when that row is an override it holds the override target. No separate ts-vs-terminal-signal comparison is needed: any newer automatic event writes a non-override row, becomes the latest, and re-takes precedence. This structurally satisfies the ticket's "strictly-newer" requirement.
- **Fallthrough → `idle`.** A clean run that ended with no PR is `idle` (the state CREW-257 made reachable), matching the write-path `reduceState`.

## Ruled out

- Having the override actively neutralize the competing terminal signal — can't delete the historical `pr_merged` row, and `finishCompletedOk` derives from the runs table, not transitions. The read-path discriminator is cleaner.

## Notes

`list()` surfaces the latest row's `source` via a second correlated subquery with the identical `ORDER BY ts DESC, id DESC LIMIT 1` as `latest_to_state`, so both select the same row. `getByKey` adds `source` to its existing latest-transition select.

Both `docs/followups.md` entries moved to Resolved: the 2026-06-19 override-terminal-guard entry (was Active) and a CREW-264 addendum on the already-resolved 2026-06-03 `deriveState`-finished-footgun entry (its prior resolution covered only the write-path twin; the read-path `return 'finished'` survived until here).
