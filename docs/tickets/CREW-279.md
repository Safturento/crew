# CREW-279 — Dashboard New Run ticket picker UI

Jira: https://safturento.atlassian.net/browse/CREW-279

## Goal

Replace the New Run modal's free-text ticket-key entry (step 2) with a searchable,
epic-grouped, dependency-aware Jira ticket picker, and add a Title row to the confirm
step (step 3). Degrade to the old manual ticket-key field when the daemon has no live
ticket list. Task 3 of the plan `docs/superpowers/plans/2026-06-23-new-run-ticket-picker.md`.

## Relevant files

- `packages/dashboard/src/data/DaemonClient.ts` — add `listProjectTickets(slug)` (+ surface `getProject` on the interface for the epic-link browse base).
- `packages/dashboard/src/data/HttpDaemonClient.ts` / `MockDaemonClient.ts` — implementations.
- `packages/dashboard/src/components/NewRunModal.tsx` — the picker.
- `packages/dashboard/src/components/ModalSelectionRow.tsx` — add `disabled` support.
- `packages/dashboard/src/App.tsx` — pass `client` to `NewRunModal`.

## Decisions

- **Priority badges are color-coded** (Figma `362:2212` authoritative): High→`error` (red),
  Medium→`waiting` (amber), Low→`initializing` (blue); running overlay→`running` (slate).
  Supersedes the plan sketch's single `finished` color.
- **Epic-key link browse base via the project-detail endpoint.** The frozen T1 contract
  (CREW-277, Done) has no browse-base field and T2 (CREW-278) — which the plan note says
  would add it — is not merged. The existing `getProject` route already exposes
  `project.jira.site`, so the modal derives `${site}/browse` from it. Adds `getProject` to
  the `DaemonClient` interface (already implemented on both clients).

## Open questions

- [ ] None blocking. Browse-base could later move onto the tickets response (T2) — the
      modal would switch source without UI change.

## Notes

- T1 (CREW-277, shared client + picker contract) is **merged**; T2 (CREW-278, daemon
  `GET /api/projects/:slug/tickets`) is **not merged** at build time. This worktree's
  live daemon therefore 404s the tickets route, so the live app degrades to manual entry.
  The picker UI is verified through the `MockDaemonClient` path; live end-to-end verification
  lands once T2 merges (the plan's stated merge order T1 → T2 → T3).
</content>
</invoke>
