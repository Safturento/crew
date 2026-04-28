# Dashboard Frontend-Libraries Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `packages/dashboard/` to match the `reaching-for-frontend-libraries` skill: replace the hand-rolled `useState + useEffect + fetch` pattern with TanStack Query + `react-error-boundary` (TD-1), and replace the manual className-composition patterns with `cva` while eliminating runtime-interpolated Tailwind classes (TD-2). Visual parity preserved; existing tests must continue to pass.

**Architecture:** TD-1 wraps `<App>` in `<QueryClientProvider>`, replaces App.tsx's data-loading effect with two `useQuery` calls keyed by `['projects']` and `['agents']`, and wraps the routed body in `<ErrorBoundary>` with a fallback that integrates with `useQueryErrorResetBoundary`. TD-2 introduces a `STATE_CLASSES` record in `state-meta.ts` that holds per-state literal Tailwind class strings, refactors `StateBadge` and a new extracted `QuickActionButton` to use `cva`, and updates `AgentRow` row-level styling to read literals from `STATE_CLASSES` instead of interpolating `colorVar`.

**Tech Stack:** Adds `@tanstack/react-query` (~v5), `react-error-boundary` (~v4), `class-variance-authority` (~v0.7) to existing React 19 + Vite + Vitest + RTL stack.

**Inputs to this plan:**

- The settled spec at [`docs/superpowers/specs/2026-04-28-dashboard-frontend-libs-audit-design.md`](../specs/2026-04-28-dashboard-frontend-libs-audit-design.md)
- The original dashboard plan at [`docs/superpowers/plans/2026-04-26-dashboard-foundation-and-agents-list.md`](2026-04-26-dashboard-foundation-and-agents-list.md) — for established patterns

**Out of scope (will be subsequent work, not in this plan):**

- Adopting `sonner`, Radix UI, or RHF + Zod — these are documented choices for *future feature tickets*, not this refactor.
- Adopting Zustand for cross-route state. Deferred per spec §4.
- Refactoring single-axis className ternaries (`NavTab`, `useAttention`).
- Adding new tests beyond what each refactor needs to maintain coverage and verify the new behavior (error boundary path; static-class verification).
- Visual changes. Every assertion of "works correctly" includes "looks identical to current main."

---

## File structure

```
packages/dashboard/
├── package.json                              # MODIFY: add 3 deps
├── src/
│   ├── main.tsx                              # MODIFY: wrap in QueryClientProvider
│   ├── App.tsx                               # MODIFY: useQuery + ErrorBoundary
│   ├── App.test.tsx                          # MODIFY: render via test util; add boundary test
│   ├── components/
│   │   ├── ErrorFallback.tsx                 # CREATE
│   │   ├── ErrorFallback.test.tsx            # CREATE
│   │   ├── StateBadge.tsx                    # MODIFY: cva + STATE_CLASSES
│   │   ├── StateBadge.test.tsx               # MODIFY: add static-class assertion
│   │   └── AgentRow.tsx                      # MODIFY: extract QuickActionButton + STATE_CLASSES
│   ├── data/
│   │   └── state-meta.ts                     # MODIFY: add STATE_CLASSES record
│   └── test/
│       ├── setup.ts                          # (no change)
│       └── renderWithProviders.tsx           # CREATE: test render helper with QueryClient
```

---

## Phase A — TD-1: TanStack Query + Error Boundary

**Maps to ticket:** TD-1 (per spec §5).

**Why this phase exists:** App.tsx today silently swallows fetch failures. Phase A makes async errors visible and gives the dashboard a real refetch primitive before the daemon goes from in-memory mock to real HTTP.

### Task A1: Install dependencies

**Files:**
- Modify: `packages/dashboard/package.json` — add `@tanstack/react-query`, `react-error-boundary` to `dependencies`.

- [ ] **Step 1: Add dependencies**

```bash
npm install --workspace crew-dashboard @tanstack/react-query@^5 react-error-boundary@^4
```

- [ ] **Step 2: Verify install**

```bash
npm ls --workspace crew-dashboard @tanstack/react-query react-error-boundary
```

Expected: both packages resolved at the requested major.

- [ ] **Step 3: Run baseline checks**

```bash
npm run --workspace crew-dashboard typecheck
npm run --workspace crew-dashboard test:run
```

Expected: both pass on the unmodified source (deps installed, code unchanged).

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/package.json package-lock.json
git commit -m "chore(dashboard): add @tanstack/react-query and react-error-boundary"
```

---

### Task A2: Add a test-render helper that provides a QueryClient

**Files:**
- Create: `packages/dashboard/src/test/renderWithProviders.tsx`

The existing tests call `render(<App ... />)` directly. Once App.tsx uses `useQuery`, every test needs a `QueryClient`. Build the helper first so subsequent tests can use it.

- [ ] **Step 1: Create the helper**

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';

export function makeTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
      },
      mutations: { retry: false },
    },
  });
}

export function renderWithProviders(
  ui: ReactElement,
  options: RenderOptions & { queryClient?: QueryClient } = {},
): RenderResult & { queryClient: QueryClient } {
  const { queryClient = makeTestQueryClient(), ...rest } = options;

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { ...render(ui, { wrapper: Wrapper, ...rest }), queryClient };
}
```

