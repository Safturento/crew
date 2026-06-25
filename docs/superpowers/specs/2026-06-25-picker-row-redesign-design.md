# New Run ticket picker — row redesign + interactive gating

**Status:** design approved (in-session, 2026-06-25), ready for planning
**Builds on:** [2026-06-23 New Run ticket picker](./2026-06-23-new-run-ticket-picker-design.md) (Epic CREW-276, shipped — CREW-277/278/279)
**Figma:** Crew file `9FeJPriqdsdA4n9R5Xsrr8` — `TicketRow` component `861:1134`, `NewRunStep2Content` `362:2212`, states reference `870:1146`. Snapshot refreshed (commit on this branch).

## Context

The New Run ticket picker shipped via Epic CREW-276. Two refinements surfaced in use:

1. **Rows overflow with real titles.** The original `ModalSelectionRow` lays the key and summary out *side by side* on one line, with the `blocked by …` meta and priority badge crammed to the right. Long Jira summaries overflow the modal instead of wrapping, and the blocked-by text collides with the priority badge.
2. **Interactive tickets are runnable.** Tickets labelled `interactive` (work that must be driven live in-session, not via `crew run`) appear as normal, selectable rows. They should be disabled like blocked rows — a `crew` agent should not be able to pick them.

These are two cleanly separable changes: a **data-layer** change (derive an `interactive` flag) and a **visual** change (two-row row layout that renders all states, including interactive). The visual change has been designed and applied in Figma; this spec records the decisions and the implementation decomposition.

## Goals

- Long titles wrap gracefully instead of overflowing; status/reason never collides with the priority badge.
- `interactive`-labelled tickets render disabled (dimmed, non-selectable), with the reason visible.
- Consistent, scannable row anatomy across all states (runnable, blocked, running, interactive).
- No regression to grouping, search, the "Available only" toggle, or the degraded fallback.

## Design

### Row anatomy — `TicketRow` (title-led, two rows)

Modelled on `AgentRow`. Each row is:

```
┌──────────────────────────────────────────────┐
│ <Title — summary, bold, wraps>      [Priority] │   line 1: title (primary) + priority badge (top-right)
│ # <KEY>  ·  <reason>                            │   line 2: muted mono key + optional tinted reason
└──────────────────────────────────────────────┘
```

- **Title** is the bold primary (`Hanken Grotesk SemiBold 14`, `foreground`), `FILL` width, wraps.
- **Key** demotes to a muted mono meta line (`Fira Code 12`, `muted-foreground`) with a `#` glyph, AgentRow-style.
- **Priority badge** (`Pill type=tag`) is **always** top-right and shows *only* priority (High/Medium/Low). Status/category is never mixed into this slot.
- **Reason** (status/category) lives in the meta line, semantically tinted, and is shown only for non-runnable states.

### State rules

| State | Selectable | Opacity | Priority badge | Meta reason (tint) |
|---|---|---|---|---|
| runnable (default) | yes | 1.0 | priority | — |
| blocked | no | 0.5 | priority | `blocked by <KEY>` (`state/waiting`, amber) |
| running (active agent) | no | 0.5 | priority | `running` (`state/running`, teal) |
| interactive | no | 0.5 | priority | `interactive` (`state/pr-open`, purple) |

The driving principle (user decision): **the right badge is always priority; every status/category reason lives in the tinted meta line.** This applies to `running` too — it no longer hijacks the badge slot as in the shipped version.

### Modal sizing

- New Run modal widened **560 → 620** (rows ~576 wide), scoped to the New Run modal instances across all three wizard steps (not the shared `Modal` component, so confirmation/register modals are unaffected). All three modal instances re-centered (h + v) in their overlay.
- Ticket list (`Container`) scroll cap raised **320 → 440** so a typical Ready list shows in full; it scrolls only past ~7 rows.

### Data layer — `interactive` flag

The daemon already fetches each ticket in one Jira search call. Add `labels` to the fetched fields and derive `interactive`:

- `TicketsService` `SEARCH_FIELDS`: add `'labels'`.
- `toPickerTicket`: `interactive = (issue.fields.labels ?? []).includes('interactive')`.
- Contract (`packages/shared/src/jira/picker-tickets.ts`): add `interactive: z.boolean()` to `pickerTicketSchema`.

No extra network cost (same search call). `interactive` is independent of `runnable`/`blockedBy` — a ticket can be both blocked and interactive; the row renders the most relevant reason (see Open question below).

### Frontend — `NewRunModal`

- Render rows with the two-row `TicketRow` layout (title-led; key + tinted reason in the meta line).
- `disabled = !t.runnable || t.hasActiveAgent || t.interactive`.
- "Available only" filter also hides `t.interactive`.
- Reason precedence in the meta line: blocked > interactive > running (a blocked ticket shows its blocker; otherwise interactive; otherwise running).
- Apply the widened modal (620) + raised list scroll cap.

## Decomposition

Two tickets; **B blocked by A** (B renders the `interactive` flag A produces). A is pure data with no visual decisions, so it ships independently with nothing thrown away by the redesign.

- **Ticket A — interactive-label gating (data).** `labels` fetch + `interactive` derivation in `TicketsService`; `interactive` added to `pickerTicketSchema`; daemon + shared tests. No frontend. Bruno update for the `/tickets` response shape.
- **Ticket B — two-row picker row redesign (frontend).** Render `TicketRow` two-row layout in `NewRunModal`; fold `interactive` into `disabled` + "Available only"; widen modal to 620 + raise list scroll cap; consume A's flag. Validated by `visual-fidelity-check` against the refreshed snapshot (`NewRunStep2Content` `362:2212`, modal screen `1:3418`).

Both are `crew run` tickets. The Figma design + snapshot refresh (this branch) is the in-session front-half; the implementations are the autonomous back-half. **The snapshot PR must merge before Ticket B dispatches** (worktrees cut from origin/main).

## Testing

- **Shared:** `pickerTicketSchema` accepts/round-trips `interactive`.
- **Daemon:** `TicketsService` sets `interactive` from the `interactive` label; absent label → `false`; `labels` requested in the search.
- **Dashboard:** disabled rows (blocked / running / interactive) are non-selectable; "Available only" hides interactive; reason precedence renders the right tinted text; two-row layout wraps long titles.
- **Visual fidelity:** `visual-fidelity-check` against the refreshed snapshot.

## Alternatives considered

- **Key-led rows** (mono key as line 1, title wrapping below). Rejected — title-led matches AgentRow and reads better when scanning by what the ticket *is*; the key stays available in the meta line.
- **Status as a badge** (running/interactive swap the priority badge, as in the shipped version). Rejected per the user's principle — mixing priority and category in one slot is ambiguous; reasons belong in the meta line.
- **Generalised `disabledReason` enum** in the contract instead of a discrete `interactive: boolean`. Rejected (YAGNI) — `interactive` parallels the existing `runnable`/`hasActiveAgent` booleans; the dashboard already composes `disabled` from multiple booleans.

## Open questions

- **Blocked + interactive simultaneously.** Reason precedence is blocked > interactive > running. Confirm that's the desired priority (a blocked interactive ticket shows "blocked by …", not "interactive"). Low stakes — both disable the row.
