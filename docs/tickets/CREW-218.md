# CREW-218 — T6: New Run modal (Stepper)

Jira: https://safturento.atlassian.net/browse/CREW-218

## Goal

A "+ New Run" stepper modal (Task T6 of the dashboard-triggered agent actions
epic, CREW-208). Built from the shipped DS composites (`Modal` / `Stepper` /
`ModalSelectionRow` / `FormField`), it walks `1 · Project → 2 · Ticket →
3 · Confirm`; the final step is the confirm guard (per the spec's security
decision). On confirm it enqueues a `run` action via the T5 mutation layer
(`useEnqueueAction`).

## Relevant files

- `packages/dashboard/src/components/NewRunModal.tsx` — the stepper modal (+ `.test.tsx`, `.figma.tsx`).
- `packages/dashboard/src/App.tsx` — wires `onNewRun` to open the modal and
  `onConfirm` to `enqueue.mutate({ kind: 'run', … })`.
- `packages/dashboard/src/components/TopNav.tsx` — already exposes the `+ New Run`
  trigger via `onNewRun` (no change needed).
- `.agents/design-system.md` — composite inventory tables (add `NewRunModal`).

## Decisions

- **Step 2 is a ticket-key text entry, not a live open-ticket picker.** The
  Figma frame for step 2 shows a filterable list of open Jira tickets, but no
  daemon endpoint serves open tickets (the dashboard's `DaemonClient` exposes
  only `listProjects` / `listAgents` / `enqueueAction` / `getRunnerStatus`).
  The plan (T6 step 2) explicitly defers live ticket fetching to a later pass
  ("otherwise skip in v1"), so step 2 is a `FormField` where the operator types
  the ticket key. Tracked as a followup. The project's `jiraKey` is surfaced as
  the input prefix hint so the entry is unambiguous.
- **The "Spawn agent →" button on step 3 IS the confirm guard.** Nothing
  enqueues from steps 1–2; the operator must reach the confirm step and click
  Spawn. That satisfies the spec's confirm-on-run security decision without a
  second nested AlertModal.
- **Controlled, presentational component.** `NewRunModal` takes
  `{ open, onOpenChange, projects, onConfirm }`; it owns only the wizard's
  internal step/selection state and calls `onConfirm({ project, ticketKey })`.
  App owns the enqueue mutation (keeps the no-business-logic rule for the
  dashboard package and matches the T5 layering).
- **Confirm summary derives Worktree + Command from project data.** Project,
  Ticket, Worktree (`<repoPath>/.worktrees/<KEY>`) and Command (`crew run <KEY>`)
  match the Figma confirm rows we can populate; the Figma "Title" row is omitted
  (no ticket-summary source in v1 — same followup as the ticket picker).

## Notes

Blocked-by T5 (CREW-217, `useEnqueueAction`), merged to main. Step 1's project
rows reuse `listProjects()` already fetched in `App.tsx`.
</content>
</invoke>