- [ ] **Step 2: Run typecheck**

```bash
npm run --workspace crew-dashboard typecheck
```

Expected: PASS. The helper is unused so it shouldn't break anything; this just confirms the imports resolve.

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/test/renderWithProviders.tsx
git commit -m "test(dashboard): add renderWithProviders helper with QueryClient"
```

---

### Task A3: Create the ErrorFallback component (TDD)

**Files:**
- Create: `packages/dashboard/src/components/ErrorFallback.tsx`
- Create: `packages/dashboard/src/components/ErrorFallback.test.tsx`

`ErrorFallback` is what `<ErrorBoundary>` renders when something throws. It receives the error from `react-error-boundary` and a reset callback. Visual style matches the existing placeholder cards (dashed-bordered surface with a heading and a button).

- [ ] **Step 1: Write the failing test**

```tsx
// packages/dashboard/src/components/ErrorFallback.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ErrorFallback } from './ErrorFallback.js';

describe('ErrorFallback', () => {
  it('renders the error message', () => {
    render(<ErrorFallback error={new Error('daemon unreachable')} resetErrorBoundary={() => {}} />);
    expect(screen.getByText(/daemon unreachable/)).toBeInTheDocument();
  });

  it('calls resetErrorBoundary when the retry button is clicked', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<ErrorFallback error={new Error('boom')} resetErrorBoundary={reset} />);
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('exposes role="alert" so assistive tech announces it', () => {
    render(<ErrorFallback error={new Error('boom')} resetErrorBoundary={() => {}} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm run --workspace crew-dashboard test:run -- ErrorFallback
```

Expected: FAIL — `Cannot find module './ErrorFallback.js'`.

- [ ] **Step 3: Implement ErrorFallback**

```tsx
// packages/dashboard/src/components/ErrorFallback.tsx
import type { FallbackProps } from 'react-error-boundary';

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 p-6">
      <div role="alert" className="rounded-[14px] border border-state-error/40 bg-state-error/10 px-6 py-8">
        <p className="font-mono text-xs text-state-error">DASHBOARD ERROR</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-text">Something went wrong</p>
        <p className="mt-3 break-words text-sm text-text-2">{message}</p>
        <button
          type="button"
          onClick={resetErrorBoundary}
          className="mt-5 rounded-md border border-white/10 bg-surface-2 px-3 py-1.5 text-xs font-medium text-text hover:opacity-90"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npm run --workspace crew-dashboard test:run -- ErrorFallback
```

Expected: 3 PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/ErrorFallback.tsx packages/dashboard/src/components/ErrorFallback.test.tsx
git commit -m "feat(dashboard): add ErrorFallback component for error boundary"
```

---

### Task A4: Wire QueryClientProvider at the app root

**Files:**
- Modify: `packages/dashboard/src/main.tsx`

Production build needs a real `QueryClient` at the root. App.tsx will start using `useQuery` in Task A5, so this wiring lands first to keep the tree consistent.

- [ ] **Step 1: Update main.tsx**

Replace the current `createRoot(...).render(...)` block. Keep all existing imports and the `rootEl` check; just wrap `<App />` with `<QueryClientProvider>`.

```tsx
// packages/dashboard/src/main.tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/hanken-grotesk/700.css';
import '@fontsource/fira-code/400.css';
import '@fontsource/fira-code/500.css';

import './index.css';
import { App } from './App';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Missing #root element in index.html');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      throwOnError: true,
      staleTime: 5_000,
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(rootEl).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 2: Run typecheck**

```bash
npm run --workspace crew-dashboard typecheck
```

Expected: PASS.

- [ ] **Step 3: Run the full test suite**

```bash
npm run --workspace crew-dashboard test:run
```

Expected: PASS — main.tsx isn't exercised by tests, App.tsx still uses its old `useState`/`useEffect` pattern.

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/main.tsx
git commit -m "feat(dashboard): mount QueryClientProvider at app root"
```

---

### Task A5: Replace App's useState/useEffect block with useQuery (TDD)

**Files:**
- Modify: `packages/dashboard/src/App.tsx`
- Modify: `packages/dashboard/src/App.test.tsx`

Existing App tests already assert that `kanban-api` and `KAN-31` render — those become the green test for the `useQuery` path. We update App.test.tsx to use `renderWithProviders` *first*, watch the existing assertions go red (because App still has its old data-loading code that doesn't read from React Query yet), then switch App to `useQuery`.

- [ ] **Step 1: Update App.test.tsx to use renderWithProviders**

```tsx
// packages/dashboard/src/App.test.tsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { App } from './App.js';
import { MockDaemonClient } from './data/MockDaemonClient.js';
import type { Agent, Project } from './data/types.js';
import { renderWithProviders } from './test/renderWithProviders.js';

const projects: Project[] = [{ name: 'kanban-api', repoPath: '~/code/kanban-api' }];

const agents: Agent[] = [
  {
    key: 'KAN-31',
    projectName: 'kanban-api',
    ticketTitle: 'Add board archival',
    state: 'waiting',
    startedAt: '2026-04-26T13:00:00Z',
    tokens: 1_000,
  },
];

function renderApp() {
  const client = new MockDaemonClient({ projects, agents });
  return renderWithProviders(<App client={client} />);
}

beforeEach(() => {
  window.location.hash = '';
});

describe('App', () => {
  it('renders the agents list with mock data', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText('kanban-api')).toBeInTheDocument());
    expect(screen.getByText('KAN-31')).toBeInTheDocument();
  });

  it('shows attention count for waiting/pr_open/error agents', async () => {
    renderApp();
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
  });

  it('clears the attention count when Clear attention is clicked', async () => {
    const user = userEvent.setup();
    renderApp();
    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /Clear attention/ }));
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('navigates to the agent detail placeholder when a row is clicked', async () => {
    const user = userEvent.setup();
    renderApp();
    await waitFor(() => screen.getByText('KAN-31'));
    await user.click(screen.getByRole('button', { name: /KAN-31/ }));
    expect(window.location.hash).toBe('#/agents/KAN-31');
    expect(
      await screen.findByText(/agent detail drawer ships in a follow-up plan/i),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to confirm it still passes (helper is a no-op for old App)**

```bash
npm run --workspace crew-dashboard test:run -- App.test
```

Expected: 4 PASS. The provider wraps but the old App doesn't use React Query yet, so behavior is unchanged.

- [ ] **Step 3: Replace App.tsx data-loading code with useQuery**

```tsx
// packages/dashboard/src/App.tsx
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAttention } from './attention/useAttention.js';
import { useFaviconBadge } from './attention/useFaviconBadge.js';
import { AgentDetailPlaceholder } from './components/AgentDetailPlaceholder.js';
import { AgentsList } from './components/AgentsList.js';
import { TopNav } from './components/TopNav.js';
import { ViewportFrame } from './components/ViewportFrame.js';
import type { DaemonClient } from './data/DaemonClient.js';
import { MockDaemonClient } from './data/MockDaemonClient.js';
import { navigate, useHashRoute } from './routing/useHashRoute.js';

const defaultClient: DaemonClient = new MockDaemonClient();

export function App({ client = defaultClient }: { client?: DaemonClient } = {}) {
  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => client.listProjects(),
  });
  const agentsQuery = useQuery({
    queryKey: ['agents'],
    queryFn: () => client.listAgents(),
  });

  const projects = projectsQuery.data ?? [];
  const agents = agentsQuery.data ?? [];

  const route = useHashRoute();
  const attention = useAttention(agents);
  useFaviconBadge(attention.count);

  const body = useMemo(() => {
    switch (route.kind) {
      case 'agent-detail':
        return <AgentDetailPlaceholder agentKey={route.key} />;
      case 'projects':
        return <ProjectsPlaceholder />;
      case 'agents-list':
      default:
        return (
          <AgentsList
            projects={projects}
            agents={agents}
            onSelectAgent={(key) => navigate(`/agents/${key}`)}
          />
        );
    }
  }, [route, projects, agents]);

  return (
    <ViewportFrame>
      <TopNav
        route={route}
        attentionCount={attention.count}
        onClearAttention={attention.clear}
        onNewRun={() => {
          /* New Run modal lands in a future plan */
        }}
      />
      <div className="flex-1 overflow-y-auto">{body}</div>
    </ViewportFrame>
  );
}

function ProjectsPlaceholder() {
  return (
    <div className="mx-auto w-full max-w-[1240px] p-6">
      <div className="rounded-[14px] border border-white/10 bg-surface px-6 py-8">
        <p className="font-mono text-xs text-text-3">PROJECTS</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-text">Projects</p>
        <p className="mt-3 text-sm text-text-2">The projects route ships in a follow-up plan.</p>
      </div>
    </div>
  );
}
```

Note that `Agent` and `Project` type imports are gone from App.tsx — the queries return them but App doesn't manipulate them, the children consume them.

- [ ] **Step 4: Run App tests**

```bash
npm run --workspace crew-dashboard test:run -- App.test
```

Expected: 4 PASS (same assertions, now reading via React Query).

- [ ] **Step 5: Run typecheck**

```bash
npm run --workspace crew-dashboard typecheck
```

Expected: PASS.

- [ ] **Step 6: Run the full test suite**

```bash
npm run --workspace crew-dashboard test:run
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/dashboard/src/App.tsx packages/dashboard/src/App.test.tsx
git commit -m "refactor(dashboard): replace App fetch effect with useQuery"
```

---

### Task A6: Wrap App body in ErrorBoundary + add boundary test (TDD)

**Files:**
- Modify: `packages/dashboard/src/App.tsx`
- Modify: `packages/dashboard/src/App.test.tsx`

`throwOnError: true` is set globally in main.tsx (Task A4). The boundary needs to live *inside* `<App>` so the fallback renders inside the viewport frame and so tests can exercise it without mounting `main.tsx`.

- [ ] **Step 1: Write the failing test**

Append to `App.test.tsx`:

```tsx
// (additional imports at top of file)
import { QueryClient } from '@tanstack/react-query';

// (new test inside describe('App'))
it('renders the error fallback when a query rejects', async () => {
  const failingClient: DaemonClient = {
    listProjects: () => Promise.reject(new Error('daemon unreachable')),
    listAgents: () => Promise.reject(new Error('daemon unreachable')),
  };
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, throwOnError: true } },
  });

  renderWithProviders(<App client={failingClient} />, { queryClient });

  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByText(/daemon unreachable/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
});
```

You'll also need to import `DaemonClient` at the top:

```tsx
import type { DaemonClient } from './data/DaemonClient.js';
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm run --workspace crew-dashboard test:run -- App.test
```

Expected: the new test FAILS — without a boundary, the rejected query crashes the test render. The other 4 tests still pass.

- [ ] **Step 3: Wrap the routed body in ErrorBoundary in App.tsx**

Add an import:

```tsx
import { ErrorBoundary } from 'react-error-boundary';
import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { ErrorFallback } from './components/ErrorFallback.js';
```

Replace the return block in `App` to wrap the routed body:

```tsx
  const { reset } = useQueryErrorResetBoundary();

  return (
    <ViewportFrame>
      <TopNav
        route={route}
        attentionCount={attention.count}
        onClearAttention={attention.clear}
        onNewRun={() => {
          /* New Run modal lands in a future plan */
        }}
      />
      <div className="flex-1 overflow-y-auto">
        <ErrorBoundary FallbackComponent={ErrorFallback} onReset={reset}>
          {body}
        </ErrorBoundary>
      </div>
    </ViewportFrame>
  );
