# CREW-217 — T5: Dashboard action layer + runner-aware degradation

Jira: https://safturento.atlassian.net/browse/CREW-217

## Goal

Dashboard-side action layer, Task T5 of the dashboard-triggered agent actions
epic (CREW-208). The base layer the action UIs (T6–T9) build on:

- App-level TanStack `useMutation` hook (`useEnqueueAction`) that POSTs to
  `/api/actions`, with `sonner` toasts on enqueue and on `action.changed`
  failures.
- An SSE-driven `useRunnerStatus()` hook (seeded from `GET /api/runner/status`,
  patched by `runner.status_changed`).
- The missing `onAgentAction` handler in `App.tsx` — the QuickAction thread
  (AgentRow → ProjectSection → AgentsList → App) finally has a handler.
- Graceful no-runner degradation: enqueue-able QuickActions are disabled +
  annotated ("Waiting for runner") when no runner is online.

## Relevant files

- `packages/dashboard/src/data/actions.ts` — `useEnqueueAction` + `useActionToasts`.
- `packages/dashboard/src/data/useRunnerStatus.ts` — SSE-driven runner online/offline.
- `packages/dashboard/src/data/eventStream.ts` — register `action.changed` +
  `runner.status_changed` event names.
- `packages/dashboard/src/data/DaemonClient.ts` / `HttpDaemonClient.ts` —
  `enqueueAction` + `getRunnerStatus` methods.
- `packages/dashboard/src/App.tsx` — `onAgentAction` handler, `<Toaster />`,
  `useActionToasts`, runner-status degradation.
- `packages/dashboard/src/components/{AgentsList,ProjectSection,AgentRow}.tsx` —
  thread `runnerOnline` down to disable enqueue-able QuickActions when offline.

## Decisions

- **Only `resume` and `finish` QuickActions enqueue.** `resume` → `run`,
  `finish` → `finish`. `fix_pr` is a modal flow (T7); `view-pr` is a plain link;
  `provide-input` / `inspect` are not queue actions. The handler no-ops on the
  rest, leaving them for their own tickets.
- **`project` = `agent.projectName`, `ticketKey` = `agent.key`.** The daemon
  validates `project` via `ProjectsService.getBySlug` (matches `config.name`),
  and `agent.projectName` is that same name; the agent key is the ticket key.
- **Local zod schemas for action/runner responses.** Mirrors the existing
  `HttpDaemonClient` convention of inlining response schemas rather than pulling
  runtime values from the `crew-shared` barrel (Vite-bundling concern). Action
  *types* (`ActionRequest`, `EnqueueAction`, `ActionKind`) come in as type-only
  imports, which are already used elsewhere in the dashboard.
- **`useRunnerStatus` stores state in TanStack Query.** SSE `runner.status_changed`
  patches the `['runner-status']` cache; a 30s poll is the belt-and-suspenders
  fallback — same pattern as `useAgent`.

## Notes

Blocked-by T2 (CREW-214, queue + `action.changed`) and uses T3 (CREW-215,
`GET /api/runner/status` + `runner.status_changed`); both merged to main.
