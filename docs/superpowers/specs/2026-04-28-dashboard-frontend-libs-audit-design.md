# Dashboard frontend-libraries audit & refactor — design

> **Purpose of this document.** A spec for auditing the existing crew dashboard against the `reaching-for-frontend-libraries` skill and refactoring the violations before further dashboard feature work. Captures the audit findings inline so the implementation plan can be written against a settled list of changes. Implementation breakdown is laid out below as an Epic + child tickets, but actual ticket creation in Jira happens in the next phase.
>
> Read [`docs/plans/architecture.md`](../../plans/architecture.md) first for system context. This spec assumes familiarity with the dashboard package's current shape (`packages/dashboard/`).

## 1. Goal & scope

The dashboard's foundation (CREW-11) was built before the `reaching-for-frontend-libraries` skill existed. It hand-rolls fetch orchestration, lacks an error boundary, and uses ad-hoc class concatenation for component variants — exactly the patterns the skill exists to prevent. This spec audits the current code against the skill, separates the findings into actionable refactors, and establishes which canonical libraries future feature work will reach for.

**In scope:**

- An audit of every dashboard source file against the skill's decision framework.
- Concrete refactors for current-code violations: server state, error boundary, component variants.
- A documented set of forward-looking library choices (toasts, modals, forms) so future feature tickets cite them rather than re-deciding.
- An Epic + child ticket breakdown with parallelism plan.
- Blocking semantics: refactor blocks new dashboard feature tickets, not the in-progress CREW-11.

**Out of scope (explicit non-goals):**

- Adopting Zustand or any cross-cutting client-state library. Current prop-threading is fine; revisit when route surface grows.
- Refactoring single-axis className ternaries (`NavTab`, `AgentRow` row-level attention styling). Below the cva threshold.
- Touching `useState` calls that hold pure UI primitives (`ProjectSection` collapsed toggle, `useHashRoute`). The skill explicitly does not target these.
- Visual redesign or layout changes. The audit is library-substitution only; dashboard styling stays as-is.
- Tests for new behavior beyond what the refactors themselves require. The component test surface stays at parity.
- Migrating away from the hash router. `useHashRoute` is small, scoped, and fine.

## 2. Audit methodology

Each `.tsx` / `.ts` file under `packages/dashboard/src/` was read against the skill's "Red flags — stop and reconsult this skill" list. A file generated a finding when it matched any of:

- `useState` + `useEffect` + `fetch()` orchestration.
- Custom `validate()` + form `useState`s.
- `try/catch` inside render or effects to recover from failed fetches.
- Two-or-more-axis className ternaries on `variant` / `size` / `state`.
- Copy-pasted components with one-prop-tweak differences.

Single-axis ternaries on a boolean (one `active`, one `attention`) were noted as **soft hits** and left alone — the skill's threshold is two variants, and inflating one-axis cases creates noise without payoff.

## 3. Audit findings

### A1. Server state hand-rolled — _critical_

**Location:** `packages/dashboard/src/App.tsx:17-30`

```tsx
const [projects, setProjects] = useState<Project[]>([]);
const [agents, setAgents] = useState<Agent[]>([]);

useEffect(() => {
  let cancelled = false;
  void Promise.all([client.listProjects(), client.listAgents()]).then(([p, a]) => {
    if (cancelled) return;
    setProjects(p);
    setAgents(a);
  });
  return () => {
    cancelled = true;
  };
}, [client]);
```

This is the canonical example from the skill's "Red flags" section, line for line. Beyond the pattern itself:

- **No loading state.** Empty array is indistinguishable from "not loaded yet."
- **No error handling.** A `Promise.all` rejection is silently swallowed.
- **No refetch.** When push events / polling land, this needs to be rebuilt.
- **No cache or dedupe.** Future detail views fetching the same data will re-fetch.

**Fix:** Adopt TanStack Query. Wrap `<App>` in `<QueryClientProvider>` from `main.tsx`. Replace the `useState` + `useEffect` pair with two `useQuery` calls keyed by `['projects']` and `['agents']`. Set `throwOnError: true` so failures hit an error boundary (paired with A2).