```

Note: `useQueryErrorResetBoundary` is called from App's body (it's a hook). The `onReset` integration ensures clicking Retry resets the query cache so the queries refetch.

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npm run --workspace crew-dashboard test:run -- App.test
```

Expected: 5 PASS.

- [ ] **Step 5: Run the full test suite**

```bash
npm run --workspace crew-dashboard test:run
```

Expected: all PASS.

- [ ] **Step 6: Run typecheck and build**

```bash
npm run --workspace crew-dashboard typecheck
npm run --workspace crew-dashboard build
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/dashboard/src/App.tsx packages/dashboard/src/App.test.tsx
git commit -m "feat(dashboard): wrap routed body in ErrorBoundary"
```

---

### Phase A verification

- [ ] **Step 1: Manual smoke against the running dev server**

```bash
npm run --workspace crew-dashboard dev
```

In the browser:
- Confirm agents list renders with the mock fixtures.
- Confirm clicking an agent row routes to the detail placeholder.
- Confirm Clear attention works.

- [ ] **Step 2: Manual error-path smoke**

Temporarily edit `MockDaemonClient.listAgents` to `throw new Error('boom')`. Reload. Expected: ErrorFallback renders with "boom" and a Retry button. Click Retry, then revert the edit, then click Retry again — agents list re-appears.

