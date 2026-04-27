# Dashboard Foundation & Agents List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `packages/dashboard/` workspace as a Vite + React + TypeScript app with the design system, app shell, and agents-list view rendering against an in-memory mock daemon — no real daemon integration, no drawer/timeline, no new-run modal, no projects route.

**Architecture:** Dashboard is a single-page React app served by Vite in development. Routing is hash-based via a tiny custom hook (a real router gets introduced when we have multiple real routes — this plan only has one). The design system is implemented as Tailwind v4 `@theme` tokens that map the design hand-off's OKLCH/hex values to the closest stock Tailwind palette entries. Data flows from a `DaemonClient` interface; this plan ships only the `MockDaemonClient` that returns static fixtures, so a future plan can drop in the real HTTP/SSE client without touching components.

**Tech Stack:** React 19, Vite 6, TypeScript 6, Tailwind v4 (`@tailwindcss/vite` plugin), Vitest + React Testing Library + jsdom, lucide-react for icons, `@fontsource/hanken-grotesk` + `@fontsource/fira-code` for typography.

**Inputs to this plan:**

- The settled spec at `docs/superpowers/specs/2026-04-26-dashboard-ui-design.md`
- The visual hand-off at `docs/designs/design_handoff_crew_dashboard/` — its `README.md` is the reference for tokens, component anatomy, and behavior; the JSX in `source/` is reference-only and must not be shipped verbatim

**Out of scope (will be subsequent plans):**

- Agent detail drawer + full-page route (drawer/timeline/token-table/state-history)
- New Run modal (project picker → ticket picker → confirm)
- Projects route (list, TOML viewer, edit/register form)
- Real daemon HTTP API + SSE streaming
- Bundling the dashboard into the daemon's static serve
- Search input on rows / Live mode toggle on timeline (lives with the drawer)
- Keyboard shortcuts beyond the row's standard button semantics

---

## Design token mapping (locked decisions)

The hand-off uses raw hex/OKLCH values. This plan substitutes the closest stock Tailwind palette entries — per the user's direction, the design's exact values were placeholders.

**Surface tokens** (named so semantic intent survives any palette shift):

| Token | Tailwind reference | Rendered value | Use |
|---|---|---|---|
| `--color-canvas` | `--color-slate-900` | `#0f172a` | App page background (the area outside the viewport frame) |
| `--color-surface` | `--color-slate-800` | `#1e293b` | Viewport frame, rows, cards |
| `--color-surface-2` | `--color-slate-700` | `#334155` | Row hover, sticky headers |

**Text tokens:**

| Token | Tailwind reference | Use |
|---|---|---|
| `--color-text` | `--color-slate-100` | Default body |
| `--color-text-2` | `--color-slate-400` | Secondary (ticket key, runtime) |
| `--color-text-3` | `--color-slate-500` | Tertiary (section labels, dim mono) |
| `--color-dim` | `--color-slate-600` | Lowest contrast (placeholder, divider labels) |

**State palette** (Tailwind names; saturation tuned to -400 weight for default visibility):

| State | Token | Tailwind | Attention? |
|---|---|---|---|
| `initializing` | `--color-state-initializing` | `--color-sky-400` | no |
| `running` | `--color-state-running` | `--color-slate-200` | no |
| `idle` | `--color-state-idle` | `--color-slate-500` | no |
| `waiting` | `--color-state-waiting` | `--color-amber-400` | yes |
| `pr_open` | `--color-state-pr-open` | `--color-violet-400` | yes |
| `error` | `--color-state-error` | `--color-rose-400` | yes |
| `finished` | `--color-state-finished` | `--color-emerald-400` | no |

**Borders:** use Tailwind's stock `white/10` and `white/20` directly via utility classes, no semantic token needed.

**Fonts:**

- `--font-sans`: `"Hanken Grotesk", system-ui, sans-serif`
- `--font-mono`: `"Fira Code", ui-monospace, SFMono-Regular, monospace`

**Animations** (registered in `@theme`; built with Tailwind v4 keyframe registration, no animation library):

- `att-pulse`: 1.8s ease-in-out infinite, opacity 1↔0.4 — strong-attention left-edge marker
- `pulse-dot`: 1.6s infinite, opacity 1↔0.3 — live runtime indicator on active rows

---

## File structure

```
packages/dashboard/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── index.html
├── src/
│   ├── main.tsx                       — React mount, font imports, base CSS
│   ├── App.tsx                        — composes ViewportFrame + TopNav + AgentsList; reads route
│   ├── index.css                      — Tailwind import + @theme + global resets
│   ├── components/
│   │   ├── ViewportFrame.tsx          — outer dark surface frame
│   │   ├── TopNav.tsx                 — brand + tabs + Clear-attention + +New-Run buttons
│   │   ├── BrandMark.tsx              — logo SVG
│   │   ├── StateBadge.tsx             — 7 states × 3 intensities × 2 sizes + animated Pulse dot
│   │   ├── AgentRow.tsx               — the carded list row with attention treatments
│   │   ├── ProjectSection.tsx         — collapsible per-project group
│   │   ├── AgentsList.tsx             — groups + sorts agents into ProjectSections
│   │   └── AgentDetailPlaceholder.tsx — stub shown when route is /agents/:key (drawer comes later)
│   ├── data/
│   │   ├── types.ts                   — Agent, Project, AgentState
│   │   ├── state-meta.ts              — STATE_META: color, attention, label, sortRank
│   │   ├── DaemonClient.ts            — interface
│   │   ├── MockDaemonClient.ts        — returns static fixtures
│   │   └── fixtures.ts                — sample agents (covering all 7 states) + projects
│   ├── routing/
│   │   ├── parseRoute.ts              — pure: hash string → {kind, params}
│   │   └── useHashRoute.ts            — subscribes to hashchange
│   ├── attention/
│   │   ├── attention.ts               — pure: derive attention key set + count from agents
│   │   ├── useAttention.ts            — local dismissed-set state + count
│   │   └── useFaviconBadge.ts         — sets <link rel="icon"> based on count
│   ├── format/
│   │   ├── duration.ts                — "33m 04s", "1h 02m 14s"
│   │   └── tokens.ts                  — "48.2k", "1.2M"
│   └── test/
│       └── setup.ts                   — RTL + jest-dom setup
```

Co-located tests sit next to the file they exercise (`StateBadge.tsx` + `StateBadge.test.tsx`, etc.) per `CLAUDE.md`.

---

## Task 1: Scaffold dashboard package (Vite + React + TypeScript)

Set up `packages/dashboard/` as a buildable Vite + React + TS workspace package with a hello-world page. No styling, no Tailwind yet — that's Task 2.

**Files:**

- Modify: `packages/dashboard/package.json` (replaces the placeholder)
- Create: `packages/dashboard/tsconfig.json`
- Create: `packages/dashboard/vite.config.ts`
- Create: `packages/dashboard/index.html`
- Create: `packages/dashboard/src/main.tsx`
- Create: `packages/dashboard/src/App.tsx`

- [ ] **Step 1: Install runtime + build dependencies into the workspace**

```bash
npm install react@latest react-dom@latest --workspace=crew-dashboard
npm install --save-dev vite@latest @vitejs/plugin-react@latest @types/react@latest @types/react-dom@latest --workspace=crew-dashboard
```

- [ ] **Step 2: Replace the placeholder `package.json`**

Write `packages/dashboard/package.json`:

```json
{
  "name": "crew-dashboard",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "description": "Web UI for the crew daemon.",
  "scripts": {
    "dev": "vite",
    "build": "tsc -p tsconfig.json && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -p tsconfig.json",
    "test": "vitest",
    "test:run": "vitest run"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^5.0.0",
    "vite": "^6.0.0"
  }
}
```

(Pin the actual installed versions from Step 1; `npm install` will have written them — copy from there if they differ.)

- [ ] **Step 3: Write `tsconfig.json`**

