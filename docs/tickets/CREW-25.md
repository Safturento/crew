# CREW-25 — Adopt cva + static state-color classes in dashboard

Jira: https://safturento.atlassian.net/browse/CREW-25

## Goal

Replace manual className-composition in `StateBadge.tsx` and `AgentRow.tsx` with
`class-variance-authority`, and eliminate `${colorVar}`-style runtime-interpolated
Tailwind classes by sourcing per-state tokens from a static `STATE_CLASSES`
record. Visual parity preserved.

## Relevant files

- `packages/dashboard/src/data/state-meta.ts` — adds `STATE_CLASSES` record with
  literal Tailwind tokens for all 7 agent states.
- `packages/dashboard/src/data/state-meta.test.ts` — pins the static-class
  contract (non-empty tokens, no template-string syntax).
- `packages/dashboard/src/components/StateBadge.tsx` — one `cva` for the badge
  body (size × state × intensity via compound variants), a second `cva` for the
  inline dot (state × pulse). Removes `SIZE_CLASSES`, `classesForIntensity`,
  `PulseDot`, `Dot`.
- `packages/dashboard/src/components/AgentRow.tsx` — extracts a
  `quickActionButton` cva (variant: primary/secondary), `describeQuickAction`
  returns a small descriptor, `QuickAction` renders the right shell. Row-level
  attention className reads literal tokens from `STATE_CLASSES`.

## Decisions

- **Compound variants generated mechanically.** `STATE_CLASSES` × `INTENSITY_TEMPLATES`
  produces all 21 combinations at module-eval time so per-state colors stay
  sourced from `state-meta.ts` (single source of truth).
- **Empty strings in the cva `state`/`intensity` variant slots.** Required by
  `cva`'s typing — every value the discriminator can take needs to be enumerated
  even when the actual class strings come from `compoundVariants`.
- **Both `data-testid`s preserved on the dot** (`state-badge-pulse` / `state-badge-dot`)
  so the existing badge tests pass without modification.

## Plan reference

Phase B (Tasks B1-B4) of
[`docs/superpowers/plans/2026-04-28-dashboard-frontend-libs-refactor.md`](../superpowers/plans/2026-04-28-dashboard-frontend-libs-refactor.md).

## Verification

- `npm run --workspace crew-dashboard typecheck` — pass.
- `npm run --workspace crew-dashboard test:run` — all green, including new
  `it.each` state-token assertions in `StateBadge.test.tsx` and `Retry`/`Archive`
  cases in `AgentRow.test.tsx`.
- `npm run --workspace crew-dashboard build` — pass; bundle delta within
  ~1kB gz expected for cva.
