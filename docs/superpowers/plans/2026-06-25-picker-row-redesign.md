# New Run picker — row redesign + interactive gating Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Disable `interactive`-labelled tickets in the New Run picker and replace the single-line ticket rows with a two-row, title-led layout that wraps long titles and shows status reasons in a tinted meta line.

**Architecture:** Two independent layers. (A) Data — the daemon derives an `interactive` flag from the Jira `interactive` label and adds it to the picker contract. (B) Frontend — `NewRunModal` renders a two-row `TicketRow` and folds `interactive` into the disabled/filter logic, plus modal width + scroll-cap tweaks. B consumes A.

**Tech Stack:** Zod (shared contract), Kysely/Fastify/Awilix (daemon), React + TanStack Query + Vitest/RTL (dashboard), Bruno (HTTP smoke), figma-snapshot visual-fidelity.

## Global Constraints

- Picker degraded response stays `{available:false, reason}` at HTTP 200 — never a 5xx. Do not touch this.
- One Jira search call only — `interactive` derives from `labels` returned by the existing `searchIssues`, no extra request.
- `interactive` is additive to `pickerTicketSchema`; existing fields (`runnable`, `blockedBy`, `hasActiveAgent`) are unchanged.
- Visual source of truth: Crew Figma snapshot — `NewRunStep2Content` `362:2212`, `TicketRow` `861:1134`, modal screen `1:3418` (refreshed on the redesign branch). The snapshot PR must be merged before Task B is dispatched.
- Reason precedence in the meta line: **blocked > interactive > running**.
- Tint tokens: blocked → `state/waiting` (amber); running → `state/running` (teal); interactive → `state/pr-open` (purple). Priority badge always shows priority only.

---

## Task A: Interactive-label gating (data layer)

**Files:**
- Modify: `packages/shared/src/jira/picker-tickets.ts` (add `interactive` to `pickerTicketSchema`)
- Test: `packages/shared/src/jira/picker-tickets.test.ts`
- Modify: `packages/daemon/src/services/TicketsService.ts:12` (`SEARCH_FIELDS`) and `toPickerTicket`
- Test: `packages/daemon/src/services/TicketsService.test.ts`
- Modify: `bruno/endpoints/projects/get-tickets.bru` (response shape doc/assertion)

**Interfaces:**
- Produces: `PickerTicket.interactive: boolean` — `true` when the issue carries the `interactive` Jira label. Consumed by Task B.

- [ ] **Step 1: Write the failing contract test**

In `packages/shared/src/jira/picker-tickets.test.ts`, add a case asserting `interactive` is required and boolean:

```ts
it('requires interactive on a picker ticket', () => {
  const base = { key: 'CREW-1', summary: 's', priority: null, runnable: true, blockedBy: [], hasActiveAgent: false };
  expect(pickerTicketSchema.safeParse(base).success).toBe(false); // interactive missing
  expect(pickerTicketSchema.safeParse({ ...base, interactive: true }).success).toBe(true);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test --workspace=crew-shared -- picker-tickets`
Expected: FAIL — the `{ ...base, interactive: true }` case parses today (unknown key stripped) but the missing-key case passes parse, so the first `expect(...).toBe(false)` fails.

- [ ] **Step 3: Add `interactive` to the schema**

In `packages/shared/src/jira/picker-tickets.ts`, inside `pickerTicketSchema`, after `hasActiveAgent`:

```ts
  /** true → carries the `interactive` Jira label; must be driven live, not via `crew run`. */
  interactive: z.boolean(),
```

- [ ] **Step 4: Run the contract test to verify it passes**

Run: `npm test --workspace=crew-shared -- picker-tickets`
Expected: PASS

- [ ] **Step 5: Write the failing service test**

In `packages/daemon/src/services/TicketsService.test.ts`, add (mirror the existing fixture style — a ticket with `fields.labels`):

```ts
it('flags interactive from the interactive label', async () => {
  const issue = makeIssue({ key: 'CREW-2', fields: { summary: 's', labels: ['interactive', 'frontend'] } });
  const res = await service.listProjectTickets(slug); // with searchIssues mocked to return [issue]
  const ticket = firstTicket(res);
  expect(ticket.interactive).toBe(true);
});

it('interactive is false when the label is absent', async () => {
  const issue = makeIssue({ key: 'CREW-3', fields: { summary: 's', labels: ['frontend'] } });
  const res = await service.listProjectTickets(slug);
  expect(firstTicket(res).interactive).toBe(false);
});
```