Vite needs `module: "ESNext"` and `moduleResolution: "Bundler"` (the base config uses NodeNext, which doesn't work with bundlers). Also need DOM lib + `jsx: "react-jsx"`.

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "types": []
  },
  "include": ["src/**/*", "vite.config.ts", "vitest.config.ts"]
}
```

- [ ] **Step 4: Write `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
```

- [ ] **Step 5: Write `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>crew</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Write `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Write `src/App.tsx`**

```tsx
export function App() {
  return <div>crew dashboard</div>;
}
```

- [ ] **Step 8: Verify the package builds**

Run: `npm run build --workspace=crew-dashboard`
Expected: completes without errors; produces `packages/dashboard/dist/index.html` and a JS bundle.

- [ ] **Step 9: Verify lint + typecheck pass**

Run: `npm run lint && npm run typecheck`
Expected: both pass with no warnings or errors.

- [ ] **Step 10: Commit**

```bash
git add packages/dashboard/ package.json package-lock.json
git commit -m "feat(dashboard): scaffold Vite + React + TS workspace package"
```

---

## Task 2: Tailwind v4 with design tokens + fonts

Install Tailwind v4, configure `@theme` with the locked design tokens (surfaces, text, state palette, fonts, animations), wire `@fontsource` for Hanken Grotesk + Fira Code, and verify a styled element renders.

**Files:**

- Modify: `packages/dashboard/vite.config.ts`
- Create: `packages/dashboard/src/index.css`
- Modify: `packages/dashboard/src/main.tsx`
- Modify: `packages/dashboard/src/App.tsx`

- [ ] **Step 1: Install Tailwind, the Vite plugin, and font packages**

```bash
npm install --save-dev tailwindcss@latest @tailwindcss/vite@latest --workspace=crew-dashboard
npm install @fontsource/hanken-grotesk@latest @fontsource/fira-code@latest --workspace=crew-dashboard
```

- [ ] **Step 2: Add the Tailwind plugin to Vite**

Replace `packages/dashboard/vite.config.ts` with:

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
  },
});
```

- [ ] **Step 3: Write `src/index.css`** with Tailwind import, theme tokens, and global resets

```css
@import 'tailwindcss';

@theme {
  /* Surface tokens */
  --color-canvas: var(--color-slate-900);
  --color-surface: var(--color-slate-800);
  --color-surface-2: var(--color-slate-700);

  /* Text tokens */
  --color-text: var(--color-slate-100);
  --color-text-2: var(--color-slate-400);
  --color-text-3: var(--color-slate-500);
  --color-dim: var(--color-slate-600);

  /* State palette */
  --color-state-initializing: var(--color-sky-400);
  --color-state-running: var(--color-slate-200);
  --color-state-idle: var(--color-slate-500);
  --color-state-waiting: var(--color-amber-400);
  --color-state-pr-open: var(--color-violet-400);
  --color-state-error: var(--color-rose-400);
  --color-state-finished: var(--color-emerald-400);

  /* Typography */
  --font-sans: 'Hanken Grotesk', system-ui, sans-serif;
  --font-mono: 'Fira Code', ui-monospace, SFMono-Regular, monospace;

  /* Custom animations */
  --animate-att-pulse: att-pulse 1.8s ease-in-out infinite;
  --animate-pulse-dot: pulse-dot 1.6s ease-in-out infinite;
}

@keyframes att-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

@keyframes pulse-dot {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

html,
body,
#root {
  height: 100%;
}

body {
  margin: 0;
  background-color: var(--color-canvas);
  color: var(--color-text);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
```

- [ ] **Step 4: Wire fonts + CSS into `main.tsx`**