- [ ] **Step 3: Revert the temporary edit**

```bash
git checkout -- packages/dashboard/src/data/MockDaemonClient.ts
```

(Confirm with `git status` that no stray changes remain.)

**Phase A done.** TD-1 ticket can be closed at this point.

---

## Phase B — TD-2: cva + static state-color classes

**Maps to ticket:** TD-2 (per spec §5).

**Why this phase exists:** `StateBadge` and `AgentRow` build Tailwind class names by interpolating `${colorVar}` at runtime. Tailwind v4's JIT can't see those — they only render today because the colors are also referenced as literals elsewhere. Adding a new `AgentState` would silently produce an unstyled badge. Phase B switches every state-coloring class to a literal Tailwind token, and adopts `cva` for the `size`/`intensity`/`variant` axes that earned a manual switch + array-join today.

### Task B1: Install cva

**Files:**
- Modify: `packages/dashboard/package.json`

- [ ] **Step 1: Add the dependency**

```bash
npm install --workspace crew-dashboard class-variance-authority@^0.7
```

- [ ] **Step 2: Verify install**

```bash
npm ls --workspace crew-dashboard class-variance-authority
```

Expected: resolved at v0.7.x.

- [ ] **Step 3: Run baseline checks**

```bash
npm run --workspace crew-dashboard typecheck
npm run --workspace crew-dashboard test:run
```