### A2. No error boundary — _critical companion to A1_

**Location:** application-wide; nothing in the tree catches anything.

With A1 fixed, async failures need somewhere to land. Without a boundary, a failed `useQuery` with `throwOnError` would crash the React tree.

**Fix:** Adopt `react-error-boundary`. Wrap the routed body (`<div className="flex-1 overflow-y-auto">{body}</div>` in `App.tsx:64`) in `<ErrorBoundary>` with a fallback that shows the failure and a retry action. The `useQueryErrorResetBoundary` integration from TanStack Query gives a clean reset path.

### A3. Variant component with two axes — _clear violation_

**Location:** `packages/dashboard/src/components/StateBadge.tsx:13-39`

Two variant axes (`size`: 2 values × `intensity`: 3 values) handled via a `Record<StateSize, string>` plus a hand-written `classesForIntensity()` switch plus a manual `[…].join(' ')`. The skill's threshold for `cva` is two variants, and this is exactly the case the skill points to.

**Fix:** Replace `SIZE_CLASSES`, `classesForIntensity()`, and the array-join with a single `cva()` definition. Use compound variants where size and intensity interact. The `clsx` / `tailwind-merge` integration `cva` brings makes future style additions trivial.

### A4. Copy-paste variants in `QuickAction` — _clear violation_

**Location:** `packages/dashboard/src/components/AgentRow.tsx:60-109`

A five-branch switch where three branches (`pr_open`, `error`, `finished`) render near-identical secondary buttons differing only in label, and one (`waiting`) renders a primary button with a different background. Hits the skill's "copy-pasted component with one prop tweaked" red flag.

**Fix:** Define `<QuickActionButton>` with a `cva`-driven `variant` prop (`primary` | `secondary`). Drive the switch by a `Record<AgentState, { variant, label, kind: 'button' | 'link', onClick? } | null>` instead of returning JSX per branch. The default branch becomes `null` and renders nothing. Bundled into the same ticket as A3 since both adopt `cva` and touch tightly related code.

### A5. Dynamic Tailwind classes — _adjacent to A3/A4, bundled with A4_

**Locations:**

- `packages/dashboard/src/components/StateBadge.tsx:18-29` — `text-${colorVar}`, `bg-${colorVar}/10`, `border-${colorVar}/30`, etc.
- `packages/dashboard/src/components/AgentRow.tsx:39, 45` — `border-${meta.colorVar}/30`, `bg-${meta.colorVar}/10`, `bg-${meta.colorVar}`.
- `packages/dashboard/src/components/StateBadge.tsx:62, 71` — `bg-${colorVar}` inside `PulseDot` / `Dot`.

Tailwind v4's JIT compiler emits classes only for strings it can see statically. `text-${colorVar}` resolves at runtime, so any color not also referenced as a literal string elsewhere would render with no styling. The classes happen to render today only because the colors are also used as static literals (e.g. in `bg-state-waiting`); adding a new state color via `state-meta.ts` alone would fail silently.

This is not a "reach for a library" issue per se, but the natural fix lives inside the `cva` refactor — once `StateBadge` and `QuickAction` are built around `cva`, the per-state class strings become static literals indexed by state. Bundling A5 into the A3/A4 ticket avoids landing a `cva` adoption that still leaves the latent bug in place.

**Fix:** Inside the same refactor as A3 + A4, replace the dynamic-template approach with a static `Record<AgentState, { text, border, bg, ... }>` (typed against the literal class names) or `cva` compound variants over a closed state set. Either way, every emitted class becomes a static string Tailwind can see.

### Soft hits — noted, not refactored

