# Projects View Vertical Slices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **REQUIRED COMPANION SKILLS:**
> - `reaching-for-backend-patterns` — Phase A1 + B1 daemon work (Fastify + Zod + Awilix DI)
> - `reaching-for-frontend-libraries` — all dashboard component work (CVA + TanStack Query + shadcn primitives)
> - `bruno-collection-maintenance` — Phase A4 + A5 + B3 collection updates
> - `figma-use` — every `use_figma` call (Crew DS composite work + Figma frame migration)
> - `figma-screen-migration` — Phase A20 + B17 frame migration
> - `figma-design-system-propagation` — publish lifecycle, cache verification, the Trap 1 opacity-stickiness gotcha that bit us during CREW-130

**Goal:** Build the Projects list (`#/projects`) and Project detail (`#/projects/:slug`) views in the dashboard end-to-end via two parallel vertical-slice tickets — matching daemon API expansions, new Crew DS composites (CountBadge, ProjectRow, ProjectHeader, ProjectConfigBlock), and migrated Figma frames `1:2334` + `1:2443`.

**Architecture:** Two parallel-safe vertical slices following the CREW-117/119 pattern. Hash routing extends the existing `useHashRoute` switch with `#/projects` and `#/projects/:slug`. Backend uses Fastify + Zod + Awilix DI (`ProjectsService` already exists at `packages/daemon/src/services/ProjectsService.ts`). Dashboard uses TanStack Query + shadcn primitives. Crew DS composites mirror the StateBadge canonical pattern (mid intensity = bg 10% + stroke 30% + text 100%). Figma migration via the `figma-screen-migration` skill (single-collection mode chain per CREW-127's direct-alias strategy).

**Tech Stack:** TypeScript, React 19, Vite, Fastify, Zod, Awilix DI, TanStack Query, shadcn/ui (CVA + Radix), Tailwind v4, Hanken Grotesk + Fira Code, Figma Plugin API via MCP `use_figma`.

**Reference spec:** `docs/superpowers/specs/2026-05-10-projects-view-vertical-slices-design.md`

---

## File structure

| File | Phase | Responsibility |
|---|---|---|
| `packages/daemon/src/services/ProjectsService.ts` | A | Expand `list()` to derive `branch` + `jiraKey` + `activeCount`; add `getBySlug(slug)` + `getConfigPath(name)` |
| `packages/daemon/src/routes/projects.ts` | A, B | Expanded `ProjectSchema` for list response; new `GET /api/projects/:slug` handler |
| `bruno/endpoints/projects/get-list.bru` | A | Updated assertions for expanded response |
| `bruno/endpoints/projects/get-show.bru` | B | New file for the new endpoint |
| `bruno/flows/main-smoke.bru` | A, B | Chain a list call + a show call |
| `packages/dashboard/src/data/types.ts` | A | Expand `Project` interface (branch, jiraKey, activeCount); add `ProjectDetailResponse` |
| `packages/dashboard/src/data/HttpDaemonClient.ts` + `MockDaemonClient.ts` + `fixtures.ts` | A, B | Mirror type expansion + add `getProject(slug)` method |
| `packages/dashboard/src/components/CountBadge.tsx` | A | Tinted-circle badge for activeCount |
| `packages/dashboard/src/components/ProjectsTable.tsx` | A | shadcn Table wrapper with column headers + ProjectRow per project |
| `packages/dashboard/src/components/ProjectRow.tsx` | A | Single row: 5 cells + CountBadge + chevron link |
| `packages/dashboard/src/routes/ProjectsListPage.tsx` | A | Route container — query, page heading, "+ Register project" stub button, ProjectsTable |
| `packages/dashboard/src/components/ProjectHeader.tsx` | B | Detail-page header: back link + heading + config-path subtitle + Edit/Remove stubs |
| `packages/dashboard/src/components/ProjectConfigBlock.tsx` | B | TOML-formatted Card displaying ProjectConfig |
| `packages/dashboard/src/lib/jsonToToml.ts` | B | Inline JSON → TOML formatter (~30 lines) for ProjectConfig display |
| `packages/dashboard/src/routes/ProjectDetailPage.tsx` | B | Route container — query, ProjectHeader, ProjectConfigBlock, filtered ProjectSection |
| `packages/dashboard/src/components/ProjectSection.tsx` | B | Modify to accept `projectName` prop for filtering |
| `packages/dashboard/src/App.tsx` | A, B | Add `#/projects` and `#/projects/:slug` route cases |
| `packages/dashboard/src/routing/useHashRoute.ts` | A, B | Extend route discriminator if needed |
| `packages/dashboard/tests/e2e/projects-list.spec.ts` | A | Playwright e2e for the list view |
| `packages/dashboard/tests/e2e/project-detail.spec.ts` | B | Playwright e2e for the detail view |
| Crew DS Figma file `DsA7QuEa2WthDATkksd1Bq` | A, B | New composites: CountBadge, ProjectRow, ProjectHeader, ProjectConfigBlock |
| `*.figma.tsx` Code Connect mappings | A, B | One alongside each new component |
| Crew Dashboard Screens `9FeJPriqdsdA4n9R5Xsrr8` | A, B | Migrate frames `1:2334` + `1:2443` |
| `docs/plans/design-system.md` | B | Add 4 new composites to the inventory table |

---

## Phase A — Ticket 1: Projects list slice

### Task A1: Expand ProjectsService.list() to derive branch/jiraKey/activeCount

**Files:**
- Modify: `packages/daemon/src/services/ProjectsService.ts`
- Test: `packages/daemon/src/services/ProjectsService.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/daemon/src/services/ProjectsService.test.ts (add to existing file)
describe('ProjectsService.list()', () => {
  it('returns expanded shape with branch, jiraKey, activeCount', () => {
    // Setup: register two projects via the existing fixture pattern; agentsService has 3 active for project A, 0 for project B
    const svc = makeProjectsService({
      projects: [
        { name: 'a', repo_path: '/a', default_branch: 'main', jira: { project_key: 'A' } },
        { name: 'b', repo_path: '/b', default_branch: 'develop', jira: { project_key: 'B' } },
      ],
      agentsByProject: { a: 3, b: 0 },
    });
    expect(svc.list()).toEqual([
      { name: 'a', repoPath: '/a', branch: 'main',    jiraKey: 'A', activeCount: 3 },
      { name: 'b', repoPath: '/b', branch: 'develop', jiraKey: 'B', activeCount: 0 },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run -w crew-daemon test -- ProjectsService`
Expected: FAIL with mismatch (current shape only returns name + repoPath)

- [ ] **Step 3: Implement minimal change**

In `ProjectsService.ts`, change the return type + body of `list()` to read `default_branch` and `jira.project_key` from each project's config and call `agentsService.countByProject(projectName)` (or the equivalent existing aggregate). If `countByProject` doesn't exist on `AgentsService`, add a one-line method that returns `this.list().filter(a => a.projectName === name).length`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run -w crew-daemon test -- ProjectsService`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/services/ProjectsService.ts packages/daemon/src/services/ProjectsService.test.ts packages/daemon/src/services/AgentsService.ts packages/daemon/src/services/AgentsService.test.ts
git commit -m "feat(daemon): expand ProjectsService.list() with branch/jiraKey/activeCount"
```

### Task A2: Update GET /api/projects route schema + handler

**Files:**
- Modify: `packages/daemon/src/routes/projects.ts`
- Test: `packages/daemon/src/routes/projects.test.ts`

- [ ] **Step 1: Update the test to assert new shape**

```ts
// In packages/daemon/src/routes/projects.test.ts
it('returns expanded project shape', async () => {
  const res = await app.inject({ method: 'GET', url: '/api/projects' });
  expect(res.statusCode).toBe(200);
  const body = res.json();
  expect(body.projects[0]).toMatchObject({
    name: expect.any(String),
    repoPath: expect.any(String),
    branch: expect.any(String),
    jiraKey: expect.any(String),
    activeCount: expect.any(Number),
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run -w crew-daemon test -- projects`
Expected: FAIL — body.projects[0] missing branch/jiraKey/activeCount

- [ ] **Step 3: Update the route schema**

```ts
// packages/daemon/src/routes/projects.ts
const ProjectSchema = z.object({
  name: z.string(),
  repoPath: z.string(),
  branch: z.string(),
  jiraKey: z.string(),
  activeCount: z.number(),
});
```

(Handler body stays the same — just returns whatever `svc.list()` produces, which now matches the new schema after Task A1.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run -w crew-daemon test -- projects`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/routes/projects.ts packages/daemon/src/routes/projects.test.ts
git commit -m "feat(daemon): expand GET /api/projects response schema"
```

### Task A3: Update Bruno collection for /api/projects

**Files:**
- Modify: `bruno/endpoints/projects/get-list.bru`
- Modify: `bruno/flows/main-smoke.bru`

- [ ] **Step 1: Update get-list.bru assertions**

In `bruno/endpoints/projects/get-list.bru`, expand the `assert` block to check for the new fields on `res.body.projects[0]`:

```
assert {
  res.status: eq 200
  res.body.projects: isDefined
  res.body.projects[0].name: isString
  res.body.projects[0].repoPath: isString
  res.body.projects[0].branch: isString
  res.body.projects[0].jiraKey: isString
  res.body.projects[0].activeCount: isNumber
}
```

- [ ] **Step 2: Update main-smoke.bru if it references projects shape**

Inspect `bruno/flows/main-smoke.bru` for any project-shape assertions. Update similarly if present.

- [ ] **Step 3: Run bruno smoke**

Run: `npm run bruno:smoke`
Expected: PASS — all assertions

- [ ] **Step 4: Commit**

```bash
git add bruno/
git commit -m "test(bruno): assert expanded /api/projects shape"
```

### Task A4: Update dashboard Project type + fixtures

**Files:**
- Modify: `packages/dashboard/src/data/types.ts`
- Modify: `packages/dashboard/src/data/fixtures.ts`
- Modify: `packages/dashboard/src/data/MockDaemonClient.ts`
- Modify: `packages/dashboard/src/data/HttpDaemonClient.ts` (only if it does explicit shape coercion; usually just relays the typed response)

- [ ] **Step 1: Update Project interface**

```ts
// packages/dashboard/src/data/types.ts
export interface Project {
  name: string;
  repoPath: string;
  branch: string;
  jiraKey: string;
  activeCount: number;
}
```

- [ ] **Step 2: Update fixtures**

Pick the existing fixtures file and update each Project literal to include the new fields. Use realistic sample values (e.g. `branch: 'main'`, `jiraKey: 'KAN'`, `activeCount: 3`).

- [ ] **Step 3: Update MockDaemonClient**

Verify `MockDaemonClient.listProjects()` returns the updated fixture shape. If it returns inline literals, update them.

- [ ] **Step 4: Run dashboard typecheck + tests**

Run: `npm run -w crew-dashboard typecheck && npm run -w crew-dashboard test:run`
Expected: PASS — no type errors

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/data/
git commit -m "feat(dashboard): expand Project type with branch/jiraKey/activeCount"
```

### Task A5: Build CountBadge component

**Files:**
- Create: `packages/dashboard/src/components/CountBadge.tsx`
- Test: `packages/dashboard/src/components/CountBadge.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/dashboard/src/components/CountBadge.test.tsx
import { render, screen } from '@testing-library/react';
import { CountBadge } from './CountBadge.js';

describe('CountBadge', () => {
  it('renders the count', () => {
    render(<CountBadge count={6} state="initializing" />);
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('renders an em-dash when count is zero', () => {
    render(<CountBadge count={0} state="initializing" />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('applies state-color classes', () => {
    const { container } = render(<CountBadge count={1} state="error" />);
    expect(container.firstChild).toHaveClass(expect.stringContaining('state-error'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run -w crew-dashboard test:run -- CountBadge`
Expected: FAIL — module not found

- [ ] **Step 3: Implement CountBadge**

```tsx
// packages/dashboard/src/components/CountBadge.tsx
import { cva } from 'class-variance-authority';
import type { AgentState } from '../data/types.js';
import { STATE_CLASSES } from '../data/state-meta.js';

interface CountBadgeProps {
  count: number;
  state?: AgentState;
}

const countBadge = cva(
  'inline-flex items-center justify-center h-5 w-5 rounded-full font-mono text-[10px] leading-none border',
);

export function CountBadge({ count, state = 'initializing' }: CountBadgeProps) {
  if (count === 0) {
    return <span className="font-mono text-[10px] text-muted-foreground">—</span>;
  }
  const c = STATE_CLASSES[state];
  return (
    <span className={`${countBadge()} ${c.text} ${c.border30} ${c.bg10}`}>
      {count}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run -w crew-dashboard test:run -- CountBadge`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/CountBadge.tsx packages/dashboard/src/components/CountBadge.test.tsx
git commit -m "feat(dashboard): add CountBadge component"
```

### Task A6: Build ProjectRow component

**Files:**
- Create: `packages/dashboard/src/components/ProjectRow.tsx`
- Test: `packages/dashboard/src/components/ProjectRow.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/dashboard/src/components/ProjectRow.test.tsx
import { render, screen } from '@testing-library/react';
import { ProjectRow } from './ProjectRow.js';

const sampleProject = {
  name: 'kanban-api',
  repoPath: '~/code/kanban-api',
  branch: 'main',
  jiraKey: 'KAN',
  activeCount: 6,
};

describe('ProjectRow', () => {
  it('renders all 5 cells', () => {
    render(
      <table><tbody><ProjectRow project={sampleProject} /></tbody></table>
    );
    expect(screen.getByText('kanban-api')).toBeInTheDocument();
    expect(screen.getByText('~/code/kanban-api')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText('KAN')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('row links to /projects/:slug via hash', () => {
    render(
      <table><tbody><ProjectRow project={sampleProject} /></tbody></table>
    );
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('#/projects/kanban-api');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run -w crew-dashboard test:run -- ProjectRow`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ProjectRow**

```tsx
// packages/dashboard/src/components/ProjectRow.tsx
import { TableRow, TableCell } from './ui/table.js';
import { CountBadge } from './CountBadge.js';
import type { Project } from '../data/types.js';

export function ProjectRow({ project }: { project: Project }) {
  return (
    <TableRow asChild>
      <a href={`#/projects/${project.name}`} className="contents">
        <TableCell className="font-mono">{project.name}</TableCell>
        <TableCell className="font-mono text-muted-foreground">{project.repoPath}</TableCell>
        <TableCell className="font-mono text-muted-foreground">{project.branch}</TableCell>
        <TableCell className="font-mono text-muted-foreground">{project.jiraKey}</TableCell>
        <TableCell><CountBadge count={project.activeCount} /></TableCell>
        <TableCell aria-hidden>›</TableCell>
      </a>
    </TableRow>
  );
}
```

If `<TableRow asChild>` doesn't work cleanly with the shadcn Table primitive, fall back to wrapping the row in a clickable div with `onClick={() => navigate(`/projects/${project.name}`)}` from `useHashRoute.js`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run -w crew-dashboard test:run -- ProjectRow`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/ProjectRow.tsx packages/dashboard/src/components/ProjectRow.test.tsx
git commit -m "feat(dashboard): add ProjectRow component"
```

### Task A7: Build ProjectsTable component

**Files:**
- Create: `packages/dashboard/src/components/ProjectsTable.tsx`
- Test: `packages/dashboard/src/components/ProjectsTable.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/dashboard/src/components/ProjectsTable.test.tsx
import { render, screen } from '@testing-library/react';
import { ProjectsTable } from './ProjectsTable.js';

describe('ProjectsTable', () => {
  it('renders column headers', () => {
    render(<ProjectsTable projects={[]} />);
    expect(screen.getByText('NAME')).toBeInTheDocument();
    expect(screen.getByText('REPO PATH')).toBeInTheDocument();
    expect(screen.getByText('BRANCH')).toBeInTheDocument();
    expect(screen.getByText('JIRA')).toBeInTheDocument();
    expect(screen.getByText('ACTIVE')).toBeInTheDocument();
  });

  it('renders a row per project', () => {
    const projects = [
      { name: 'a', repoPath: '/a', branch: 'main', jiraKey: 'A', activeCount: 1 },
      { name: 'b', repoPath: '/b', branch: 'main', jiraKey: 'B', activeCount: 2 },
    ];
    render(<ProjectsTable projects={projects} />);
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run -w crew-dashboard test:run -- ProjectsTable`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ProjectsTable**

```tsx
// packages/dashboard/src/components/ProjectsTable.tsx
import { Table, TableHeader, TableBody, TableRow, TableHead } from './ui/table.js';
import { ProjectRow } from './ProjectRow.js';
import type { Project } from '../data/types.js';

export function ProjectsTable({ projects }: { projects: Project[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>NAME</TableHead>
          <TableHead>REPO PATH</TableHead>
          <TableHead>BRANCH</TableHead>
          <TableHead>JIRA</TableHead>
          <TableHead>ACTIVE</TableHead>
          <TableHead aria-hidden></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((p) => <ProjectRow key={p.name} project={p} />)}
      </TableBody>
    </Table>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run -w crew-dashboard test:run -- ProjectsTable`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/ProjectsTable.tsx packages/dashboard/src/components/ProjectsTable.test.tsx
git commit -m "feat(dashboard): add ProjectsTable component"
```

### Task A8: Build ProjectsListPage route container

**Files:**
- Create: `packages/dashboard/src/routes/ProjectsListPage.tsx`
- Test: `packages/dashboard/src/routes/ProjectsListPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// packages/dashboard/src/routes/ProjectsListPage.test.tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectsListPage } from './ProjectsListPage.js';
import { MockDaemonClient } from '../data/MockDaemonClient.js';

function renderWithQuery(client: MockDaemonClient) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectsListPage client={client} />
    </QueryClientProvider>,
  );
}

describe('ProjectsListPage', () => {
  it('renders heading + Register button + table', async () => {
    const client = new MockDaemonClient();
    renderWithQuery(client);
    expect(await screen.findByRole('heading', { name: /projects/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /register project/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run -w crew-dashboard test:run -- ProjectsListPage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ProjectsListPage**

```tsx
// packages/dashboard/src/routes/ProjectsListPage.tsx
import { useQuery } from '@tanstack/react-query';
import type { DaemonClient } from '../data/DaemonClient.js';
import { ProjectsTable } from '../components/ProjectsTable.js';
import { Button } from '../components/ui/button.js';

export function ProjectsListPage({ client }: { client: DaemonClient }) {
  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => client.listProjects(),
    refetchInterval: 2000,
  });

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <Button
          variant="outline"
          onClick={() => {
            // TODO (Epic 4 / CREW-XXX): wire to Register modal
          }}
        >
          + Register project
        </Button>
      </div>
      <ProjectsTable projects={projectsQuery.data ?? []} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run -w crew-dashboard test:run -- ProjectsListPage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/routes/ProjectsListPage.tsx packages/dashboard/src/routes/ProjectsListPage.test.tsx
git commit -m "feat(dashboard): add ProjectsListPage route container"
```

### Task A9: Wire #/projects route in App.tsx

**Files:**
- Modify: `packages/dashboard/src/App.tsx`
- Modify: `packages/dashboard/src/routing/useHashRoute.ts`

- [ ] **Step 1: Inspect existing route discriminator**

Read `useHashRoute.ts` to understand the current shape (likely a tagged union of route kinds). Add a `'projects-list'` case.

- [ ] **Step 2: Update useHashRoute to recognize #/projects**

```ts
// In useHashRoute.ts route parser switch
if (path === '/projects') return { kind: 'projects-list' };
```

(Add the type to the `Route` union at the top of the file too.)

- [ ] **Step 3: Update App.tsx to render ProjectsListPage when route matches**

```tsx
// In App.tsx AppContent function — add a new switch case
if (route.kind === 'projects-list') {
  return <ProjectsListPage client={client} />;
}
```

Import `ProjectsListPage` at the top.

- [ ] **Step 4: Manual smoke**

Run: `docker compose --profile dev up -d --build --wait`
Open the dashboard URL with `#/projects` in a browser. Expect: Projects table renders.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/App.tsx packages/dashboard/src/routing/useHashRoute.ts
git commit -m "feat(dashboard): wire #/projects route"
```

### Task A10: E2E test for Projects list

**Files:**
- Create: `packages/dashboard/tests/e2e/projects-list.spec.ts`

- [ ] **Step 1: Write the e2e test**

```ts
// packages/dashboard/tests/e2e/projects-list.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Projects list', () => {
  test('renders projects + chevron navigates to detail', async ({ page }) => {
    await page.goto('#/projects');
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
    // The fixture seed always includes at least one project; click its row
    const firstRow = page.getByRole('link').first();
    await firstRow.click();
    await expect(page).toHaveURL(/#\/projects\/[a-z0-9-]+$/);
  });
});
```

- [ ] **Step 2: Run e2e**

Run: `npm run test:e2e`
Expected: PASS — assuming the worktree fixtures seed at least one project (they do per CREW-117 setup).

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/tests/e2e/projects-list.spec.ts
git commit -m "test(dashboard): e2e for #/projects list view"
```

### Task A11: Lint/format/typecheck pass

**Files:** none (verification step)

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 2: Run format check**

Run: `npx prettier --check packages/dashboard/src/`
Expected: clean. If diffs, run with `--write` and stage in next commit.

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

### Task A12: Build CountBadge composite in Crew DS

**Files:**
- Mutate: Crew DS Figma file `DsA7QuEa2WthDATkksd1Bq` (Composites page)

- [ ] **Step 1: Use figma-use to create the CountBadge component**

Reference: figma-use skill. Create a single-component (not a set yet — start with one variant; can add the state axis later if needed). Structure:
- Frame name: `CountBadge`
- 20×20 (h-5 w-5) frame
- 50% corner radius
- Bg fill bound to `state/initializing` at opacity 0.10
- Stroke bound to `state/initializing` at opacity 0.30 (1px)
- Centered TEXT child: Fira Code 10pt, content "6", fill bound to `state/initializing` at opacity 1.0

Per `figma-design-system-propagation` Trap 1: explicitly set opacity 0.10 / 0.30 / 1.0 in a separate pass after binding to ensure they persist.

- [ ] **Step 2: Convert to component (figma.createComponentFromNode or wrap in component frame)**

Make it a real Component so it can be instanced.

- [ ] **Step 3: Verify via MCP get_screenshot**

Take a `get_screenshot` of the new component node. Expect: small tinted blue circle with "6" text — readable, properly tinted (not solid).

- [ ] **Step 4: Capture node ID + return it for plan-state tracking**

Note the new component's node ID for reference in Task A14 (Code Connect mapping) and Task A18 (frame migration uses this composite).

### Task A13: Build ProjectRow composite in Crew DS

**Files:**
- Mutate: Crew DS Figma file (Composites page)

- [ ] **Step 1: Use figma-use to create the ProjectRow component**

Structure:
- Horizontal auto-layout frame
- 5 text cells (name, repoPath, branch, jiraKey columns) + 1 CountBadge instance + 1 chevron icon (Lucide ChevronRight or similar)
- Fonts: Fira Code where appropriate, Hanken Grotesk for the project name
- Column widths matching the parent ProjectsTable layout

- [ ] **Step 2: Convert to component**

- [ ] **Step 3: Verify via MCP get_screenshot**

- [ ] **Step 4: Capture node ID**

### Task A14: Author Code Connect mappings

**Files:**
- Create: `packages/dashboard/src/components/CountBadge.figma.tsx`
- Create: `packages/dashboard/src/components/ProjectRow.figma.tsx`

- [ ] **Step 1: Write CountBadge.figma.tsx**

Mirror the existing `BrandMark.figma.tsx` shape. Map the Figma component URL (using node ID from A12) to the React component, with examples for varying state colors + counts.

- [ ] **Step 2: Write ProjectRow.figma.tsx**

Same pattern. Map node ID from A13. Define a code example using the `Project` type.

- [ ] **Step 3: Verify the files typecheck**

Run: `npm run -w crew-dashboard typecheck`
Expected: PASS — types match (Code Connect publish is skipped per project memory; the files are just authored as documentation).

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/components/CountBadge.figma.tsx packages/dashboard/src/components/ProjectRow.figma.tsx
git commit -m "docs(dashboard): Code Connect mappings for CountBadge + ProjectRow"
```

### Task A15: User publishes Crew DS

**Files:** N/A (manual user step)

- [ ] **Step 1: Tell the user to publish**

Message verbatim: "CountBadge + ProjectRow composites added to Crew DS. Please **republish Crew Design System** in Figma desktop (Assets panel → Publish library). Should show 2 component additions in the publish review. Reply once published."

Wait for confirmation before Task A16.

### Task A16: Migrate frame 1:2334 to Crew DS

**Files:**
- Mutate: Crew Dashboard Screens `9FeJPriqdsdA4n9R5Xsrr8` frame `1:2334`

- [ ] **Step 1: Apply the figma-screen-migration skill workflow**

Per the skill's 4-phase pipeline:
1. Audit (count detached pills, fill stats, color buckets)
2. Set Crew Semantic dark mode (single-collection — Trap 2 exception per CREW-127)
3. Bind colors via context-aware ruleset (reuse the ruleset from earlier migrations — should cover ~95% of fills)
4. Two-pass swap detached pills → CountBadge / ProjectRow instances

After swap, force opacity 0.10 / 0.30 on each new instance (Trap 1 workaround).

- [ ] **Step 2: Verify via MCP get_screenshot**

Live API screenshot of `1:2334`. Expect: rendered slate palette + ProjectRow instances + CountBadges visible.

- [ ] **Step 3: Capture issues for the visual audit**

Note any pills/buttons that didn't migrate cleanly. Apply per-element fixes if needed (same pattern as CREW-130's Inspect button + AgentBody work).

### Task A17: Commit Phase A

**Files:** Whatever's been added/modified across A1–A16 (most committed inline; this is the wrap-up commit if anything's outstanding).

- [ ] **Step 1: Sanity check**

Run: `git status --short`
Expected: clean (everything was committed inline in earlier tasks). If something's outstanding, commit it with a descriptive message.

- [ ] **Step 2: Verify all checks pass once more**

Run in parallel: `npm run lint`, `npm run typecheck`, `npm run test:run --workspace=crew-dashboard`, `npm run test:e2e`, `npm run bruno:smoke`
Expected: all PASS

---

## Phase B — Ticket 2: Project detail slice

### Task B1: Add ProjectsService.getBySlug + getConfigPath

**Files:**
- Modify: `packages/daemon/src/services/ProjectsService.ts`
- Test: `packages/daemon/src/services/ProjectsService.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
describe('ProjectsService.getBySlug()', () => {
  it('returns full ProjectConfig for known slug', () => {
    const svc = makeProjectsService({ projects: [{ name: 'kanban-api', repo_path: '/x', /* ... */ }] });
    expect(svc.getBySlug('kanban-api')).toMatchObject({ name: 'kanban-api', repo_path: '/x' });
  });

  it('throws 404-shaped error for unknown slug', () => {
    const svc = makeProjectsService({ projects: [] });
    expect(() => svc.getBySlug('nope')).toThrow(/not found/i);
  });
});

describe('ProjectsService.getConfigPath()', () => {
  it('returns the resolved file path for a project', () => {
    const svc = makeProjectsService({ projects: [{ name: 'a', /* ... */ }] });
    expect(svc.getConfigPath('a')).toMatch(/\/projects\/a\.toml$/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run -w crew-daemon test -- ProjectsService`
Expected: FAIL — methods not defined

- [ ] **Step 3: Implement getBySlug + getConfigPath**

Use the existing project config loader to resolve by name. For `getConfigPath`, use the same pattern as the loader (likely `path.join(configDir, 'projects', `${name}.toml`)`).

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run -w crew-daemon test -- ProjectsService`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/services/ProjectsService.ts packages/daemon/src/services/ProjectsService.test.ts
git commit -m "feat(daemon): ProjectsService.getBySlug + getConfigPath"
```

### Task B2: Add GET /api/projects/:slug route

**Files:**
- Modify: `packages/daemon/src/routes/projects.ts`
- Test: `packages/daemon/src/routes/projects.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('GET /api/projects/:slug', () => {
  it('returns project config for known slug', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects/kanban-api' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      project: { name: 'kanban-api' },
      configPath: expect.stringMatching(/kanban-api\.toml$/),
    });
  });

  it('returns 404 for unknown slug', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects/does-not-exist' });
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm run -w crew-daemon test -- projects`
Expected: FAIL

- [ ] **Step 3: Implement the route + Zod schema**

```ts
// packages/daemon/src/routes/projects.ts (add to existing file)
const ProjectDetailResponseSchema = z.object({
  project: ProjectConfigSchema,  // import from packages/shared/src/config/schema.ts
  configPath: z.string(),
});

app.get(
  '/api/projects/:slug',
  { schema: { response: { 200: ProjectDetailResponseSchema } } },
  async (req, reply) => {
    const svc = req.diScope.resolve('projectsService');
    try {
      const project = svc.getBySlug(req.params.slug);
      return { project, configPath: svc.getConfigPath(project.name) };
    } catch (err) {
      reply.code(404);
      return { error: 'project_not_found', message: String(err) };
    }
  },
);
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run -w crew-daemon test -- projects`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/daemon/src/routes/projects.ts packages/daemon/src/routes/projects.test.ts
git commit -m "feat(daemon): GET /api/projects/:slug endpoint"
```

### Task B3: Add Bruno endpoint for /api/projects/:slug

**Files:**
- Create: `bruno/endpoints/projects/get-show.bru`
- Modify: `bruno/flows/main-smoke.bru` to chain a list call → show call

- [ ] **Step 1: Write get-show.bru**

Use a project name from the worktree fixtures (e.g. `kanban-api`). Assert response has `project.name` and `configPath` ending in `.toml`.

- [ ] **Step 2: Update main-smoke.bru**

Add a step after the existing list call that fetches the first project's detail and asserts the config path.

- [ ] **Step 3: Run bruno smoke**

Run: `npm run bruno:smoke`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add bruno/
git commit -m "test(bruno): add /api/projects/:slug endpoint + smoke flow"
```

### Task B4: Add getProject(slug) to dashboard data layer

**Files:**
- Modify: `packages/dashboard/src/data/types.ts` (add ProjectDetailResponse)
- Modify: `packages/dashboard/src/data/DaemonClient.ts` (add getProject method to interface)
- Modify: `packages/dashboard/src/data/HttpDaemonClient.ts` (implement)
- Modify: `packages/dashboard/src/data/MockDaemonClient.ts` (implement with fixture)
- Modify: `packages/dashboard/src/data/fixtures.ts` (add per-project ProjectConfig fixture)

- [ ] **Step 1: Define ProjectDetailResponse type**

```ts
// types.ts
import type { ProjectConfig } from '@crew/shared/config/schema.js';

export interface ProjectDetailResponse {
  project: ProjectConfig;
  configPath: string;
}
```

(Verify import path; adjust to actual shared package import.)

- [ ] **Step 2: Add interface method**

```ts
// DaemonClient.ts
export interface DaemonClient {
  // ... existing methods
  getProject(slug: string): Promise<ProjectDetailResponse>;
}
```

- [ ] **Step 3: Implement HttpDaemonClient.getProject**

```ts
async getProject(slug: string): Promise<ProjectDetailResponse> {
  const res = await fetch(`${this.baseUrl}/api/projects/${slug}`);
  if (!res.ok) throw new Error(`getProject failed: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 4: Implement MockDaemonClient.getProject + fixture**

Look up the slug in the fixture; throw if missing.

- [ ] **Step 5: Verify typecheck**

Run: `npm run -w crew-dashboard typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/data/
git commit -m "feat(dashboard): add getProject(slug) to data layer"
```

### Task B5: Build jsonToToml formatter

**Files:**
- Create: `packages/dashboard/src/lib/jsonToToml.ts`
- Test: `packages/dashboard/src/lib/jsonToToml.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/dashboard/src/lib/jsonToToml.test.ts
import { jsonToToml } from './jsonToToml.js';

describe('jsonToToml', () => {
  it('formats flat keys', () => {
    expect(jsonToToml({ name: 'a', count: 3 })).toBe('name = "a"\ncount = 3');
  });

  it('formats nested objects as [section]', () => {
    expect(jsonToToml({ name: 'a', jira: { project_key: 'KAN' } }))
      .toBe('name = "a"\n\n[jira]\nproject_key = "KAN"');
  });

  it('preserves comments via leading # lines if provided', () => {
    expect(jsonToToml({ name: 'a' }, { leadingComment: '# generated by crew' }))
      .toBe('# generated by crew\nname = "a"');
  });
});
```

- [ ] **Step 2: Run tests to verify fail**

Run: `npm run -w crew-dashboard test:run -- jsonToToml`
Expected: FAIL — module not found

- [ ] **Step 3: Implement jsonToToml**

```ts
// packages/dashboard/src/lib/jsonToToml.ts
type Primitive = string | number | boolean;
type TomlValue = Primitive | TomlValue[] | { [key: string]: TomlValue };

interface JsonToTomlOptions {
  leadingComment?: string;
}

function formatValue(v: TomlValue): string {
  if (typeof v === 'string') return `"${v.replace(/"/g, '\\"')}"`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(formatValue).join(', ')}]`;
  return ''; // nested objects handled at section level
}

export function jsonToToml(obj: Record<string, TomlValue>, opts: JsonToTomlOptions = {}): string {
  const lines: string[] = [];
  if (opts.leadingComment) lines.push(opts.leadingComment);
  const sections: Record<string, Record<string, TomlValue>> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      sections[k] = v as Record<string, TomlValue>;
    } else {
      lines.push(`${k} = ${formatValue(v)}`);
    }
  }
  for (const [section, values] of Object.entries(sections)) {
    lines.push('');
    lines.push(`[${section}]`);
    for (const [k, v] of Object.entries(values)) {
      lines.push(`${k} = ${formatValue(v)}`);
    }
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run -w crew-dashboard test:run -- jsonToToml`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/lib/jsonToToml.ts packages/dashboard/src/lib/jsonToToml.test.ts
git commit -m "feat(dashboard): add jsonToToml formatter for ProjectConfig display"
```

### Task B6: Build ProjectConfigBlock component

**Files:**
- Create: `packages/dashboard/src/components/ProjectConfigBlock.tsx`
- Test: `packages/dashboard/src/components/ProjectConfigBlock.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { ProjectConfigBlock } from './ProjectConfigBlock.js';

describe('ProjectConfigBlock', () => {
  it('renders config as TOML', () => {
    const config = { name: 'kanban-api', repo_path: '~/code/kanban-api', default_branch: 'main', jira: { project_key: 'KAN' } };
    render(<ProjectConfigBlock config={config} />);
    expect(screen.getByText(/name = "kanban-api"/)).toBeInTheDocument();
    expect(screen.getByText(/\[jira\]/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `npm run -w crew-dashboard test:run -- ProjectConfigBlock`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ProjectConfigBlock**

```tsx
// packages/dashboard/src/components/ProjectConfigBlock.tsx
import { Card } from './ui/card.js';
import { jsonToToml } from '../lib/jsonToToml.js';
import type { ProjectConfig } from '@crew/shared/config/schema.js';

export function ProjectConfigBlock({ config }: { config: ProjectConfig }) {
  const toml = jsonToToml(config as Record<string, unknown> as never, { leadingComment: '# generated by crew' });
  return (
    <Card className="p-4">
      <pre className="font-mono text-sm text-muted-foreground whitespace-pre">{toml}</pre>
    </Card>
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm run -w crew-dashboard test:run -- ProjectConfigBlock`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/ProjectConfigBlock.tsx packages/dashboard/src/components/ProjectConfigBlock.test.tsx
git commit -m "feat(dashboard): add ProjectConfigBlock component"
```

### Task B7: Build ProjectHeader component

**Files:**
- Create: `packages/dashboard/src/components/ProjectHeader.tsx`
- Test: `packages/dashboard/src/components/ProjectHeader.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { ProjectHeader } from './ProjectHeader.js';

describe('ProjectHeader', () => {
  it('renders back link, name, config path, and action buttons', () => {
    render(<ProjectHeader name="kanban-api" configPath="~/.config/crew/projects/kanban-api.toml" />);
    expect(screen.getByText('← Projects')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'kanban-api' })).toBeInTheDocument();
    expect(screen.getByText(/kanban-api\.toml/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('back link href is #/projects', () => {
    render(<ProjectHeader name="x" configPath="" />);
    const back = screen.getByRole('link', { name: '← Projects' });
    expect(back.getAttribute('href')).toBe('#/projects');
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `npm run -w crew-dashboard test:run -- ProjectHeader`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ProjectHeader**

```tsx
// packages/dashboard/src/components/ProjectHeader.tsx
import { Button } from './ui/button.js';

interface ProjectHeaderProps {
  name: string;
  configPath: string;
}

export function ProjectHeader({ name, configPath }: ProjectHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <a href="#/projects" className="text-sm text-muted-foreground hover:text-foreground">← Projects</a>
        <h1 className="text-2xl font-semibold mt-1">{name}</h1>
        <p className="text-sm text-muted-foreground font-mono mt-1">{configPath}</p>
      </div>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => { /* TODO (Epic 4): wire to Edit modal */ }}
        >Edit</Button>
        <Button
          variant="destructive"
          onClick={() => { /* TODO (Epic 4): wire to Remove modal */ }}
        >Remove</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm run -w crew-dashboard test:run -- ProjectHeader`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/ProjectHeader.tsx packages/dashboard/src/components/ProjectHeader.test.tsx
git commit -m "feat(dashboard): add ProjectHeader component"
```

### Task B8: Modify ProjectSection to accept projectName filter

**Files:**
- Modify: `packages/dashboard/src/components/ProjectSection.tsx`
- Modify: `packages/dashboard/src/components/ProjectSection.test.tsx`

- [ ] **Step 1: Add a test for the new prop**

```tsx
it('filters agents to the named project when projectName prop is set', () => {
  const agents = [
    { key: 'a1', projectName: 'a', /* ... */ },
    { key: 'b1', projectName: 'b', /* ... */ },
  ];
  render(<ProjectSection agents={agents} projectName="a" />);
  expect(screen.queryByText('a1')).toBeInTheDocument();
  expect(screen.queryByText('b1')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run -w crew-dashboard test:run -- ProjectSection`
Expected: FAIL — projectName prop ignored / not present

- [ ] **Step 3: Add the prop + filter logic**

In `ProjectSection.tsx`, add an optional `projectName?: string` prop. When set, filter the agents array before rendering.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run -w crew-dashboard test:run -- ProjectSection`
Expected: PASS — including any pre-existing tests

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/ProjectSection.tsx packages/dashboard/src/components/ProjectSection.test.tsx
git commit -m "feat(dashboard): ProjectSection accepts projectName filter prop"
```

### Task B9: Build ProjectDetailPage route container

**Files:**
- Create: `packages/dashboard/src/routes/ProjectDetailPage.tsx`
- Test: `packages/dashboard/src/routes/ProjectDetailPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ProjectDetailPage } from './ProjectDetailPage.js';
import { MockDaemonClient } from '../data/MockDaemonClient.js';

function renderWithQuery(client: MockDaemonClient, slug: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ProjectDetailPage client={client} slug={slug} />
    </QueryClientProvider>,
  );
}

describe('ProjectDetailPage', () => {
  it('renders header + config + agents section', async () => {
    const client = new MockDaemonClient();
    renderWithQuery(client, 'kanban-api');
    expect(await screen.findByRole('heading', { name: 'kanban-api' })).toBeInTheDocument();
    expect(screen.getByText('AGENTS')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `npm run -w crew-dashboard test:run -- ProjectDetailPage`
Expected: FAIL

- [ ] **Step 3: Implement ProjectDetailPage**

```tsx
// packages/dashboard/src/routes/ProjectDetailPage.tsx
import { useQuery } from '@tanstack/react-query';
import type { DaemonClient } from '../data/DaemonClient.js';
import { ProjectHeader } from '../components/ProjectHeader.js';
import { ProjectConfigBlock } from '../components/ProjectConfigBlock.js';
import { ProjectSection } from '../components/ProjectSection.js';

interface ProjectDetailPageProps {
  client: DaemonClient;
  slug: string;
}

export function ProjectDetailPage({ client, slug }: ProjectDetailPageProps) {
  const detailQuery = useQuery({
    queryKey: ['project', slug],
    queryFn: () => client.getProject(slug),
  });
  const agentsQuery = useQuery({
    queryKey: ['agents'],
    queryFn: () => client.listAgents(),
    refetchInterval: 2000,
  });

  if (detailQuery.isLoading) return <div className="p-6">Loading…</div>;
  if (detailQuery.error || !detailQuery.data) return <div className="p-6">Project not found</div>;

  const { project, configPath } = detailQuery.data;
  return (
    <div className="p-6">
      <ProjectHeader name={project.name} configPath={configPath} />
      <ProjectConfigBlock config={project} />
      <h2 className="text-sm font-semibold uppercase text-muted-foreground mt-8 mb-2">AGENTS</h2>
      <ProjectSection agents={agentsQuery.data ?? []} projectName={project.name} />
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify pass**

Run: `npm run -w crew-dashboard test:run -- ProjectDetailPage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/routes/ProjectDetailPage.tsx packages/dashboard/src/routes/ProjectDetailPage.test.tsx
git commit -m "feat(dashboard): add ProjectDetailPage route container"
```

### Task B10: Wire #/projects/:slug route in App.tsx

**Files:**
- Modify: `packages/dashboard/src/App.tsx`
- Modify: `packages/dashboard/src/routing/useHashRoute.ts`

- [ ] **Step 1: Add route discriminator + slug parsing in useHashRoute**

```ts
// useHashRoute.ts route parser
const projectMatch = path.match(/^\/projects\/([^\/]+)$/);
if (projectMatch) return { kind: 'project-detail', slug: projectMatch[1] };
```

(Add to the `Route` type union too.)

- [ ] **Step 2: Render ProjectDetailPage on match**

```tsx
// App.tsx
if (route.kind === 'project-detail') {
  return <ProjectDetailPage client={client} slug={route.slug} />;
}
```

- [ ] **Step 3: Manual smoke**

Run dashboard, navigate to `#/projects/kanban-api` (or whichever slug exists in fixtures). Expect: detail page renders.

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/App.tsx packages/dashboard/src/routing/useHashRoute.ts
git commit -m "feat(dashboard): wire #/projects/:slug route"
```

### Task B11: E2E test for Project detail

**Files:**
- Create: `packages/dashboard/tests/e2e/project-detail.spec.ts`

- [ ] **Step 1: Write the e2e test**

```ts
import { test, expect } from '@playwright/test';

test('Project detail renders + back link returns to list', async ({ page }) => {
  // Navigate via the list to confirm flow
  await page.goto('#/projects');
  const firstRow = page.getByRole('link').first();
  const slug = (await firstRow.getAttribute('href'))?.replace('#/projects/', '');
  await firstRow.click();
  await expect(page).toHaveURL(new RegExp(`#/projects/${slug}$`));
  await expect(page.getByRole('heading', { name: slug! })).toBeVisible();
  // Back link
  await page.getByRole('link', { name: '← Projects' }).click();
  await expect(page).toHaveURL(/#\/projects$/);
});
```

- [ ] **Step 2: Run e2e**

Run: `npm run test:e2e`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/tests/e2e/project-detail.spec.ts
git commit -m "test(dashboard): e2e for #/projects/:slug detail view"
```

### Task B12: Lint/format/typecheck pass

**Files:** none

- [ ] **Step 1: Run lint**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS

### Task B13: Build ProjectHeader composite in Crew DS

**Files:**
- Mutate: Crew DS Figma file

- [ ] **Step 1: Use figma-use to create the ProjectHeader component**

Structure:
- Outer horizontal frame: heading-block (left) + actions-block (right, gap)
- Heading-block: vertical auto-layout with back link → heading → config-path subtitle (Fira Code, muted-foreground)
- Actions-block: horizontal auto-layout with Edit (outline) + Remove (destructive) Button instances

Use shadcn Button instances from Core (ID `73:3681` per CREW-125 mapping).

- [ ] **Step 2: Convert to component**

- [ ] **Step 3: Verify via MCP get_screenshot**

- [ ] **Step 4: Capture node ID**

### Task B14: Build ProjectConfigBlock composite in Crew DS

**Files:**
- Mutate: Crew DS Figma file

- [ ] **Step 1: Use figma-use to create the ProjectConfigBlock component**

Structure:
- Outer Card instance from shadcn (or styled frame): bg `card`, border `border`, padding p-4
- Inner TEXT node: Fira Code 14pt, muted-foreground, sample TOML content (mirror the Figma frame's example)

- [ ] **Step 2: Convert to component**

- [ ] **Step 3: Verify via MCP get_screenshot**

- [ ] **Step 4: Capture node ID**

### Task B15: Author Code Connect mappings

**Files:**
- Create: `packages/dashboard/src/components/ProjectHeader.figma.tsx`
- Create: `packages/dashboard/src/components/ProjectConfigBlock.figma.tsx`

- [ ] **Step 1: Write ProjectHeader.figma.tsx**

Mirror existing Code Connect file shape. Map node ID from B13.

- [ ] **Step 2: Write ProjectConfigBlock.figma.tsx**

Map node ID from B14.

- [ ] **Step 3: Verify typecheck**

Run: `npm run -w crew-dashboard typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/components/ProjectHeader.figma.tsx packages/dashboard/src/components/ProjectConfigBlock.figma.tsx
git commit -m "docs(dashboard): Code Connect mappings for ProjectHeader + ProjectConfigBlock"
```

### Task B16: User publishes Crew DS

**Files:** N/A (manual user step)

- [ ] **Step 1: Tell the user to publish**

Message: "ProjectHeader + ProjectConfigBlock composites added to Crew DS. Please **republish Crew Design System** in Figma desktop. Should show 2 component additions in the publish review. Reply once published."

Wait for confirmation.

### Task B17: Migrate frame 1:2443 to Crew DS

**Files:**
- Mutate: Crew Dashboard Screens frame `1:2443`

- [ ] **Step 1: Apply figma-screen-migration skill workflow**

Same 4-phase pipeline. Compose new ProjectHeader + ProjectConfigBlock + existing ProjectSection instances. The agent rows inside reuse the StateBadge work already established.

Force opacity 0.10/0.30 explicitly on any new instances per Trap 1.

- [ ] **Step 2: Verify via MCP get_screenshot**

Live API screenshot of `1:2443`. Expect: rendered slate palette + composites in place.

- [ ] **Step 3: Capture issues for the visual audit**

### Task B18: Update design-system.md inventory

**Files:**
- Modify: `docs/plans/design-system.md`

- [ ] **Step 1: Add 4 new composites to the Component inventory section**

Add a new subsection (e.g. "### CREW-XXX (Projects view, 2026-XX-XX)") with a table mirroring the existing inventory tables. List the 4 composites with their Figma node IDs (captured during A12, A13, B13, B14) and their dashboard counterpart paths.

- [ ] **Step 2: Commit**

```bash
git add docs/plans/design-system.md
git commit -m "docs(design-system): add Projects view composites to inventory"
```

### Task B19: Final cross-check

**Files:** none

- [ ] **Step 1: Run full check matrix in parallel**

`npm run lint`, `npm run typecheck`, `npm run test:run --workspace=crew-dashboard`, `npm run -w crew-daemon test`, `npm run test:e2e`, `npm run bruno:smoke`
Expected: all PASS

- [ ] **Step 2: Browser smoke**

Open dashboard. Navigate to `#/projects`, click into a project, navigate back. Expect: smooth, no console errors, slate palette consistent throughout.

---

## Plan-level acceptance criteria

Re-stated from spec:

- [ ] Phase A complete (Tasks A1–A17): backend expanded, dashboard list view shipped, CountBadge + ProjectRow composites in Crew DS, frame `1:2334` migrated
- [ ] Phase B complete (Tasks B1–B19): backend `getProject` shipped, dashboard detail view shipped, ProjectHeader + ProjectConfigBlock composites in Crew DS, frame `1:2443` migrated, design-system.md inventory updated
- [ ] All tests pass: lint, typecheck, dashboard unit, daemon unit, e2e Playwright, bruno smoke
- [ ] User has published Crew DS twice (once after Phase A composites, once after Phase B composites)
- [ ] Browser smoke: both `#/projects` and `#/projects/:slug` render with correct slate palette + working navigation

## Out of scope (re-stated)

- Edit / Remove modal flows (Epic 4)
- Register project modal (Epic 4)
- "+ New Run" button wiring
- QuickAction button wiring (existing followup)
- Editing project config from the UI (display only)
- Sorting / filtering / search on projects list