Expected: both PASS (lib installed but unused).

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/package.json package-lock.json
git commit -m "chore(dashboard): add class-variance-authority"
```

---

### Task B2: Add STATE_CLASSES record to state-meta.ts (TDD)

**Files:**
- Modify: `packages/dashboard/src/data/state-meta.ts`
- Create: `packages/dashboard/src/data/state-meta.test.ts`

`STATE_CLASSES` holds per-state literal Tailwind tokens. Every `AgentState` must produce non-empty class strings and the strings must be Tailwind class names the JIT can see. The test pins this contract.

- [ ] **Step 1: Write the failing test**

```ts
// packages/dashboard/src/data/state-meta.test.ts
import { describe, expect, it } from 'vitest';

import { STATE_CLASSES } from './state-meta.js';
import type { AgentState } from './types.js';

const ALL_STATES: AgentState[] = [
  'initializing',
  'running',
  'idle',
  'waiting',
  'pr_open',
  'error',
  'finished',
];

const TOKEN_KEYS = ['text', 'borderSolid', 'border30', 'border40', 'bg', 'bg10'] as const;

describe('STATE_CLASSES', () => {
  it.each(ALL_STATES)('has non-empty class tokens for %s', (state) => {
    const tokens = STATE_CLASSES[state];
    for (const key of TOKEN_KEYS) {
      expect(tokens[key], `${state}.${key}`).toMatch(/^\S+$/);
    }
  });

  it.each(ALL_STATES)('uses literal class names (no template-string interpolation) for %s', (state) => {
    const tokens = STATE_CLASSES[state];
    for (const key of TOKEN_KEYS) {
      expect(tokens[key], `${state}.${key}`).not.toMatch(/[$\\{}]/);
    }
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm run --workspace crew-dashboard test:run -- state-meta
```

Expected: FAIL — `STATE_CLASSES` is not exported from state-meta.ts yet.

- [ ] **Step 3: Add STATE_CLASSES to state-meta.ts**

Append to `packages/dashboard/src/data/state-meta.ts` (do not remove existing `STATE_META` or `sortAgentsByPriority`):

```ts
export interface StateClassTokens {
  text: string;
  borderSolid: string;
  border30: string;
  border40: string;
  bg: string;
  bg10: string;
}

export const STATE_CLASSES: Record<AgentState, StateClassTokens> = {
  initializing: {
    text: 'text-state-initializing',
    borderSolid: 'border-state-initializing',
    border30: 'border-state-initializing/30',
    border40: 'border-state-initializing/40',
    bg: 'bg-state-initializing',
    bg10: 'bg-state-initializing/10',
  },
  running: {
    text: 'text-state-running',
    borderSolid: 'border-state-running',
    border30: 'border-state-running/30',
    border40: 'border-state-running/40',
    bg: 'bg-state-running',
    bg10: 'bg-state-running/10',
  },
  idle: {
    text: 'text-state-idle',
    borderSolid: 'border-state-idle',
    border30: 'border-state-idle/30',
    border40: 'border-state-idle/40',
    bg: 'bg-state-idle',
    bg10: 'bg-state-idle/10',
  },
  waiting: {
    text: 'text-state-waiting',
    borderSolid: 'border-state-waiting',
    border30: 'border-state-waiting/30',
    border40: 'border-state-waiting/40',
    bg: 'bg-state-waiting',
    bg10: 'bg-state-waiting/10',
  },
  pr_open: {
    text: 'text-state-pr-open',
    borderSolid: 'border-state-pr-open',
    border30: 'border-state-pr-open/30',
    border40: 'border-state-pr-open/40',
    bg: 'bg-state-pr-open',
    bg10: 'bg-state-pr-open/10',
  },
  error: {
    text: 'text-state-error',
    borderSolid: 'border-state-error',
    border30: 'border-state-error/30',
    border40: 'border-state-error/40',
    bg: 'bg-state-error',
    bg10: 'bg-state-error/10',
  },
  finished: {
    text: 'text-state-finished',
    borderSolid: 'border-state-finished',
    border30: 'border-state-finished/30',
    border40: 'border-state-finished/40',
    bg: 'bg-state-finished',
    bg10: 'bg-state-finished/10',
  },
};
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
npm run --workspace crew-dashboard test:run -- state-meta
```

Expected: PASS (14 assertions across 7 states × 2 cases).

- [ ] **Step 5: Run typecheck**

```bash
npm run --workspace crew-dashboard typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/data/state-meta.ts packages/dashboard/src/data/state-meta.test.ts
git commit -m "feat(dashboard): add STATE_CLASSES with literal Tailwind tokens"
```

---

### Task B3: Refactor StateBadge to cva + STATE_CLASSES

**Files:**
- Modify: `packages/dashboard/src/components/StateBadge.tsx`
- Modify: `packages/dashboard/src/components/StateBadge.test.tsx`

The existing StateBadge tests cover label rendering, default intensity, requested intensity, and the active/static dot. Add one new assertion: the rendered element's className contains the expected per-state literal token. That pins the static-class contract at the component level too.

- [ ] **Step 1: Add a static-class assertion to StateBadge.test.tsx**

Append a new test inside the existing `describe('StateBadge', ...)` block:

```tsx
import type { AgentState } from '../data/types.js';

const STATES_AND_TOKENS: Array<[AgentState, string]> = [
  ['waiting', 'state-waiting'],
  ['running', 'state-running'],
  ['error', 'state-error'],
  ['pr_open', 'state-pr-open'],
  ['finished', 'state-finished'],
  ['initializing', 'state-initializing'],
  ['idle', 'state-idle'],
];

it.each(STATES_AND_TOKENS)('emits literal Tailwind tokens for %s', (state, token) => {
  render(<StateBadge state={state} />);
  const badge = screen.getByRole('status');
  expect(badge.className).toContain(token);
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm run --workspace crew-dashboard test:run -- StateBadge
```

Expected: the new `it.each` cases pass for the states whose color is *also* used elsewhere as a literal, **but the test design here works against either pre- or post-refactor source** — the post-refactor source produces literal tokens, and the pre-refactor source produces the same string at runtime via `text-${colorVar}`. We're not testing the JIT-visibility property at runtime (jsdom doesn't run Tailwind), we're testing the substring presence. So expect: PASS.

This step exists to lock the contract before refactoring. Subsequent edits must keep this test green.

- [ ] **Step 3: Refactor StateBadge.tsx**

```tsx
// packages/dashboard/src/components/StateBadge.tsx
import { cva } from 'class-variance-authority';

import type { AgentState } from '../data/types.js';
import { STATE_CLASSES, STATE_META, type StateClassTokens } from '../data/state-meta.js';

export type StateIntensity = 'muted' | 'mid' | 'loud';
export type StateSize = 'sm' | 'md';

interface StateBadgeProps {
  state: AgentState;
  intensity?: StateIntensity;
  size?: StateSize;
}

const ALL_STATES: AgentState[] = [
  'initializing',
  'running',
  'idle',
  'waiting',
  'pr_open',
  'error',
  'finished',
];

const INTENSITY_TEMPLATES: Record<StateIntensity, (c: StateClassTokens) => string> = {
  muted: (c) => `${c.text} border ${c.border40} bg-transparent`,
  mid: (c) => `${c.text} border ${c.border30} ${c.bg10}`,
  loud: (c) => `text-slate-950 border ${c.borderSolid} ${c.bg}`,
};

const stateBadge = cva(
  'inline-flex items-center gap-1.5 rounded-full font-mono leading-none whitespace-nowrap',
  {
    variants: {
      size: {
        sm: 'h-[18px] px-1.5 text-[10px]',
        md: 'h-[22px] px-2 text-[11px]',
      },
      state: {
        initializing: '',
        running: '',
        idle: '',
        waiting: '',
        pr_open: '',
        error: '',
        finished: '',
      },
      intensity: {
        muted: '',
        mid: '',
        loud: '',
      },
    },
    compoundVariants: ALL_STATES.flatMap((state) =>
      (Object.keys(INTENSITY_TEMPLATES) as StateIntensity[]).map((intensity) => ({
        state,
        intensity,
        class: INTENSITY_TEMPLATES[intensity](STATE_CLASSES[state]),
      })),
    ),
    defaultVariants: { size: 'md', intensity: 'mid' },
  },
);

const stateDot = cva('inline-block h-1.5 w-1.5 rounded-full', {
  variants: {
    state: {
      initializing: STATE_CLASSES.initializing.bg,
      running: STATE_CLASSES.running.bg,
      idle: STATE_CLASSES.idle.bg,
      waiting: STATE_CLASSES.waiting.bg,
      pr_open: STATE_CLASSES.pr_open.bg,
      error: STATE_CLASSES.error.bg,
      finished: STATE_CLASSES.finished.bg,
    },
    pulse: { true: 'animate-pulse-dot' },
  },
});

const ACTIVE_STATES = new Set<AgentState>(['running', 'initializing']);

export function StateBadge({ state, intensity = 'mid', size = 'md' }: StateBadgeProps) {
  const meta = STATE_META[state];
  const pulse = ACTIVE_STATES.has(state);
  return (
    <span
      role="status"
      aria-label={meta.label}
      data-intensity={intensity}
      data-state={state}
      className={stateBadge({ state, intensity, size })}
    >
      <span
        data-testid={pulse ? 'state-badge-pulse' : 'state-badge-dot'}
        className={stateDot({ state, pulse })}
        aria-hidden
      />
      {meta.label}
    </span>
  );
}
```

Key changes vs. the previous StateBadge:
- Removed `SIZE_CLASSES` record + `classesForIntensity` helper.
- All variant-class composition for the badge body lives inside one `cva` definition. `compoundVariants` covers the 7 (state) × 3 (intensity) = 21 combinations, generated mechanically from `STATE_CLASSES` + `INTENSITY_TEMPLATES` so per-state colors stay sourced from `state-meta.ts`.
- The two helpers `PulseDot` and `Dot` collapse into a single inline `<span>` whose className comes from a second `cva` (`stateDot`) with `state` and `pulse` axes.
- The `data-testid` value (`state-badge-pulse` vs `state-badge-dot`) is preserved so the existing tests in `StateBadge.test.tsx` continue to pass without modification.
- Every Tailwind class string is a literal in source — either inside `STATE_CLASSES`, inside `INTENSITY_TEMPLATES` as composed-from-literals, or inside the cva base/variant definitions. No `${colorVar}`-style runtime interpolation anywhere.

- [ ] **Step 4: Run StateBadge tests**

```bash
npm run --workspace crew-dashboard test:run -- StateBadge
```

Expected: all PASS (existing 6 + 7 new state-token cases).

- [ ] **Step 5: Run typecheck**

```bash
npm run --workspace crew-dashboard typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/components/StateBadge.tsx packages/dashboard/src/components/StateBadge.test.tsx
git commit -m "refactor(dashboard): StateBadge uses cva + STATE_CLASSES"
```

---

### Task B4: Extract QuickActionButton with cva and convert QuickAction to a data-driven map

**Files:**
- Modify: `packages/dashboard/src/components/AgentRow.tsx`
- Modify: `packages/dashboard/src/components/AgentRow.test.tsx`

`QuickAction` today is a five-branch switch where three branches render structurally identical buttons. Extract a `QuickActionButton` whose styling comes from `cva`, then collapse the switch into a `describeQuickAction(agent)` returning a small descriptor.

The existing AgentRow tests cover: ticket/title/runtime/tokens render, state badge, "Answer" for waiting, "View PR" for pr_open, no quick action for running, onSelect on row click, onSelect *not* fired on action click, onSelect not fired on Enter on the action, and the `data-attention` attribute. All of those must keep passing.

- [ ] **Step 1: Add a test for "Retry" and "Archive" labels (currently uncovered)**

Append to the existing `describe('AgentRow', ...)` block in `AgentRow.test.tsx`:

```tsx
it('renders a "Retry" quick action for error state', () => {
  render(<AgentRow agent={{ ...baseAgent, state: 'error' }} onSelect={() => {}} />);
  expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
});

it('renders an "Archive" quick action for finished state', () => {
  render(<AgentRow agent={{ ...baseAgent, state: 'finished' }} onSelect={() => {}} />);
  expect(screen.getByRole('button', { name: 'Archive' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run AgentRow tests**

```bash
npm run --workspace crew-dashboard test:run -- AgentRow
```

Expected: PASS (the existing implementation already handles these states; the tests just pin them so the refactor is safe).

- [ ] **Step 3: Refactor AgentRow.tsx**

```tsx
// packages/dashboard/src/components/AgentRow.tsx
import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import { cva } from 'class-variance-authority';

import type { Agent, AgentState } from '../data/types.js';
import { STATE_CLASSES, STATE_META } from '../data/state-meta.js';
import { StateBadge } from './StateBadge.js';
import { formatDuration } from '../format/duration.js';
import { formatTokens } from '../format/tokens.js';

interface AgentRowProps {
  agent: Agent;
  onSelect: (key: string) => void;
}

const ACTIVE_STATES = new Set<AgentState>(['running', 'initializing']);

const quickActionButton = cva(
  'rounded-md border px-3 py-1.5 text-xs font-medium',
  {
    variants: {
      variant: {
        primary: 'border-white/10 bg-state-waiting text-slate-950 hover:opacity-90',
        secondary: 'border-white/10 text-text hover:bg-surface-2',
      },
    },
    defaultVariants: { variant: 'secondary' },
  },
);

type QuickActionDescriptor =
  | { kind: 'button'; label: string; variant: 'primary' | 'secondary' }
  | { kind: 'link'; label: string; variant: 'primary' | 'secondary'; href: string }
  | null;

function describeQuickAction(agent: Agent): QuickActionDescriptor {
  switch (agent.state) {
    case 'waiting':
      return { kind: 'button', label: 'Answer', variant: 'primary' };
    case 'pr_open':
      return { kind: 'link', label: 'View PR ↗', variant: 'secondary', href: agent.prUrl ?? '#' };
    case 'error':
      return { kind: 'button', label: 'Retry', variant: 'secondary' };
    case 'finished':
      return { kind: 'button', label: 'Archive', variant: 'secondary' };
    default:
      return null;
  }
}

export function AgentRow({ agent, onSelect }: AgentRowProps) {
  const runtime = useLiveRuntime(agent.startedAt, ACTIVE_STATES.has(agent.state));
  const meta = STATE_META[agent.state];
  const stateClasses = STATE_CLASSES[agent.state];
  const attentionAttr = meta.attention ? agent.state : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${agent.key} — ${agent.ticketTitle}`}
      data-attention={attentionAttr}
      onClick={() => onSelect(agent.key)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(agent.key);
        }
      }}
      className={[
        'group relative grid cursor-pointer items-center gap-4 rounded-[10px] border bg-surface px-4 py-3 transition-colors hover:bg-surface-2',
        'grid-cols-[100px_90px_1fr_90px_70px_auto]',
        meta.attention ? `${stateClasses.border30} ${stateClasses.bg10}` : 'border-white/10',
      ].join(' ')}
    >
      {meta.attention && (
        <span
          aria-hidden
          className={`absolute inset-y-1.5 left-0 w-[3px] rounded-full ${stateClasses.bg} animate-att-pulse`}
        />
      )}
      <StateBadge state={agent.state} />
      <span className="font-mono text-xs text-text-2">{agent.key}</span>
      <span className="truncate text-[13.5px] text-text">{agent.ticketTitle}</span>
      <span className="text-right font-mono text-xs tabular-nums text-text-2">{runtime}</span>
      <span className="text-right font-mono text-xs tabular-nums text-text-2">
        {formatTokens(agent.tokens)}
      </span>
      <QuickAction agent={agent} />
    </div>
  );
}

function QuickAction({ agent }: { agent: Agent }) {
  const action = describeQuickAction(agent);
  if (action === null) return <span aria-hidden />;
  const stop = (e: MouseEvent) => e.stopPropagation();
  if (action.kind === 'link') {
    return (
      <a
        href={action.href}
        target="_blank"
        rel="noreferrer"
        onClick={stop}
        className={quickActionButton({ variant: action.variant })}
      >
        {action.label}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={stop}
      className={quickActionButton({ variant: action.variant })}
    >
      {action.label}
    </button>
  );
}

function useLiveRuntime(startedAt: string, live: boolean): string {
  const start = new Date(startedAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [live]);
  return formatDuration(now - start);
}
```

Key changes vs. the previous AgentRow:
- Row className now reads `STATE_CLASSES[agent.state].border30` / `.bg10` (literal tokens) instead of `border-${meta.colorVar}/30 bg-${meta.colorVar}/10`.
- Attention bar reads `STATE_CLASSES[agent.state].bg` (literal) instead of `bg-${meta.colorVar}`.
- `QuickAction` switch returns a descriptor; `QuickActionButton` shell rendered once per kind (`button` or `link`) with `cva`-driven variant classes.
- `useLiveRuntime` hook unchanged.

- [ ] **Step 4: Run AgentRow tests**

```bash
npm run --workspace crew-dashboard test:run -- AgentRow
```

Expected: all PASS (existing 9 + 2 new).

- [ ] **Step 5: Run the full test suite**

```bash
npm run --workspace crew-dashboard test:run
```

Expected: all PASS — `AgentsList`, `ProjectSection`, `TopNav`, `App`, `StateBadge`, `state-meta`, `ErrorFallback` all green.

- [ ] **Step 6: Run typecheck and build**

```bash
npm run --workspace crew-dashboard typecheck
npm run --workspace crew-dashboard build
```

Expected: both PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/dashboard/src/components/AgentRow.tsx packages/dashboard/src/components/AgentRow.test.tsx
git commit -m "refactor(dashboard): cva-based QuickActionButton + literal state classes in AgentRow"
```

---

### Phase B verification

- [ ] **Step 1: Visual parity sweep against the running dev server**

```bash
npm run --workspace crew-dashboard dev
```

In the browser, compare against a `git stash`-ed baseline (or screenshot from main):
- StateBadge for every state in the fixtures: same colors, same dot, same text.
- AgentRow for `waiting` (with attention bar), `pr_open`, `error`, `finished`: same row tint, same quick action.
- Hover state on rows: same.

- [ ] **Step 2: Spot-check the built bundle**

```bash
npm run --workspace crew-dashboard build
```

Inspect the printed bundle size. The three new dependencies (`@tanstack/react-query`, `react-error-boundary`, `class-variance-authority`) should add ~12-15 kB gzipped combined. Anything dramatically larger is a red flag.

**Phase B done.** TD-2 ticket can be closed at this point.

---

## Self-review checklist (run before declaring the plan ready)

- [ ] Every requirement in spec §3 (audit findings A1-A5) has at least one task that addresses it.
- [ ] Every acceptance criterion in spec §5 maps to a test that runs in the plan.
- [ ] No "TODO" / "TBD" / "implement later" / "handle edge cases" placeholder steps.
- [ ] Type / function names used in later tasks match earlier tasks (`STATE_CLASSES`, `intensityClasses`, `quickActionButton`, `describeQuickAction`, `renderWithProviders`, `makeTestQueryClient`).
- [ ] Every code-emitting step shows the actual code, not "see Task N".
- [ ] Every test step shows what the expected pass/fail outcome is.
- [ ] No commits batched — each logical change has its own commit step.