| Location                                             | Pattern                                       | Why no refactor                                         |
| ---------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------- |
| `TopNav.tsx:60-81` (`NavTab`)                        | One `active` boolean → one ternary            | Single-axis, below cva threshold                        |
| `AgentRow.tsx:36-40` (row-level attention className) | One `meta.attention` boolean → one ternary    | Single-axis, and gets folded out as a side effect of A5 |
| `useAttention.ts:11-33`                              | `useState<Set>` + memos                       | Pure client UI primitive, no canonical lib applies      |
| `ProjectSection.tsx:14` (collapsed toggle)           | `useState(false)`                             | Pure UI primitive, `useState` is the right answer       |
| `useHashRoute.ts:5-13`                               | `useState` + `addEventListener('hashchange')` | Browser-event subscription, not server state            |

## 4. Library choices established for future work

These are not refactoring tickets. They are decisions documented now so future feature tickets cite this spec rather than re-deciding.

| When this lands…                                                                   | Use…                                                | Notes                                                                    |
| ---------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| Toast / notification feedback (Clear attention, Retry, success/failure of New Run) | `sonner`                                            | Install when first toast call site lands.                                |
| Modals / drawers / popovers (New Run modal, Agent Detail drawer)                   | Radix UI primitives                                 | Install per-primitive (`@radix-ui/react-dialog`, etc.) at the call site. |
| Form state + validation (New Run form)                                             | React Hook Form + Zod via `@hookform/resolvers/zod` | Validation schemas in Zod even for non-form validation.                  |
| Cross-route shared client state (only if prop-threading gets gnarly)               | Zustand                                             | **Defer.** Re-evaluate when the third route is added.                    |

The mapping reflects the skill's decision framework. Future feature tickets that hit one of these problems should reference this row directly in their description.

## 5. Refactor work breakdown

Each item below is one Jira ticket under the Tech Debt epic. Tickets are sized as a logical bundle of TDD-cycle work, matching the convention from `~/.claude/CLAUDE.md`.

### TD-1: Adopt TanStack Query + `react-error-boundary`

**Covers:** A1 + A2.

**Touches:**

- `packages/dashboard/package.json` — add `@tanstack/react-query`, `react-error-boundary`.
- `packages/dashboard/src/main.tsx` — wrap `<App />` in `<QueryClientProvider>`.
- `packages/dashboard/src/App.tsx` — replace `useState` + `useEffect` block (L17-30) with two `useQuery` calls; wrap routed body (L64) in `<ErrorBoundary>`.
- `packages/dashboard/src/data/` — likely no contract changes; `DaemonClient` interface already returns `Promise<...>`.
- New file: `packages/dashboard/src/components/ErrorFallback.tsx` — boundary fallback UI matching dashboard styling.
- `packages/dashboard/src/App.test.tsx` — update tests to provide a `QueryClient` in the test render wrapper. Add a test asserting the boundary renders on a rejected query.

**Acceptance criteria:**

- `useQuery` configured with `throwOnError: true` so async failures hit the boundary.
- Boundary fallback shows the error and a "Retry" affordance that calls `useQueryErrorResetBoundary`'s `reset()`.
- Existing tests pass; new test covers the error path.
- No `useState` + `useEffect` + fetch pair anywhere in the dashboard tree.

### TD-2: `cva` adoption + static state-color classes

**Covers:** A3 + A4 + A5 (bundled — landing `cva` without A5 would adopt the library but leave the latent Tailwind-JIT bug in place).

**Touches:**

- `packages/dashboard/package.json` — add `class-variance-authority`. (Optionally `clsx` and `tailwind-merge` if not already transitive; `cva` works without them but pairs well.)
- `packages/dashboard/src/components/StateBadge.tsx` — replace `SIZE_CLASSES` + `classesForIntensity()` + array-join with a single `cva()` definition. Replace dynamic `${colorVar}` template strings with a closed `Record<AgentState, …>` of static class strings.
- `packages/dashboard/src/components/AgentRow.tsx` — extract a `<QuickActionButton>` driven by `cva` with `primary` / `secondary` variants. Convert the five-branch `QuickAction` switch to a data-driven map. Remove the row-level dynamic `${meta.colorVar}` classes (folded out as a side effect of moving to a static color record).
- `packages/dashboard/src/components/AgentRow.test.tsx` (and any `StateBadge.test.tsx`) — verify variant rendering still works; ensure all `AgentState` values render with valid (non-empty) class strings.