Replace `packages/dashboard/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/hanken-grotesk/400.css';
import '@fontsource/hanken-grotesk/500.css';
import '@fontsource/hanken-grotesk/600.css';
import '@fontsource/hanken-grotesk/700.css';
import '@fontsource/fira-code/400.css';
import '@fontsource/fira-code/500.css';
import './index.css';
import { App } from './App.js';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 5: Update `App.tsx` to demonstrate tokens render**

Replace `packages/dashboard/src/App.tsx`:

```tsx
export function App() {
  return (
    <div className="flex h-full items-center justify-center bg-canvas">
      <div className="rounded-lg border border-white/10 bg-surface px-6 py-4 font-mono text-state-waiting">
        crew dashboard — tokens loaded
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Verify the build still passes**

Run: `npm run build --workspace=crew-dashboard`
Expected: completes; bundle now includes a CSS file with the token utilities.

- [ ] **Step 7: Verify dev server renders the styled box**

Run: `npm run dev --workspace=crew-dashboard` in one shell, then in another:

```bash
curl -s http://localhost:5173/ | grep -q '<div id="root">' && echo OK
```

Expected: `OK`. Stop the dev server. (Visual verification of the actual box is part of the final task; here we just confirm the server is up.)

- [ ] **Step 8: Commit**

```bash
git add packages/dashboard/ package.json package-lock.json
git commit -m "feat(dashboard): add Tailwind v4 with design tokens and fonts"
```

---

## Task 3: Vitest + React Testing Library setup

Configure per-package Vitest with jsdom environment, install RTL, write a smoke test that renders the placeholder App.

**Files:**

- Create: `packages/dashboard/vitest.config.ts`
- Create: `packages/dashboard/src/test/setup.ts`
- Create: `packages/dashboard/src/App.test.tsx`

- [ ] **Step 1: Install testing dependencies**

```bash
npm install --save-dev jsdom@latest @testing-library/react@latest @testing-library/jest-dom@latest @testing-library/user-event@latest --workspace=crew-dashboard
```

- [ ] **Step 1b: Add `vitest/globals` to the dashboard's tsconfig types**

The tests use globals (`describe`, `it`, `expect`, `vi`, `beforeEach`) without import statements; TS needs to know they exist. Edit `packages/dashboard/tsconfig.json`, replacing `"types": []` with:

```json
"types": ["vitest/globals"]
```

- [ ] **Step 2: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
```

- [ ] **Step 3: Write `src/test/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Write the smoke test at `src/App.test.tsx`**

```tsx
import { render, screen } from '@testing-library/react';
import { App } from './App.js';

describe('App', () => {
  it('renders the placeholder copy', () => {
    render(<App />);
    expect(screen.getByText(/crew dashboard/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run the test**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: 1 test passes.

- [ ] **Step 6: Verify lint + typecheck still pass**

Run: `npm run lint && npm run typecheck`
Expected: both pass.

- [ ] **Step 7: Commit**

```bash
git add packages/dashboard/ package.json package-lock.json
git commit -m "feat(dashboard): set up Vitest + React Testing Library"
```

---

## Task 4: Domain types + STATE_META

Define `Agent`, `Project`, and `AgentState` types plus the `STATE_META` lookup that drives sort order, color naming, and attention classification across the whole UI.

**Files:**

- Create: `packages/dashboard/src/data/types.ts`
- Create: `packages/dashboard/src/data/state-meta.ts`
- Create: `packages/dashboard/src/data/state-meta.test.ts`

- [ ] **Step 1: Write `src/data/types.ts`**

```ts
export type AgentState =
  | 'initializing'
  | 'running'
  | 'idle'
  | 'waiting'
  | 'pr_open'
  | 'error'
  | 'finished';

export interface Project {
  name: string;
  repoPath: string;
}

export interface Agent {
  key: string;
  projectName: string;
  ticketTitle: string;
  state: AgentState;
  startedAt: string;
  tokens: number;
  prUrl?: string;
}
```

- [ ] **Step 2: Write the failing test at `src/data/state-meta.test.ts`**

```ts
import { STATE_META, sortAgentsByPriority } from './state-meta.js';
import type { Agent } from './types.js';

const agent = (key: string, state: Agent['state'], startedAt: string): Agent => ({
  key,
  projectName: 'p',
  ticketTitle: 't',
  state,
  startedAt,
  tokens: 0,
});

describe('STATE_META', () => {
  it('marks waiting, pr_open, and error as attention states', () => {
    expect(STATE_META.waiting.attention).toBe(true);
    expect(STATE_META.pr_open.attention).toBe(true);
    expect(STATE_META.error.attention).toBe(true);
  });

  it('marks running, initializing, idle, finished as non-attention', () => {
    expect(STATE_META.running.attention).toBe(false);
    expect(STATE_META.initializing.attention).toBe(false);
    expect(STATE_META.idle.attention).toBe(false);
    expect(STATE_META.finished.attention).toBe(false);
  });
});

describe('sortAgentsByPriority', () => {
  it('orders states: waiting > error > pr_open > running > initializing > idle > finished', () => {
    const agents: Agent[] = [
      agent('a', 'finished', '2026-04-26T10:00:00Z'),
      agent('b', 'idle', '2026-04-26T10:00:00Z'),
      agent('c', 'initializing', '2026-04-26T10:00:00Z'),
      agent('d', 'running', '2026-04-26T10:00:00Z'),
      agent('e', 'pr_open', '2026-04-26T10:00:00Z'),
      agent('f', 'error', '2026-04-26T10:00:00Z'),
      agent('g', 'waiting', '2026-04-26T10:00:00Z'),
    ];
    const sorted = sortAgentsByPriority(agents);
    expect(sorted.map((a) => a.key)).toEqual(['g', 'f', 'e', 'd', 'c', 'b', 'a']);
  });

  it('within the same state, orders by startedAt descending', () => {
    const agents: Agent[] = [
      agent('older', 'running', '2026-04-26T10:00:00Z'),
      agent('newer', 'running', '2026-04-26T11:00:00Z'),
      agent('middle', 'running', '2026-04-26T10:30:00Z'),
    ];
    const sorted = sortAgentsByPriority(agents);
    expect(sorted.map((a) => a.key)).toEqual(['newer', 'middle', 'older']);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: fails — `state-meta.js` does not exist.

- [ ] **Step 4: Implement `src/data/state-meta.ts`**

```ts
import type { Agent, AgentState } from './types.js';

export interface StateMetaEntry {
  label: string;
  colorVar: string;
  attention: boolean;
  sortRank: number;
}

export const STATE_META: Record<AgentState, StateMetaEntry> = {
  waiting: { label: 'Waiting', colorVar: 'state-waiting', attention: true, sortRank: 0 },
  error: { label: 'Error', colorVar: 'state-error', attention: true, sortRank: 1 },
  pr_open: { label: 'PR open', colorVar: 'state-pr-open', attention: true, sortRank: 2 },
  running: { label: 'Running', colorVar: 'state-running', attention: false, sortRank: 3 },
  initializing: {
    label: 'Initializing',
    colorVar: 'state-initializing',
    attention: false,
    sortRank: 4,
  },
  idle: { label: 'Idle', colorVar: 'state-idle', attention: false, sortRank: 5 },
  finished: { label: 'Finished', colorVar: 'state-finished', attention: false, sortRank: 6 },
};

export function sortAgentsByPriority(agents: Agent[]): Agent[] {
  return [...agents].sort((a, b) => {
    const rankDiff = STATE_META[a.state].sortRank - STATE_META[b.state].sortRank;
    if (rankDiff !== 0) return rankDiff;
    return b.startedAt.localeCompare(a.startedAt);
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: 4 tests pass (1 from App, 3 from state-meta).

- [ ] **Step 6: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/dashboard/src/data/
git commit -m "feat(dashboard): domain types + state metadata with priority sort"
```

---

## Task 5: Format helpers (duration, tokens)

Pure utilities for the row's runtime cell ("33m 04s") and token count cell ("48.2k"). TDD.

**Files:**

- Create: `packages/dashboard/src/format/duration.ts`
- Create: `packages/dashboard/src/format/duration.test.ts`
- Create: `packages/dashboard/src/format/tokens.ts`
- Create: `packages/dashboard/src/format/tokens.test.ts`

- [ ] **Step 1: Write the failing duration test at `src/format/duration.test.ts`**

```ts
import { formatDuration } from './duration.js';

describe('formatDuration', () => {
  it('formats sub-minute as "Ns"', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(45_000)).toBe('45s');
  });

  it('formats minutes as "Nm SSs" with zero-padded seconds', () => {
    expect(formatDuration(60_000)).toBe('1m 00s');
    expect(formatDuration(60_000 + 4_000)).toBe('1m 04s');
    expect(formatDuration(33 * 60_000 + 4_000)).toBe('33m 04s');
  });

  it('formats hours as "Nh MMm SSs" with zero-padded fields', () => {
    expect(formatDuration(60 * 60_000)).toBe('1h 00m 00s');
    expect(formatDuration(60 * 60_000 + 2 * 60_000 + 14_000)).toBe('1h 02m 14s');
  });

  it('clamps negative durations to 0s', () => {
    expect(formatDuration(-500)).toBe('0s');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: fails — module not found.

- [ ] **Step 3: Implement `src/format/duration.ts`**

```ts
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) {
    return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${pad(seconds)}s`;
  }
  return `${seconds}s`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}
```

- [ ] **Step 4: Run to verify duration tests pass**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: duration tests pass.

- [ ] **Step 5: Write the failing tokens test at `src/format/tokens.test.ts`**

```ts
import { formatTokens } from './tokens.js';

describe('formatTokens', () => {
  it('renders sub-thousand counts as raw integers', () => {
    expect(formatTokens(0)).toBe('0');
    expect(formatTokens(999)).toBe('999');
  });

  it('renders thousands with one decimal and "k" suffix', () => {
    expect(formatTokens(1_000)).toBe('1.0k');
    expect(formatTokens(48_240)).toBe('48.2k');
    expect(formatTokens(999_499)).toBe('999.5k');
  });

  it('renders millions with one decimal and "M" suffix', () => {
    expect(formatTokens(1_000_000)).toBe('1.0M');
    expect(formatTokens(2_345_000)).toBe('2.3M');
  });

  it('clamps negative values to 0', () => {
    expect(formatTokens(-500)).toBe('0');
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: tokens tests fail.

- [ ] **Step 7: Implement `src/format/tokens.ts`**

```ts
export function formatTokens(count: number): string {
  const n = Math.max(0, count);
  if (n < 1_000) {
    return n.toString();
  }
  if (n < 1_000_000) {
    return `${(n / 1_000).toFixed(1)}k`;
  }
  return `${(n / 1_000_000).toFixed(1)}M`;
}
```

- [ ] **Step 8: Run all tests, verify pass**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: all tests pass.

- [ ] **Step 9: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: pass.

- [ ] **Step 10: Commit**

```bash
git add packages/dashboard/src/format/
git commit -m "feat(dashboard): duration + token-count format helpers"
```

---

## Task 6: DaemonClient interface, MockDaemonClient, and fixtures

Define the seam future plans will swap on. Mock returns static fixtures covering all 7 states across 3 projects so subsequent component work has realistic data to render against.

**Files:**

- Create: `packages/dashboard/src/data/DaemonClient.ts`
- Create: `packages/dashboard/src/data/MockDaemonClient.ts`
- Create: `packages/dashboard/src/data/fixtures.ts`
- Create: `packages/dashboard/src/data/MockDaemonClient.test.ts`

- [ ] **Step 1: Write the interface at `src/data/DaemonClient.ts`**

```ts
import type { Agent, Project } from './types.js';

export interface DaemonClient {
  listProjects(): Promise<Project[]>;
  listAgents(): Promise<Agent[]>;
}
```

- [ ] **Step 2: Write fixtures at `src/data/fixtures.ts`**

Pick a fixed `now` so runtimes stay deterministic for visual review. Use ISO timestamps so sort logic exercises real string comparison.

```ts
import type { Agent, Project } from './types.js';

export const FIXTURE_PROJECTS: Project[] = [
  { name: 'kanban-api', repoPath: '~/code/kanban-api' },
  { name: 'recipes-app', repoPath: '~/code/recipes-app' },
  { name: 'crew', repoPath: '~/code/crew' },
];

export const FIXTURE_AGENTS: Agent[] = [
  {
    key: 'KAN-31',
    projectName: 'kanban-api',
    ticketTitle: 'Add board archival endpoint with audit log retention',
    state: 'waiting',
    startedAt: '2026-04-26T13:14:00Z',
    tokens: 48_240,
  },
  {
    key: 'KAN-29',
    projectName: 'kanban-api',
    ticketTitle: 'Refactor card-move handler to use the new event bus',
    state: 'running',
    startedAt: '2026-04-26T13:30:00Z',
    tokens: 12_010,
  },
  {
    key: 'KAN-22',
    projectName: 'kanban-api',
    ticketTitle: 'Migrate legacy column ordering field to JSONB',
    state: 'pr_open',
    startedAt: '2026-04-26T11:02:00Z',
    tokens: 87_500,
    prUrl: 'https://github.com/example/kanban-api/pull/142',
  },
  {
    key: 'REC-7',
    projectName: 'recipes-app',
    ticketTitle: 'Recipe search ranks ingredient matches above title-only',
    state: 'error',
    startedAt: '2026-04-26T12:50:00Z',
    tokens: 4_200,
  },
  {
    key: 'REC-11',
    projectName: 'recipes-app',
    ticketTitle: 'Bulk import csv supports new metric units',
    state: 'initializing',
    startedAt: '2026-04-26T13:42:00Z',
    tokens: 0,
  },
  {
    key: 'REC-3',
    projectName: 'recipes-app',
    ticketTitle: 'Server-render the recipe collection page for OG previews',
    state: 'idle',
    startedAt: '2026-04-26T09:11:00Z',
    tokens: 31_500,
  },
  {
    key: 'CREW-12',
    projectName: 'crew',
    ticketTitle: 'crew finish surfaces post-merge cleanup errors as exit codes',
    state: 'finished',
    startedAt: '2026-04-26T08:00:00Z',
    tokens: 22_700,
  },
];
```

- [ ] **Step 3: Write the failing test at `src/data/MockDaemonClient.test.ts`**

```ts
import { MockDaemonClient } from './MockDaemonClient.js';
import { FIXTURE_AGENTS, FIXTURE_PROJECTS } from './fixtures.js';

describe('MockDaemonClient', () => {
  it('returns the fixture projects', async () => {
    const client = new MockDaemonClient();
    await expect(client.listProjects()).resolves.toEqual(FIXTURE_PROJECTS);
  });

  it('returns the fixture agents', async () => {
    const client = new MockDaemonClient();
    await expect(client.listAgents()).resolves.toEqual(FIXTURE_AGENTS);
  });

  it('accepts an override list of agents for tests', async () => {
    const client = new MockDaemonClient({ agents: [], projects: [] });
    await expect(client.listAgents()).resolves.toEqual([]);
    await expect(client.listProjects()).resolves.toEqual([]);
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: fails — `MockDaemonClient.js` not found.

- [ ] **Step 5: Implement `src/data/MockDaemonClient.ts`**

```ts
import type { DaemonClient } from './DaemonClient.js';
import type { Agent, Project } from './types.js';
import { FIXTURE_AGENTS, FIXTURE_PROJECTS } from './fixtures.js';

export interface MockDaemonClientOptions {
  agents?: Agent[];
  projects?: Project[];
}

export class MockDaemonClient implements DaemonClient {
  private readonly agents: Agent[];
  private readonly projects: Project[];

  constructor(options: MockDaemonClientOptions = {}) {
    this.agents = options.agents ?? FIXTURE_AGENTS;
    this.projects = options.projects ?? FIXTURE_PROJECTS;
  }

  async listProjects(): Promise<Project[]> {
    return this.projects;
  }

  async listAgents(): Promise<Agent[]> {
    return this.agents;
  }
}
```

- [ ] **Step 6: Run tests, verify pass**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: all tests pass.

- [ ] **Step 7: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add packages/dashboard/src/data/
git commit -m "feat(dashboard): DaemonClient interface + mock implementation with fixtures"
```

---

## Task 7: StateBadge component

The pill that appears on every row, in the drawer header, and in the state-history rail. Three intensities (`muted`, `mid`, `loud`), two sizes (`sm`, `md`), animated dot for `running`/`initializing`.

**Files:**

- Create: `packages/dashboard/src/components/StateBadge.tsx`
- Create: `packages/dashboard/src/components/StateBadge.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { StateBadge } from './StateBadge.js';

describe('StateBadge', () => {
  it('renders the human label for each state', () => {
    render(<StateBadge state="waiting" />);
    expect(screen.getByText('Waiting')).toBeInTheDocument();
  });

  it('exposes the state via aria-label so it is queryable accessibly', () => {
    render(<StateBadge state="pr_open" />);
    expect(screen.getByRole('status')).toHaveAccessibleName('PR open');
  });

  it('applies the mid intensity by default', () => {
    render(<StateBadge state="running" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-intensity', 'mid');
  });

  it('applies the requested intensity', () => {
    render(<StateBadge state="error" intensity="loud" />);
    expect(screen.getByRole('status')).toHaveAttribute('data-intensity', 'loud');
  });

  it('renders an animated dot for running and initializing', () => {
    render(<StateBadge state="running" />);
    expect(screen.getByTestId('state-badge-pulse')).toBeInTheDocument();
  });

  it('renders a static dot for non-active states', () => {
    render(<StateBadge state="finished" />);
    expect(screen.queryByTestId('state-badge-pulse')).not.toBeInTheDocument();
    expect(screen.getByTestId('state-badge-dot')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: fails — module not found.

- [ ] **Step 3: Implement `src/components/StateBadge.tsx`**

```tsx
import type { AgentState } from '../data/types.js';
import { STATE_META } from '../data/state-meta.js';

export type StateIntensity = 'muted' | 'mid' | 'loud';
export type StateSize = 'sm' | 'md';

interface StateBadgeProps {
  state: AgentState;
  intensity?: StateIntensity;
  size?: StateSize;
}

const SIZE_CLASSES: Record<StateSize, string> = {
  sm: 'h-[18px] px-1.5 text-[10px]',
  md: 'h-[22px] px-2 text-[11px]',
};

function classesForIntensity(intensity: StateIntensity, colorVar: string): string {
  const text = `text-${colorVar}`;
  switch (intensity) {
    case 'muted':
      return `${text} border border-${colorVar}/40 bg-transparent`;
    case 'loud':
      return `text-slate-950 border border-${colorVar} bg-${colorVar}`;
    case 'mid':
    default:
      return `${text} border border-${colorVar}/30 bg-${colorVar}/10`;
  }
}

const ACTIVE_STATES = new Set<AgentState>(['running', 'initializing']);

export function StateBadge({ state, intensity = 'mid', size = 'md' }: StateBadgeProps) {
  const meta = STATE_META[state];
  const classes = [
    'inline-flex items-center gap-1.5 rounded-full font-mono leading-none whitespace-nowrap',
    SIZE_CLASSES[size],
    classesForIntensity(intensity, meta.colorVar),
  ].join(' ');
  return (
    <span
      role="status"
      aria-label={meta.label}
      data-intensity={intensity}
      data-state={state}
      className={classes}
    >
      {ACTIVE_STATES.has(state) ? <PulseDot colorVar={meta.colorVar} /> : <Dot colorVar={meta.colorVar} />}
      {meta.label}
    </span>
  );
}

function PulseDot({ colorVar }: { colorVar: string }) {
  return (
    <span
      data-testid="state-badge-pulse"
      className={`inline-block h-1.5 w-1.5 rounded-full bg-${colorVar} animate-pulse-dot`}
      aria-hidden
    />
  );
}

function Dot({ colorVar }: { colorVar: string }) {
  return (
    <span
      data-testid="state-badge-dot"
      className={`inline-block h-1.5 w-1.5 rounded-full bg-${colorVar}`}
      aria-hidden
    />
  );
}
```

> Note: dynamic class concatenation like `bg-${colorVar}` requires Tailwind to see the literal classes at build time. Add a safelist comment in `index.css` so Tailwind keeps them. If the build strips them, switch the implementation to a static lookup map (`{ 'state-waiting': 'bg-state-waiting border-state-waiting/30 ...' }`). Test step will catch this.

- [ ] **Step 4: Add a safelist for state utilities to `src/index.css`**

Append to the bottom of `src/index.css`:

```css
@source inline("bg-state-initializing bg-state-running bg-state-idle bg-state-waiting bg-state-pr-open bg-state-error bg-state-finished");
@source inline("bg-state-initializing/10 bg-state-running/10 bg-state-idle/10 bg-state-waiting/10 bg-state-pr-open/10 bg-state-error/10 bg-state-finished/10");
@source inline("text-state-initializing text-state-running text-state-idle text-state-waiting text-state-pr-open text-state-error text-state-finished");
@source inline("border-state-initializing border-state-running border-state-idle border-state-waiting border-state-pr-open border-state-error border-state-finished");
@source inline("border-state-initializing/30 border-state-running/30 border-state-idle/30 border-state-waiting/30 border-state-pr-open/30 border-state-error/30 border-state-finished/30");
@source inline("border-state-initializing/40 border-state-running/40 border-state-idle/40 border-state-waiting/40 border-state-pr-open/40 border-state-error/40 border-state-finished/40");
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: all tests pass.

- [ ] **Step 6: Build to confirm Tailwind picks up the safelisted utilities**

Run: `npm run build --workspace=crew-dashboard`
Expected: succeeds; CSS bundle contains `bg-state-waiting`, `text-state-error`, etc.
Verify by grepping the built CSS:

```bash
grep -o 'bg-state-waiting\|text-state-error\|border-state-pr-open' packages/dashboard/dist/assets/*.css | sort -u
```

Expected: at least one match per class.

- [ ] **Step 7: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add packages/dashboard/src/components/StateBadge.tsx packages/dashboard/src/components/StateBadge.test.tsx packages/dashboard/src/index.css
git commit -m "feat(dashboard): StateBadge with intensities, sizes, animated dot"
```

---

## Task 8: AgentRow component

The carded row — the single most important component in the design. Six-column grid: state pill, ticket key, ticket title, runtime, tokens, quick action. Attention treatment when state is `waiting`/`pr_open`/`error`. Live runtime ticking via `useEffect` interval.

**Files:**

- Create: `packages/dashboard/src/components/AgentRow.tsx`
- Create: `packages/dashboard/src/components/AgentRow.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgentRow } from './AgentRow.js';
import type { Agent } from '../data/types.js';

const baseAgent: Agent = {
  key: 'KAN-31',
  projectName: 'kanban-api',
  ticketTitle: 'Add board archival endpoint',
  state: 'waiting',
  startedAt: new Date(Date.now() - 33 * 60_000 - 4_000).toISOString(),
  tokens: 48_240,
};

describe('AgentRow', () => {
  it('renders the ticket key, title, runtime, and tokens', () => {
    render(<AgentRow agent={baseAgent} onSelect={() => {}} />);
    expect(screen.getByText('KAN-31')).toBeInTheDocument();
    expect(screen.getByText(/Add board archival endpoint/)).toBeInTheDocument();
    expect(screen.getByText(/^33m 0[34]s$/)).toBeInTheDocument();
    expect(screen.getByText('48.2k')).toBeInTheDocument();
  });

  it('renders the state badge', () => {
    render(<AgentRow agent={baseAgent} onSelect={() => {}} />);
    expect(screen.getByRole('status')).toHaveAccessibleName('Waiting');
  });

  it('renders an "Answer" quick action for waiting state', () => {
    render(<AgentRow agent={baseAgent} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Answer' })).toBeInTheDocument();
  });

  it('renders a "View PR" quick action for pr_open state', () => {
    render(
      <AgentRow
        agent={{ ...baseAgent, state: 'pr_open', prUrl: 'https://example.com/pr/1' }}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('link', { name: /View PR/ })).toHaveAttribute(
      'href',
      'https://example.com/pr/1',
    );
  });

  it('renders no quick action for running/initializing/idle', () => {
    render(<AgentRow agent={{ ...baseAgent, state: 'running' }} onSelect={() => {}} />);
    expect(screen.queryByRole('button', { name: /Answer|Retry|Archive/ })).not.toBeInTheDocument();
  });

  it('fires onSelect when the row is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AgentRow agent={baseAgent} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: /KAN-31/ }));
    expect(onSelect).toHaveBeenCalledWith('KAN-31');
  });

  it('does not fire onSelect when the quick action is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<AgentRow agent={baseAgent} onSelect={onSelect} />);
    await user.click(screen.getByRole('button', { name: 'Answer' }));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('marks the row with attention data attribute for tinting', () => {
    render(<AgentRow agent={baseAgent} onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: /KAN-31/ })).toHaveAttribute(
      'data-attention',
      'waiting',
    );
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: fails — module not found.

- [ ] **Step 3: Implement `src/components/AgentRow.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Agent, AgentState } from '../data/types.js';
import { STATE_META } from '../data/state-meta.js';
import { StateBadge } from './StateBadge.js';
import { formatDuration } from '../format/duration.js';
import { formatTokens } from '../format/tokens.js';

interface AgentRowProps {
  agent: Agent;
  onSelect: (key: string) => void;
}

const ACTIVE_STATES = new Set<AgentState>(['running', 'initializing']);

export function AgentRow({ agent, onSelect }: AgentRowProps) {
  const runtime = useLiveRuntime(agent.startedAt, ACTIVE_STATES.has(agent.state));
  const meta = STATE_META[agent.state];
  const attentionAttr = meta.attention ? agent.state : undefined;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${agent.key} — ${agent.ticketTitle}`}
      data-attention={attentionAttr}
      onClick={() => onSelect(agent.key)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(agent.key);
        }
      }}
      className={[
        'group relative grid cursor-pointer items-center gap-4 rounded-[10px] border bg-surface px-4 py-3 transition-colors hover:bg-surface-2',
        'grid-cols-[100px_90px_1fr_90px_70px_auto]',
        meta.attention ? `border-${meta.colorVar}/30 bg-${meta.colorVar}/10` : 'border-white/10',
      ].join(' ')}
    >
      {meta.attention && (
        <span
          aria-hidden
          className={`absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-${meta.colorVar} animate-att-pulse`}
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
  const stop = (e: MouseEvent) => e.stopPropagation();

  switch (agent.state) {
    case 'waiting':
      return (
        <button
          type="button"
          onClick={stop}
          className="rounded-md border border-white/10 bg-state-waiting px-3 py-1.5 text-xs font-medium text-slate-950 hover:opacity-90"
        >
          Answer
        </button>
      );
    case 'pr_open':
      return (
        <a
          href={agent.prUrl ?? '#'}
          target="_blank"
          rel="noreferrer"
          onClick={stop}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-2"
        >
          View PR ↗
        </a>
      );
    case 'error':
      return (
        <button
          type="button"
          onClick={stop}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-2"
        >
          Retry
        </button>
      );
    case 'finished':
      return (
        <button
          type="button"
          onClick={stop}
          className="rounded-md border border-white/10 px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-2"
        >
          Archive
        </button>
      );
    default:
      return <span aria-hidden />;
  }
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

- [ ] **Step 4: Run tests, verify pass**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: all tests pass.

- [ ] **Step 5: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/components/AgentRow.tsx packages/dashboard/src/components/AgentRow.test.tsx
git commit -m "feat(dashboard): AgentRow with attention tint, quick actions, live runtime"
```

---

## Task 9: ProjectSection component

The collapsible per-project group: header (folder icon + name + count + repo path), rows stacked, dashed-border empty state.

**Files:**

- Create: `packages/dashboard/src/components/ProjectSection.tsx`
- Create: `packages/dashboard/src/components/ProjectSection.test.tsx`

- [ ] **Step 1: Install lucide-react** (used for the Folder icon — and reused in TopNav later)

```bash
npm install lucide-react@latest --workspace=crew-dashboard
```

- [ ] **Step 2: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProjectSection } from './ProjectSection.js';
import type { Agent, Project } from '../data/types.js';

const project: Project = { name: 'kanban-api', repoPath: '~/code/kanban-api' };

const agents: Agent[] = [
  {
    key: 'KAN-1',
    projectName: 'kanban-api',
    ticketTitle: 't',
    state: 'running',
    startedAt: '2026-04-26T13:00:00Z',
    tokens: 100,
  },
  {
    key: 'KAN-2',
    projectName: 'kanban-api',
    ticketTitle: 't',
    state: 'finished',
    startedAt: '2026-04-26T08:00:00Z',
    tokens: 200,
  },
];

describe('ProjectSection', () => {
  it('renders the project name, repo path, and counts', () => {
    render(<ProjectSection project={project} agents={agents} onSelectAgent={() => {}} />);
    expect(screen.getByText('kanban-api')).toBeInTheDocument();
    expect(screen.getByText('~/code/kanban-api')).toBeInTheDocument();
    expect(screen.getByText(/1 active · 2 total/)).toBeInTheDocument();
  });

  it('renders one row per agent', () => {
    render(<ProjectSection project={project} agents={agents} onSelectAgent={() => {}} />);
    expect(screen.getByText('KAN-1')).toBeInTheDocument();
    expect(screen.getByText('KAN-2')).toBeInTheDocument();
  });

  it('collapses when the header is clicked', async () => {
    const user = userEvent.setup();
    render(<ProjectSection project={project} agents={agents} onSelectAgent={() => {}} />);
    await user.click(screen.getByRole('button', { name: /toggle kanban-api/i }));
    expect(screen.queryByText('KAN-1')).not.toBeInTheDocument();
  });

  it('shows a dashed-border empty state when there are no agents', () => {
    render(<ProjectSection project={project} agents={[]} onSelectAgent={() => {}} />);
    expect(screen.getByText(/No agents yet/)).toBeInTheDocument();
  });
});
```

> The "1 active" count means non-`finished` agents. Counted in the implementation.

- [ ] **Step 3: Run to verify it fails**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: fails — module not found.

- [ ] **Step 4: Implement `src/components/ProjectSection.tsx`**

```tsx
import { useState } from 'react';
import { ChevronDown, Folder } from 'lucide-react';
import type { Agent, Project } from '../data/types.js';
import { AgentRow } from './AgentRow.js';

interface ProjectSectionProps {
  project: Project;
  agents: Agent[];
  onSelectAgent: (key: string) => void;
}

export function ProjectSection({ project, agents, onSelectAgent }: ProjectSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const active = agents.filter((a) => a.state !== 'finished').length;

  return (
    <section className="flex flex-col">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-label={`Toggle ${project.name}`}
        aria-expanded={!collapsed}
        className="flex items-center justify-between gap-3 border-b border-white/10 py-2 text-left"
      >
        <span className="flex items-center gap-2">
          <ChevronDown
            className={`h-4 w-4 text-text-3 transition-transform ${collapsed ? '-rotate-90' : ''}`}
            aria-hidden
          />
          <Folder className="h-4 w-4 text-text-3" aria-hidden />
          <span className="text-sm font-semibold tracking-tight text-text">{project.name}</span>
          <span className="text-xs text-text-3">
            {active} active · {agents.length} total
          </span>
        </span>
        <span className="font-mono text-xs text-text-3">{project.repoPath}</span>
      </button>
      {!collapsed && (
        <div className="flex flex-col gap-1.5 pt-1">
          {agents.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-white/10 px-4 py-6 text-center text-sm text-text-3">
              No agents yet — start one with{' '}
              <span className="font-mono text-text-2">+ New Run</span>
            </div>
          ) : (
            agents.map((a) => <AgentRow key={a.key} agent={a} onSelect={onSelectAgent} />)
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: all tests pass.

- [ ] **Step 6: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/dashboard/src/components/ProjectSection.tsx packages/dashboard/src/components/ProjectSection.test.tsx package.json package-lock.json
git commit -m "feat(dashboard): ProjectSection collapsible group with empty state"
```

---

## Task 10: AgentsList component

The home view's main payload — groups agents by project, sorts within each project by attention-priority then started-DESC, renders a `ProjectSection` per project.

**Files:**

- Create: `packages/dashboard/src/components/AgentsList.tsx`
- Create: `packages/dashboard/src/components/AgentsList.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { AgentsList } from './AgentsList.js';
import type { Agent, Project } from '../data/types.js';

const projects: Project[] = [
  { name: 'kanban-api', repoPath: '~/code/kanban-api' },
  { name: 'recipes-app', repoPath: '~/code/recipes-app' },
];

const agents: Agent[] = [
  {
    key: 'KAN-1',
    projectName: 'kanban-api',
    ticketTitle: 'older running',
    state: 'running',
    startedAt: '2026-04-26T10:00:00Z',
    tokens: 100,
  },
  {
    key: 'KAN-2',
    projectName: 'kanban-api',
    ticketTitle: 'newer waiting',
    state: 'waiting',
    startedAt: '2026-04-26T11:00:00Z',
    tokens: 200,
  },
  {
    key: 'REC-1',
    projectName: 'recipes-app',
    ticketTitle: 'finished',
    state: 'finished',
    startedAt: '2026-04-26T08:00:00Z',
    tokens: 300,
  },
];

describe('AgentsList', () => {
  it('renders one section per project that has agents', () => {
    render(<AgentsList projects={projects} agents={agents} onSelectAgent={() => {}} />);
    expect(screen.getByText('kanban-api')).toBeInTheDocument();
    expect(screen.getByText('recipes-app')).toBeInTheDocument();
  });

  it('orders agents within a project: attention-states first, then started DESC', () => {
    render(<AgentsList projects={projects} agents={agents} onSelectAgent={() => {}} />);
    const rows = screen.getAllByRole('button', { name: /KAN-/ });
    expect(rows[0]).toHaveAccessibleName(/KAN-2/);
    expect(rows[1]).toHaveAccessibleName(/KAN-1/);
  });

  it('omits projects with no agents', () => {
    const projectsWithExtra: Project[] = [
      ...projects,
      { name: 'crew', repoPath: '~/code/crew' },
    ];
    render(
      <AgentsList projects={projectsWithExtra} agents={agents} onSelectAgent={() => {}} />,
    );
    expect(screen.queryByText('crew')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: fails — module not found.

- [ ] **Step 3: Implement `src/components/AgentsList.tsx`**

```tsx
import type { Agent, Project } from '../data/types.js';
import { sortAgentsByPriority } from '../data/state-meta.js';
import { ProjectSection } from './ProjectSection.js';

interface AgentsListProps {
  projects: Project[];
  agents: Agent[];
  onSelectAgent: (key: string) => void;
}

export function AgentsList({ projects, agents, onSelectAgent }: AgentsListProps) {
  const byProject = new Map<string, Agent[]>();
  for (const agent of agents) {
    const list = byProject.get(agent.projectName) ?? [];
    list.push(agent);
    byProject.set(agent.projectName, list);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-7 p-6">
      {projects
        .filter((p) => byProject.has(p.name))
        .map((project) => (
          <ProjectSection
            key={project.name}
            project={project}
            agents={sortAgentsByPriority(byProject.get(project.name) ?? [])}
            onSelectAgent={onSelectAgent}
          />
        ))}
    </div>
  );
}
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: all tests pass.

- [ ] **Step 5: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/components/AgentsList.tsx packages/dashboard/src/components/AgentsList.test.tsx
git commit -m "feat(dashboard): AgentsList groups + sorts agents by project"
```

---

## Task 11: Hash routing helpers

Pure parser + subscribing hook. Three route shapes for now: `/` (agents), `/agents/:key` (agent detail placeholder), `/projects` (projects placeholder).

**Files:**

- Create: `packages/dashboard/src/routing/parseRoute.ts`
- Create: `packages/dashboard/src/routing/parseRoute.test.ts`
- Create: `packages/dashboard/src/routing/useHashRoute.ts`

- [ ] **Step 1: Write the failing parser test**

```ts
import { parseRoute } from './parseRoute.js';

describe('parseRoute', () => {
  it('treats empty hash as the agents-list route', () => {
    expect(parseRoute('')).toEqual({ kind: 'agents-list' });
    expect(parseRoute('#/')).toEqual({ kind: 'agents-list' });
    expect(parseRoute('#')).toEqual({ kind: 'agents-list' });
  });

  it('parses /agents/:key', () => {
    expect(parseRoute('#/agents/KAN-31')).toEqual({ kind: 'agent-detail', key: 'KAN-31' });
  });

  it('parses /projects', () => {
    expect(parseRoute('#/projects')).toEqual({ kind: 'projects' });
  });

  it('falls back to agents-list for unknown routes', () => {
    expect(parseRoute('#/something/else')).toEqual({ kind: 'agents-list' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: fails — module not found.

- [ ] **Step 3: Implement `src/routing/parseRoute.ts`**

```ts
export type Route =
  | { kind: 'agents-list' }
  | { kind: 'agent-detail'; key: string }
  | { kind: 'projects' };

export function parseRoute(hash: string): Route {
  const stripped = hash.replace(/^#/, '');
  if (stripped === '' || stripped === '/') return { kind: 'agents-list' };

  const agentMatch = /^\/agents\/([^/]+)$/.exec(stripped);
  if (agentMatch) return { kind: 'agent-detail', key: agentMatch[1] };

  if (stripped === '/projects') return { kind: 'projects' };

  return { kind: 'agents-list' };
}
```

- [ ] **Step 4: Implement the hook at `src/routing/useHashRoute.ts`**

```ts
import { useEffect, useState } from 'react';
import { parseRoute, type Route } from './parseRoute.js';

export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  useEffect(() => {
    const handler = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return route;
}

export function navigate(path: string): void {
  window.location.hash = path;
}
```

- [ ] **Step 5: Run tests, verify pass**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: parser tests pass.

- [ ] **Step 6: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/dashboard/src/routing/
git commit -m "feat(dashboard): hash route parser + subscribing hook"
```

---

## Task 12: TopNav, BrandMark, ViewportFrame

The three frame-level components. `TopNav` includes the Agents/Projects tabs (highlighted by current route), the `Clear attention` button (disabled when count is 0; badge when >0), and the `+ New Run` button. The button click handlers are no-ops in this plan; the modal lives in a future plan.

**Files:**

- Create: `packages/dashboard/src/components/BrandMark.tsx`
- Create: `packages/dashboard/src/components/ViewportFrame.tsx`
- Create: `packages/dashboard/src/components/TopNav.tsx`
- Create: `packages/dashboard/src/components/TopNav.test.tsx`

- [ ] **Step 1: Write `src/components/BrandMark.tsx`**

```tsx
export function BrandMark({ className = 'h-[22px] w-[22px]' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill="currentColor" opacity="0.15" />
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 12 L11 16 L17 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
```

- [ ] **Step 2: Write `src/components/ViewportFrame.tsx`**

```tsx
import type { ReactNode } from 'react';

export function ViewportFrame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-full justify-center bg-canvas p-6">
      <div className="flex w-full max-w-[1400px] flex-col overflow-hidden rounded-[14px] bg-surface shadow-[0_30px_80px_-20px_rgba(0,0,0,0.6)] ring-1 ring-white/5">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write the failing TopNav test**

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TopNav } from './TopNav.js';

describe('TopNav', () => {
  it('marks the Agents tab active for the agents-list route', () => {
    render(
      <TopNav
        route={{ kind: 'agents-list' }}
        attentionCount={0}
        onClearAttention={() => {}}
        onNewRun={() => {}}
      />,
    );
    expect(screen.getByRole('link', { name: 'Agents' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Projects' })).not.toHaveAttribute('aria-current');
  });

  it('marks the Projects tab active for the projects route', () => {
    render(
      <TopNav
        route={{ kind: 'projects' }}
        attentionCount={0}
        onClearAttention={() => {}}
        onNewRun={() => {}}
      />,
    );
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('disables the Clear attention button when count is 0', () => {
    render(
      <TopNav
        route={{ kind: 'agents-list' }}
        attentionCount={0}
        onClearAttention={() => {}}
        onNewRun={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /Clear attention/ })).toBeDisabled();
  });

  it('shows the count badge when attentionCount > 0', () => {
    render(
      <TopNav
        route={{ kind: 'agents-list' }}
        attentionCount={3}
        onClearAttention={() => {}}
        onNewRun={() => {}}
      />,
    );
    const button = screen.getByRole('button', { name: /Clear attention/ });
    expect(button).not.toBeDisabled();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('fires onClearAttention when the button is clicked', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <TopNav
        route={{ kind: 'agents-list' }}
        attentionCount={2}
        onClearAttention={onClear}
        onNewRun={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Clear attention/ }));
    expect(onClear).toHaveBeenCalled();
  });

  it('fires onNewRun when the + New Run button is clicked', async () => {
    const user = userEvent.setup();
    const onNew = vi.fn();
    render(
      <TopNav
        route={{ kind: 'agents-list' }}
        attentionCount={0}
        onClearAttention={() => {}}
        onNewRun={onNew}
      />,
    );
    await user.click(screen.getByRole('button', { name: /New Run/ }));
    expect(onNew).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: fails — module not found.

- [ ] **Step 5: Implement `src/components/TopNav.tsx`**

```tsx
import type { ReactNode } from 'react';
import { Plus } from 'lucide-react';
import type { Route } from '../routing/parseRoute.js';
import { BrandMark } from './BrandMark.js';

interface TopNavProps {
  route: Route;
  attentionCount: number;
  onClearAttention: () => void;
  onNewRun: () => void;
}

export function TopNav({ route, attentionCount, onClearAttention, onNewRun }: TopNavProps) {
  const agentsActive = route.kind === 'agents-list' || route.kind === 'agent-detail';
  const projectsActive = route.kind === 'projects';

  return (
    <header className="flex items-center justify-between gap-4 border-b border-white/10 bg-surface px-5 py-3">
      <div className="flex items-center gap-6">
        <a href="#/" className="flex items-center gap-2 text-text">
          <BrandMark className="h-[22px] w-[22px] text-state-running" />
          <span className="hidden text-sm font-semibold tracking-tight sm:inline">crew</span>
        </a>
        <nav className="flex items-center gap-1">
          <NavTab href="#/" active={agentsActive}>
            Agents
          </NavTab>
          <NavTab href="#/projects" active={projectsActive}>
            Projects
          </NavTab>
        </nav>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onClearAttention}
          disabled={attentionCount === 0}
          className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-1.5 text-xs text-text-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear attention
          {attentionCount > 0 && (
            <span className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-state-waiting px-1.5 text-[10px] font-semibold text-slate-950">
              {attentionCount}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={onNewRun}
          className="flex items-center gap-1.5 rounded-md bg-text px-3 py-1.5 text-xs font-semibold text-canvas hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> New Run
        </button>
      </div>
    </header>
  );
}

function NavTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={[
        'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
        active ? 'bg-surface-2 text-text' : 'text-text-2 hover:text-text',
      ].join(' ')}
    >
      {children}
    </a>
  );
}
```

- [ ] **Step 6: Run tests, verify pass**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: all tests pass.

- [ ] **Step 7: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add packages/dashboard/src/components/TopNav.tsx packages/dashboard/src/components/TopNav.test.tsx packages/dashboard/src/components/BrandMark.tsx packages/dashboard/src/components/ViewportFrame.tsx
git commit -m "feat(dashboard): TopNav, BrandMark, ViewportFrame chrome"
```

---

## Task 13: Attention helpers + favicon badge

Pure derivation function for attention agents, a hook that owns the dismissed-set state, and a hook that updates the favicon based on the count.

**Files:**

- Create: `packages/dashboard/src/attention/attention.ts`
- Create: `packages/dashboard/src/attention/attention.test.ts`
- Create: `packages/dashboard/src/attention/useAttention.ts`
- Create: `packages/dashboard/src/attention/useFaviconBadge.ts`

- [ ] **Step 1: Write the failing test for the pure derivation**

```ts
import { attentionKeys } from './attention.js';
import type { Agent } from '../data/types.js';

const agent = (key: string, state: Agent['state']): Agent => ({
  key,
  projectName: 'p',
  ticketTitle: 't',
  state,
  startedAt: '2026-04-26T10:00:00Z',
  tokens: 0,
});

describe('attentionKeys', () => {
  it('returns keys of agents in waiting / pr_open / error states', () => {
    const agents = [
      agent('a', 'running'),
      agent('b', 'waiting'),
      agent('c', 'pr_open'),
      agent('d', 'error'),
      agent('e', 'finished'),
    ];
    expect(attentionKeys(agents)).toEqual(new Set(['b', 'c', 'd']));
  });

  it('returns an empty set when no agents are in attention states', () => {
    expect(attentionKeys([agent('a', 'running'), agent('b', 'idle')])).toEqual(new Set());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: fails.

- [ ] **Step 3: Implement `src/attention/attention.ts`**

```ts
import type { Agent } from '../data/types.js';
import { STATE_META } from '../data/state-meta.js';

export function attentionKeys(agents: Agent[]): Set<string> {
  return new Set(agents.filter((a) => STATE_META[a.state].attention).map((a) => a.key));
}
```

- [ ] **Step 4: Implement `src/attention/useAttention.ts`** — owns the dismissed-set state and exposes the live count

```ts
import { useCallback, useMemo, useState } from 'react';
import type { Agent } from '../data/types.js';
import { attentionKeys } from './attention.js';

export interface AttentionApi {
  count: number;
  clear: () => void;
}

export function useAttention(agents: Agent[]): AttentionApi {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const live = useMemo(() => attentionKeys(agents), [agents]);

  const count = useMemo(() => {
    let n = 0;
    for (const key of live) {
      if (!dismissed.has(key)) n += 1;
    }
    return n;
  }, [live, dismissed]);

  const clear = useCallback(() => {
    setDismissed((prev) => {
      const next = new Set(prev);
      for (const key of live) next.add(key);
      return next;
    });
  }, [live]);

  return { count, clear };
}
```

- [ ] **Step 5: Implement `src/attention/useFaviconBadge.ts`** — sets the favicon to a badged SVG when count > 0

```ts
import { useEffect } from 'react';

const PLAIN = renderFavicon(false);
const BADGED = renderFavicon(true);

function renderFavicon(badged: boolean): string {
  const badge = badged
    ? '<circle cx="48" cy="16" r="12" fill="#fbbf24" stroke="#0f172a" stroke-width="3" />'
    : '';
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="6" y="6" width="52" height="52" rx="14" fill="#1e293b" stroke="#e2e8f0" stroke-width="3" />
  <path d="M20 32 L28 40 L44 22" fill="none" stroke="#e2e8f0" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
  ${badge}
</svg>`.trim();
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function useFaviconBadge(count: number): void {
  useEffect(() => {
    const link = ensureLink();
    link.href = count > 0 ? BADGED : PLAIN;
  }, [count]);
}

function ensureLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  return link;
}
```

- [ ] **Step 6: Run tests, verify pass**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: all tests pass (only the pure attention test runs assertions; the hooks are exercised in Task 14).

- [ ] **Step 7: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add packages/dashboard/src/attention/
git commit -m "feat(dashboard): attention derivation, dismissal hook, favicon badge"
```

---

## Task 14: Wire it all together in App + AgentDetailPlaceholder

Compose `ViewportFrame`, `TopNav`, `AgentsList`, and a placeholder for the `agent-detail` route. Fetch agents/projects from `MockDaemonClient` once on mount. Wire `useAttention` and `useFaviconBadge`. Verify end-to-end in the browser.

**Files:**

- Create: `packages/dashboard/src/components/AgentDetailPlaceholder.tsx`
- Modify: `packages/dashboard/src/App.tsx`
- Modify: `packages/dashboard/src/App.test.tsx`

- [ ] **Step 1: Write `src/components/AgentDetailPlaceholder.tsx`**

```tsx
import { navigate } from '../routing/useHashRoute.js';

export function AgentDetailPlaceholder({ agentKey }: { agentKey: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 p-6">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="self-start rounded-md border border-white/10 px-3 py-1.5 text-xs text-text-2 hover:bg-surface-2"
      >
        ← Back to agents
      </button>
      <div className="rounded-[14px] border border-white/10 bg-surface px-6 py-8">
        <p className="font-mono text-xs text-text-3">AGENT</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-text">{agentKey}</p>
        <p className="mt-3 text-sm text-text-2">
          The agent detail drawer ships in a follow-up plan.
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Replace `src/App.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { ViewportFrame } from './components/ViewportFrame.js';
import { TopNav } from './components/TopNav.js';
import { AgentsList } from './components/AgentsList.js';
import { AgentDetailPlaceholder } from './components/AgentDetailPlaceholder.js';
import { MockDaemonClient } from './data/MockDaemonClient.js';
import type { DaemonClient } from './data/DaemonClient.js';
import type { Agent, Project } from './data/types.js';
import { navigate, useHashRoute } from './routing/useHashRoute.js';
import { useAttention } from './attention/useAttention.js';
import { useFaviconBadge } from './attention/useFaviconBadge.js';

const defaultClient: DaemonClient = new MockDaemonClient();

export function App({ client = defaultClient }: { client?: DaemonClient } = {}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([client.listProjects(), client.listAgents()]).then(([p, a]) => {
      if (cancelled) return;
      setProjects(p);
      setAgents(a);
    });
    return () => {
      cancelled = true;
    };
  }, [client]);

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

- [ ] **Step 3: Update the smoke test at `src/App.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App.js';
import { MockDaemonClient } from './data/MockDaemonClient.js';
import type { Agent, Project } from './data/types.js';

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
  return render(<App client={client} />);
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
    expect(await screen.findByText(/agent detail drawer ships in a follow-up plan/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run tests, verify pass**

Run: `npm run test:run --workspace=crew-dashboard`
Expected: all tests pass.

- [ ] **Step 5: Verify the dev server renders the full UI**

Run: `npm run dev --workspace=crew-dashboard` in one shell.
Open `http://localhost:5173` in a browser.

Expected, visually:

- Dark slate background with the rounded viewport frame
- Top nav with `crew` brand mark, `Agents` tab highlighted, `Projects` tab dim, `Clear attention` button with a yellow `2` badge (the fixtures include 1 waiting + 1 pr_open + 1 error = 3; verify the count matches what's in `fixtures.ts`)
- Three project sections (`kanban-api`, `recipes-app`, `crew`), each with rows
- Waiting/pr_open/error rows have a tinted background and a pulsing left-edge marker
- Running rows show a live-ticking runtime
- Clicking a row navigates to `#/agents/KAN-31` and shows the placeholder card
- Clicking `Back to agents` returns to the list
- Clicking `Clear attention` removes the badge

If anything looks wrong, fix it before continuing. Stop the dev server when done.

- [ ] **Step 6: Lint + typecheck**

Run: `npm run lint && npm run typecheck`
Expected: pass.

- [ ] **Step 7: Format check**

Run: `npm run format`
Expected: nothing to format (or auto-fixed; commit any diffs).

- [ ] **Step 8: Commit**

```bash
git add packages/dashboard/src/App.tsx packages/dashboard/src/App.test.tsx packages/dashboard/src/components/AgentDetailPlaceholder.tsx
git commit -m "feat(dashboard): wire App shell, route switching, attention badge, mock data"
```

---

## Task 15: Final cleanup pass

Verify the whole package is clean: lint, typecheck, all tests, build, format. Resolve any drift.

- [ ] **Step 1: Run the full check matrix from the repo root**

```bash
npm run lint && npm run format:check && npm run typecheck && npm run test:run && npm run build
```

Expected: every command exits 0.

- [ ] **Step 2: If anything fails, fix the underlying issue**

Per `CLAUDE.md`: do not silence with `eslint-disable`, `// @ts-ignore`, `any`, or non-null assertions. Fix the root cause.

- [ ] **Step 3: Manual visual smoke**

Run: `npm run dev --workspace=crew-dashboard`
Verify in a browser that all behaviors from Task 14 Step 5 still hold after any cleanup edits.

- [ ] **Step 4: Verify the placeholder routes still work**

Manually navigate to `#/projects` and `#/agents/CREW-12` in the browser. Each should render the corresponding placeholder card without console errors.

- [ ] **Step 5: Commit any remaining cleanup**

If Steps 1–4 produced changes:

```bash
git add packages/dashboard/
git commit -m "chore(dashboard): final lint/format/typecheck cleanup"
```

If nothing changed, skip this step.

---

## Verification matrix

When the plan is complete, the following should all be true:

| Check | Command |
|---|---|
| Lint clean | `npm run lint` |
| Format clean | `npm run format:check` |
| Types clean | `npm run typecheck` |
| All tests pass | `npm run test:run` |
| Build succeeds | `npm run build` |
| Dev server serves the dashboard | `npm run dev --workspace=crew-dashboard` then visit `http://localhost:5173` |

Visual acceptance:

- Three project sections render, sorted internally with attention agents on top
- Waiting / PR open / Error rows have tinted backgrounds with a pulsing left-edge marker
- Live runtimes tick on running/initializing rows
- Quick action buttons render per state and don't open the (placeholder) detail when clicked
- Clear attention button shows a count badge equal to non-dismissed waiting+pr_open+error agents
- Clicking a row navigates to `#/agents/:key` and shows a placeholder
- Reloading at `#/projects` shows the projects placeholder
- Favicon shows a yellow dot when attention count > 0; no dot when count = 0