(Use the existing test's helpers/mocks; `makeIssue`/`firstTicket` names are illustrative — match the file's actual fixture builders.)

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test --workspace=crew-daemon -- TicketsService`
Expected: FAIL — `toPickerTicket` doesn't set `interactive` yet (and `labels` not requested).

- [ ] **Step 7: Fetch `labels` and derive `interactive`**

In `packages/daemon/src/services/TicketsService.ts`, line 12:

```ts
const SEARCH_FIELDS = ['summary', 'status', 'parent', 'issuetype', 'priority', 'issuelinks', 'labels'];
```

In `toPickerTicket`, in the returned object (alongside `hasActiveAgent`):

```ts
    interactive: (issue.fields.labels ?? []).includes('interactive'),
```

If the daemon-side `JiraIssue` type narrows `fields`, add `labels?: string[]` to it.

- [ ] **Step 8: Run the service tests to verify they pass**

Run: `npm test --workspace=crew-daemon -- TicketsService`
Expected: PASS

- [ ] **Step 9: Update Bruno**

In `bruno/endpoints/projects/get-tickets.bru`, add `interactive` to the documented/asserted response shape for a ticket. Then:

Run: `npm run bruno:smoke`
Expected: PASS (or the tickets endpoint returns `interactive` on each ticket).

- [ ] **Step 10: Commit**

```bash
git add packages/shared/src/jira/picker-tickets.ts packages/shared/src/jira/picker-tickets.test.ts \
        packages/daemon/src/services/TicketsService.ts packages/daemon/src/services/TicketsService.test.ts \
        bruno/endpoints/projects/get-tickets.bru
git commit -m "feat(picker): derive interactive flag from Jira label (Ticket A)"
```

---

## Task B: Two-row picker row redesign (frontend)

**Depends on Task A** (renders `t.interactive`).

**Files:**
- Create: `packages/dashboard/src/components/TicketRow.tsx`
- Test: `packages/dashboard/src/components/TicketRow.test.tsx`
- Modify: `packages/dashboard/src/components/NewRunModal.tsx` (use `TicketRow`; fold `interactive` into disabled + "Available only"; modal width + list scroll cap)
- Test: `packages/dashboard/src/components/NewRunModal.test.tsx`

**Interfaces:**
- Consumes: `PickerTicket` incl. `interactive: boolean` from Task A.
- Produces: `<TicketRow ticket onSelect />` — a two-row row; `disabled` derived internally as `!runnable || hasActiveAgent || interactive`.

- [ ] **Step 1: Write the failing TicketRow test**

In `packages/dashboard/src/components/TicketRow.test.tsx`:

```tsx
const base = { key: 'CREW-9', summary: 'A very long ticket summary that should wrap', priority: 'High', runnable: true, blockedBy: [], hasActiveAgent: false, interactive: false };

it('renders title and key', () => {
  render(<TicketRow ticket={base} onSelect={vi.fn()} />);
  expect(screen.getByText(base.summary)).toBeInTheDocument();
  expect(screen.getByText('CREW-9')).toBeInTheDocument();
});

it('disables and labels an interactive ticket, and does not call onSelect', () => {
  const onSelect = vi.fn();
  render(<TicketRow ticket={{ ...base, interactive: true }} onSelect={onSelect} />);
  expect(screen.getByText('interactive')).toBeInTheDocument();
  fireEvent.click(screen.getByText(base.summary));
  expect(onSelect).not.toHaveBeenCalled();
});

