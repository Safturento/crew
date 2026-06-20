# CREW-274 — Pause/Resume controls on Runner page row + agent drawer header

Jira: https://safturento.atlassian.net/browse/CREW-274
Parent Epic: [CREW-235](https://safturento.atlassian.net/browse/CREW-235) — Runner control parity. Plan task **F-1** (dashboard portion).

> Build slice **3 of 3** of the pause/resume/message fast-follow. The dashboard
> surface on top of the two backend slices, both Done:
> - **CREW-272** — `pause`/`resume`/`message` apply paths in the host runner.
> - **CREW-273** — pause-aware `crew run` + the non-terminal `paused` run-state
>   (a pause reduces the persistent run-state to `idle`; the `paused` label lives
>   only in the live-process snapshot, `LiveProcessState`).

## Goal

A running agent shows a **Pause** control; pausing enqueues a `pause` runner
command and the row/drawer reconciles to `paused` on the next snapshot. A paused
agent shows **Resume**; resuming enqueues a `resume` command (or a `message`
command when the operator types an optional steer message). Both the Runner-page
live-process row and the agent drawer header carry the controls, mirroring the
Cancel control shipped in CREW-246.

## Design

- **Data layer (`data/runnerControls.ts`).** Add `usePauseRun()` (enqueues
  `{ kind: 'pause', payload: null }`) mirroring the existing `useCancelRun` family,
  and `useResumeRun()` — a mutation over `{ agentKey, message? }` that sends
  `{ kind: 'message', payload: { message } }` when a steer message is present and
  `{ kind: 'resume', payload: null }` otherwise. (`message` and `resume` share one
  host apply path per CREW-272; the kind only varies whether a message rides along.)
- **`ResumeModal`** — a small presentational modal (mirrors `FixPrModal`) with an
  **optional** steer-message textarea. Empty → plain resume; non-empty → message
  resume. Shared by the row and the drawer.
- **`ProcessRow`.** Running → enabled **Pause** (was a disabled v1 stub) + Cancel.
  Paused → **Resume** (opens `ResumeModal`) + Cancel (abandon a paused run; the
  registry keeps the paused entry tracked, so `cancel_*` still settles it). New
  props `onPause(key)` and `onResume(key, message?)`, threaded through
  `LiveProcessList` and wired in `RunnerPage`.
- **`DrawerHeader`.** The drawer's `detail.state` is `idle` for a paused run
  (CREW-273 reduces it), so the snapshot is the only discriminator: consult
  `useRunnerStatus()` for a live process keyed by `detail.key`. `running` →
  **Pause**; snapshot `paused` → **Resume**. Cancel now also shows for a paused
  run (parity with the row). Reuses the `useCancelEscalation` hook + the
  pause/resume mutations.

## Relevant files

- `packages/dashboard/src/data/runnerControls.ts` — `usePauseRun` / `useResumeRun`.
- `packages/dashboard/src/components/ResumeModal.tsx` — optional steer-message modal.
- `packages/dashboard/src/components/runner/ProcessRow.tsx` — row controls.
- `packages/dashboard/src/components/runner/LiveProcessList.tsx` — prop threading.
- `packages/dashboard/src/routes/RunnerPage.tsx` — wire the mutations.
- `packages/dashboard/src/components/DrawerHeader.tsx` — drawer-header parity.

## Decisions

- **Resume-with-message uses a modal, not an always-visible inline input.** One
  affordance handles both plain resume and message resume; the optional textarea
  keeps the common "just resume" case one click + Resume away, mirroring the
  Cancel AlertModal and the existing `FixPrModal` pattern. No Figma reference for
  the paused controls (the fast-follow was designed-for, not drawn in CREW-247),
  so the affordance follows the DS `Modal`/`Button`/`Badge` idioms.
- **`message` vs `resume` kind chosen by message presence.** CREW-272 ships them
  as one apply path that always forwards `payload.message`; sending `message` only
  when a steer is typed keeps the wire intent honest without a separate UI toggle.
- **Pause has no confirm; Cancel keeps its confirm + escalation.** Pause is
  non-destructive and resumable, so it enqueues immediately. The row/drawer
  reconciles to `paused` from the next heartbeat snapshot (no optimistic state),
  matching how cancel/reap reconcile.
- **Drawer reads `useRunnerStatus()` to detect paused.** `paused` is not a
  persistent run-state (it reduces to `idle`); the live-process snapshot is the
  only place the `paused` label exists, so the drawer cross-references it by key.

## Out of scope

- The host apply paths (CREW-272) and the paused run-state (CREW-273) — Done.
- `dequeue` UI changes (unrelated).

## Notes

UI-only slice. No HTTP route/schema change → the runner command route + Bruno
coverage already exist (CREW-245); this slice only adds two command *kinds*
(`pause`/`resume`/`message`) the route already accepts via
`enqueueRunnerCommandSchema`. Visual fidelity: the paused/resume controls have no
Figma source (deferred fast-follow), so `visual-fidelity-check` findings against
them are expected medium/low — surfaced in the PR.
