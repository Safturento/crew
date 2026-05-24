# CREW-191 — Assistant tokens in TokensByTool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Assistant" aggregate row to the daemon's `tokens_by_tool` builder summing `output_tokens` across assistant events. TokensByTool renders the new row with a `lucide/sparkles` icon, always sorted first.

**Architecture:** Daemon-side aggregation extension + frontend icon/sort handling. No DB schema change (`tokens_by_tool` is computed at query time).

**Tech Stack:** Daemon = Fastify + Kysely. Frontend = React 19 + Tailwind v4 + lucide-react. No new deps.

**Spec:** [`docs/superpowers/specs/2026-05-23-crew-191-assistant-tokens-design.md`](../specs/2026-05-23-crew-191-assistant-tokens-design.md)
**Ticket:** [CREW-191](https://safturento.atlassian.net/browse/CREW-191) (Epic [CREW-189](https://safturento.atlassian.net/browse/CREW-189), blocks [CREW-195](https://safturento.atlassian.net/browse/CREW-195))

---

## Pre-work: locate the existing aggregator

Before Task 1, run:

```bash
grep -rn "tokens_by_tool\|tokensByTool" packages/daemon/src --include='*.ts' | grep -vE "test|\.d\.ts"
```

Find the function that builds the `tokens_by_tool` array on agent detail responses. Typical location: `packages/daemon/src/services/AgentsService.ts` or `packages/daemon/src/transcripts/aggregations.ts`. Note the function signature, return shape, and where assistant tokens are currently handled (or NOT handled, which is the gap).

**Critical inspection:** check whether the existing tool-row aggregator includes `output_tokens` of the message that contained the tool_use call. If yes, the Assistant row will double-count those tokens. Fix forward in Task 1 by either (a) switching tool rows to count invocations only, or (b) attributing message output only to the Assistant row and giving tool rows token-share-based input numbers. Pick (a) if simpler.

Document the call site location for the rest of the plan.

---

## File Structure

| Action | Path | Responsibility |
|---|---|---|
| Modify | `packages/daemon/src/<aggregator-location>.ts` | Extend `tokens_by_tool` builder with Assistant row |
| Modify | `packages/daemon/src/<aggregator-location>.test.ts` | New test cases for Assistant row |
| Modify | `bruno/<existing-agent-detail-request>.bru` | Assert Assistant row in response |
| Modify | `packages/dashboard/src/components/TokensByTool.tsx` | Icon + sort handling |
| Modify | `packages/dashboard/src/components/TokensByTool.test.tsx` | Rendering tests |

---

## Task 1: Daemon — add Assistant row to `tokens_by_tool`

**Files:**
- Modify: daemon aggregator (located in pre-work)
- Modify: daemon aggregator test

- [ ] **Step 1: Write the failing daemon tests**

Add to the aggregator's test file (placeholder path — adjust per pre-work):

```ts
describe('tokens_by_tool aggregator', () => {
  it('includes an Assistant row summing output_tokens across assistant events', () => {
    const events = [
      makeAssistantEvent({ outputTokens: 100 }),
      makeAssistantEvent({ outputTokens: 200, toolUses: [{ name: 'Bash' }] }),
      makeAssistantEvent({ outputTokens: 50 }),
    ];
    const result = buildTokensByTool(events);
    const assistant = result.find((r) => r.tool === 'Assistant');
    expect(assistant).toBeDefined();
    expect(assistant!.tokens).toBe(350);
  });

  it('omits the Assistant row when no assistant events have output_tokens', () => {
    const events = [makeAssistantEvent({ outputTokens: 0 })];
    const result = buildTokensByTool(events);
    expect(result.find((r) => r.tool === 'Assistant')).toBeUndefined();
  });

  it('tool rows still appear alongside the Assistant row', () => {
    const events = [
      makeAssistantEvent({ outputTokens: 100, toolUses: [{ name: 'Bash' }, { name: 'Edit' }] }),
    ];
    const result = buildTokensByTool(events);
    expect(result.find((r) => r.tool === 'Bash')).toBeDefined();
    expect(result.find((r) => r.tool === 'Edit')).toBeDefined();
    expect(result.find((r) => r.tool === 'Assistant')).toBeDefined();
  });

  it('treats null/undefined output_tokens as 0', () => {
    const events = [
      makeAssistantEvent({ outputTokens: null as unknown as number }),
      makeAssistantEvent({ outputTokens: 100 }),
    ];
    const result = buildTokensByTool(events);
    expect(result.find((r) => r.tool === 'Assistant')?.tokens).toBe(100);
  });
});
```

(Adapt `makeAssistantEvent` to whatever fixture helper the daemon tests use.)

- [ ] **Step 2: Run to verify fails**

```bash
npm run test:run --workspace=crew-daemon -- <aggregator file>
```

Expected: FAIL — no Assistant row in current implementation.

- [ ] **Step 3: Implement Assistant aggregation**

In the aggregator function, after the existing tool-row aggregation loop, add:

```ts
const assistantTokens = events.reduce((sum, e) => {
  if (e.type !== 'assistant') return sum;
  return sum + (e.message?.usage?.output_tokens ?? 0);
}, 0);

if (assistantTokens > 0) {
  result.unshift({ tool: 'Assistant', tokens: assistantTokens });
}
```

(Adjust shape/syntax to the actual aggregator's idiom — Kysely query results, transcript-walker callback, etc.)

**If pre-work surfaced a double-counting bug**, fix it in this same task: switch tool-row aggregation to count invocations only, so the Assistant row owns the full output-token attribution.

- [ ] **Step 4: Re-run tests**

```bash
npm run test:run --workspace=crew-daemon -- <aggregator file>
```

Expected: PASS (4 new tests + all existing daemon tests).

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/<aggregator location>
git commit -m "feat(daemon): tokens_by_tool includes Assistant row (CREW-191)

Aggregator sums output_tokens across assistant events into a synthetic
\"Assistant\" entry, prepended to the existing tool rows. Omitted when
the sum is 0 so empty-history fixtures keep the panel tight."
```

---

## Task 2: Bruno — assert Assistant row in agent detail response

**Files:**
- Modify: existing agent-detail Bruno request (likely `bruno/agents/get-agent.bru`)

- [ ] **Step 1: Run smoke against the current daemon**

```bash
npm run bruno:smoke
```

Should pass; baseline.

- [ ] **Step 2: Add the assertion**

In the relevant `.bru` file:

```javascript
test("agent detail tokens_by_tool includes Assistant row for CREW-102", () => {
  const data = res.getBody();
  const assistant = data.tokens_by_tool?.find((r) => r.tool === 'Assistant');
  expect(assistant).to.exist;
  expect(assistant.tokens).to.be.above(0);
});
```

- [ ] **Step 3: Run smoke**

```bash
npm run bruno:smoke
```

Expected: PASS (new assertion green against the daemon's updated aggregator).

- [ ] **Step 4: Commit**

```bash
git add bruno/
git commit -m "test(bruno): assert tokens_by_tool includes Assistant row (CREW-191)"
```

---

## Task 3: Frontend — sparkles icon + always-first sort in TokensByTool

**Files:**
- Modify: `packages/dashboard/src/components/TokensByTool.tsx`
- Modify: `packages/dashboard/src/components/TokensByTool.test.tsx`

- [ ] **Step 1: Write the failing frontend tests**

Add to `TokensByTool.test.tsx`:

```tsx
import { Sparkles } from 'lucide-react';
// (vi.fn() / setup imports as needed)

it('renders an Assistant row with a sparkles icon when present in tokens_by_tool', () => {
  const tokensByTool = [
    { tool: 'Bash', tokens: 4000 },
    { tool: 'Assistant', tokens: 12000 },
    { tool: 'Edit', tokens: 2000 },
  ];
  render(<TokensByTool tokensByTool={tokensByTool} />);
  const assistantRow = screen.getByText('Assistant').closest('[data-testid="tokens-by-tool-row"]');
  expect(assistantRow).not.toBeNull();
  // Icon presence: sparkles renders as an SVG with the lucide-sparkles class signature
  expect(assistantRow!.querySelector('svg')).not.toBeNull();
});

it('always sorts the Assistant row first regardless of token count', () => {
  const tokensByTool = [
    { tool: 'Bash', tokens: 999_000 },     // huge
    { tool: 'Assistant', tokens: 100 },    // tiny — would normally be last
    { tool: 'Edit', tokens: 50_000 },
  ];
  render(<TokensByTool tokensByTool={tokensByTool} />);
  const rows = screen.getAllByTestId('tokens-by-tool-row');
  expect(rows[0]).toHaveTextContent('Assistant');
});

it('does not render Assistant icon for tool rows', () => {
  const tokensByTool = [{ tool: 'Bash', tokens: 4000 }];
  render(<TokensByTool tokensByTool={tokensByTool} />);
  const bashRow = screen.getByText('Bash').closest('[data-testid="tokens-by-tool-row"]');
  // Bash currently has no icon either; this assertion just confirms tool rows
  // don't get the sparkles by accident
  const svgs = bashRow!.querySelectorAll('svg');
  // Acceptable: 0 (no icons today) or whatever the tool icon is — but NOT sparkles
  for (const svg of svgs) {
    expect(svg.classList.contains('lucide-sparkles')).toBe(false);
  }
});
```

(If tool rows already have icons via a mapping, adapt: introduce a single `iconForTool('Assistant')` mapping returning `<Sparkles />` and assert via that.)

- [ ] **Step 2: Run to verify fails**

```bash
npm run test:run --workspace=crew-dashboard -- TokensByTool
```

Expected: FAIL — no Assistant icon, sort order matches the array (Bash first).

- [ ] **Step 3: Implement icon + sort**

In `TokensByTool.tsx`:

```tsx
import { Sparkles } from 'lucide-react';
// (existing imports)

const ASSISTANT_TOOL = 'Assistant';

function iconForTool(tool: string): ReactNode | null {
  if (tool === ASSISTANT_TOOL) return <Sparkles aria-hidden className="size-3.5" />;
  return null;
}

// In the existing rendering pass, before sorting:
const sortedRows = useMemo(() => {
  const assistant = aliasedRows.find((r) => r.alias === ASSISTANT_TOOL);
  const rest = aliasedRows
    .filter((r) => r.alias !== ASSISTANT_TOOL)
    .sort((a, b) => b.tokens - a.tokens);
  return assistant ? [assistant, ...rest] : rest;
}, [aliasedRows]);

// In each row's JSX, prepend the icon:
<div data-testid="tokens-by-tool-row" /* existing classes */>
  {iconForTool(row.alias)}
  <span>{row.alias}</span>
  {/* existing bar + tokens */}
</div>
```

(Adapt `aliasedRows` to the variable name used post `aggregateByAlias` — TokensByTool currently runs that aliasing per CREW-187.)

- [ ] **Step 4: Re-run tests**

```bash
npm run test:run --workspace=crew-dashboard -- TokensByTool
```

Expected: PASS (3 new + all existing).

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/TokensByTool.tsx \
        packages/dashboard/src/components/TokensByTool.test.tsx
git commit -m "feat(dashboard): TokensByTool surfaces Assistant row with sparkles icon, always first (CREW-191)

Per-row iconForTool mapping (currently just Assistant → Sparkles).
Sort order is Assistant first, then tools by descending tokens —
predictable position regardless of token count."
```

---

## Task 4: Final verification

- [ ] **Step 1: Full suite**

```bash
npm run lint
npm run typecheck
npm run test:run
npm run bruno:smoke
```

Expected: all green across workspaces.

- [ ] **Step 2: Visual smoke**

Open the dashboard, navigate to CREW-102 drawer. TokensByTool panel should show "Assistant" row first with the sparkles icon, followed by tool rows. Sum of all rows ≈ sum of per-row tokens visible in the timeline.

- [ ] **Step 3: Open PR**

```bash
gh pr create --title "feat(dashboard+daemon): surface Assistant tokens in TokensByTool (CREW-191)" --body "..."
```

PR body references spec + plan + Epic; flags that this unblocks F (CREW-195).

## Final checklist

- [ ] `npm run lint` green
- [ ] `npm run typecheck` green
- [ ] `npm run test:run` green (dashboard + daemon + shared)
- [ ] `npm run bruno:smoke` green (new Assistant-row assertion present)
- [ ] Manual smoke: panel total ≈ sum of visible timeline row tokens