it('shows blocked reason with precedence over interactive', () => {
  render(<TicketRow ticket={{ ...base, runnable: false, interactive: true, blockedBy: [{ key: 'CREW-1', summary: 'x' }] }} onSelect={vi.fn()} />);
  expect(screen.getByText(/blocked by CREW-1/)).toBeInTheDocument();
  expect(screen.queryByText('interactive')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test --workspace=crew-dashboard -- TicketRow`
Expected: FAIL — `TicketRow` does not exist.

- [ ] **Step 3: Implement `TicketRow`**

Create `packages/dashboard/src/components/TicketRow.tsx`. Two-row, title-led; priority badge top-right; tinted reason in the meta line with precedence blocked > interactive > running. Match the Figma `TicketRow` (`861:1134`) — title `text-foreground font-semibold`, key `font-mono text-muted-foreground` with a `#` (Hash icon), reason tinted per state, row `opacity-50` + non-interactive when disabled.

```tsx
import { Hash } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { PickerTicket } from 'crew-shared';

const PRIORITY_COLOR: Record<string, string> = { High: 'error', Medium: 'waiting', Low: 'initializing' };

function reasonFor(t: PickerTicket): { text: string; className: string } | null {
  if (!t.runnable && t.blockedBy.length) return { text: `blocked by ${t.blockedBy.map((b) => b.key).join(', ')}`, className: 'text-state-waiting' };
  if (t.interactive) return { text: 'interactive', className: 'text-state-pr-open' };
  if (t.hasActiveAgent) return { text: 'running', className: 'text-state-running' };
  return null;
}

export function TicketRow({ ticket, onSelect }: { ticket: PickerTicket; onSelect: (t: PickerTicket) => void }) {
  const disabled = !ticket.runnable || ticket.hasActiveAgent || ticket.interactive;
  const reason = reasonFor(ticket);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={disabled ? undefined : () => onSelect(ticket)}
      className={`flex w-full items-start gap-3 rounded-md border border-border bg-card px-3.5 py-2.5 text-left ${disabled ? 'opacity-50 cursor-default' : 'hover:border-slate-600'}`}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold text-foreground">{ticket.summary}</span>
        <span className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Hash className="size-3" />{ticket.key}</span>
          {reason && <><span aria-hidden>·</span><span className={reason.className}>{reason.text}</span></>}
        </span>
      </div>
      {ticket.priority && (
        <Badge color={PRIORITY_COLOR[ticket.priority] ?? 'idle'} intensity="mid">{ticket.priority}</Badge>
      )}
    </button>
  );
}
```

(Confirm the `text-state-*` utility names and `Badge` color values against `index.css` / the existing `PRIORITY_COLOR` map in `NewRunModal.tsx` before finalising; reuse whatever the codebase already exposes.)

- [ ] **Step 4: Run the TicketRow tests to verify they pass**

Run: `npm test --workspace=crew-dashboard -- TicketRow`
Expected: PASS

- [ ] **Step 5: Write the failing NewRunModal integration test**

In `packages/dashboard/src/components/NewRunModal.test.tsx`, extend the existing ticket-list test:

```tsx
it('hides interactive tickets when Available only is on', async () => {
  // render with a tickets fixture containing one interactive ticket + the toggle on
  // expect the interactive ticket's summary not to be in the document
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npm test --workspace=crew-dashboard -- NewRunModal`
Expected: FAIL — the filter doesn't exclude `interactive` yet.

- [ ] **Step 7: Wire `TicketRow` + interactive into `NewRunModal`**

In `packages/dashboard/src/components/NewRunModal.tsx`:
- Replace the per-ticket `ModalSelectionRow` block with `<TicketRow ticket={t} onSelect={onSelect} />`.
- In the "Available only" filter predicate, add `|| t.interactive`:

```ts
if (availableOnly && (!t.runnable || t.hasActiveAgent || t.interactive)) return false;
```

- Apply the widened modal width and raised list scroll cap to match Figma (modal ~620; ticket list `max-h` raised so ~7 rows show before scroll). Match the existing modal/list class structure — adjust the width/`max-h` utilities, do not restructure the modal.

- [ ] **Step 8: Run the NewRunModal tests to verify they pass**

Run: `npm test --workspace=crew-dashboard -- NewRunModal`
Expected: PASS

- [ ] **Step 9: Lint + typecheck + full dashboard tests**

Run: `npm run lint && npm run typecheck && npm test --workspace=crew-dashboard`
Expected: PASS

- [ ] **Step 10: Visual fidelity**

Run the `visual-fidelity-check` skill against the New Run modal (rendered) vs the refreshed snapshot (`NewRunStep2Content` `362:2212`, screen `1:3418`). Resolve any diffs.

- [ ] **Step 11: Commit**

```bash
git add packages/dashboard/src/components/TicketRow.tsx packages/dashboard/src/components/TicketRow.test.tsx \
        packages/dashboard/src/components/NewRunModal.tsx packages/dashboard/src/components/NewRunModal.test.tsx
git commit -m "feat(picker): two-row TicketRow + interactive gating + widened modal (Ticket B)"
```

---

## Self-review notes

- **Spec coverage:** interactive data (Task A: schema + service + bruno), two-row layout (Task B: TicketRow), state rules incl. tinted reasons + precedence (Task B steps 1/3), disabled + Available-only gating (Task B steps 5/7), modal width + scroll cap (Task B step 7), visual fidelity (Task B step 10). Modal width was applied in Figma at the instance level; the code change is the dashboard modal/list utilities.
- **Type consistency:** `interactive: boolean` defined in Task A, consumed in Task B via `PickerTicket`. `reasonFor`/`PRIORITY_COLOR` are Task-B-local.
- **Open question (from spec):** reason precedence blocked > interactive > running is encoded in `reasonFor` and tested in Task B step 1.