**Acceptance criteria:**

- No Tailwind class name in the touched files depends on a runtime value. Every emitted class is a literal string Tailwind's JIT can see at build time. (cva variant _keys_ may interpolate; the _class strings_ the keys map to must be static.)
- All `AgentState` values render with the same color treatment they have today (visual parity).
- `cva` is the only place variant-class composition happens for `StateBadge` and `QuickActionButton`.
- Test added that iterates every `AgentState` and asserts the rendered `StateBadge` element has non-empty color classes.

## 6. Epic structure

> **Project-specific:** Epic and tickets live in the `CREW` Jira project. No "Tech debt" epic exists yet — this spec proposes creating it as part of the ticketing phase.

**New Epic:** `Tech debt`

- Description follows the convention that epic descriptions include the parallelism plan (phase table + recommended sequence + tradeoffs), not just the chat.
- This first refactor populates the epic with TD-1 and TD-2; future tech-debt work lands here too.

**Child tickets:**

- **TD-1** — Adopt TanStack Query + error boundary.
- **TD-2** — `cva` adoption + static state-color classes.

**Blocking semantics:**

- TD-1 and TD-2 do **not** block CREW-11 (which is effectively complete).
- TD-1 and TD-2 **do block** any new dashboard feature ticket created after this epic exists. New feature tickets get `is blocked by` links to both at creation time.
- TD-1 and TD-2 do not block each other (see §7).

## 7. Parallelism plan

| Phase        | Tickets    | Sequence                                              |
| ------------ | ---------- | ----------------------------------------------------- |
| 1 (parallel) | TD-1, TD-2 | Run concurrently — disjoint files, disjoint libraries |

**Why parallel works here:** TD-1 touches `main.tsx`, `App.tsx`, `App.test.tsx`, and adds `ErrorFallback.tsx`. TD-2 touches `StateBadge.tsx`, `AgentRow.tsx`, and their tests. Zero file overlap. The two `package.json` adds are mergeable as long as both PRs add to the `dependencies` section without other surrounding edits — if a conflict surfaces, the second-merging PR rebases trivially.

**Recommended sequence if running serially:** TD-1 first. The dashboard's biggest functional gap is "errors disappear silently"; landing the boundary first means by the time TD-2 lands, any `cva` migration regression surfaces visibly instead of as empty render.

**Tradeoff vs. a single bundled ticket:** A combined ticket would land both refactors in one PR but would mix server-state concerns with styling concerns and balloon the diff. Two tickets keep each PR's review focus narrow.

## 8. Verification

Per refactor, after merge:

- `npm run --workspace crew-dashboard typecheck` — passes.
- `npm run --workspace crew-dashboard test:run` — passes, including the new tests.
- `npm run --workspace crew-dashboard build` — passes; bundle size delta inspected for sanity (TanStack Query + `react-error-boundary` + `cva` together should add roughly 12-15 kB gzipped, dominated by Query).
- Manual spot-check: dashboard renders agents and projects from the mock client; toggling project collapse still works; clicking an agent row still routes to detail; favicon badge still updates; clearing attention still works.

For TD-1 specifically: temporarily make `MockDaemonClient.listAgents()` reject, reload the dashboard, confirm the error boundary renders with a retry affordance and that retry recovers when the rejection is removed.

For TD-2 specifically: render every `AgentState` in `StateBadge` (sm/md × muted/mid/loud) in a Storybook-like one-shot test or a manual route, and confirm visual parity with current main.

## 9. Forward path

When this refactor lands, the dashboard sits at the skill's recommended baseline. The forward path is:

1. **Future feature tickets cite §4.** Any ticket adding toasts uses `sonner`. Any ticket adding a modal uses Radix. Any ticket adding a form uses RHF + Zod.
2. **Re-audit before the next major dashboard initiative.** Especially if the route surface grows past three views, re-evaluate whether prop-threading still beats Zustand.
3. **Skill drift.** If `reaching-for-frontend-libraries` updates (e.g. swaps a recommended lib), this spec gets revisited as part of the change.
