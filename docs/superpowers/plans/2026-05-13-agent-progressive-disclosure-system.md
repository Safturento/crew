# Agent-context progressive disclosure system — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/superpowers/specs/2026-05-13-agent-progressive-disclosure-system.md`](../specs/2026-05-13-agent-progressive-disclosure-system.md)

**Goal:** Ship a two-tier progressive-disclosure system for agent-facing documentation: lazy-loaded `AGENTS.md` files (root + per-package) + an on-demand `.agents/` topic library, with frontmatter-driven freshness and parity enforcement, and Layer-1 metrics derived from existing transcripts.

**Architecture:** AGENTS.md files act as lean indexes (always-loaded or path-traversal lazy). `.agents/<topic>.md` files are discovery-on-demand. A frontmatter validator script enforces schema. A soft PreToolUse hook on `gh pr create` (sibling to `visual-fidelity-pr-gate`) warns on parity violations. A `MetricsService` on the daemon derives four metrics from already-ingested transcript events.

**Tech Stack:**

- Markdown + YAML frontmatter for docs (`.agents/*.md`, `AGENTS.md`).
- TypeScript + Vitest for the validator script (`scripts/validate-agents-frontmatter.ts`).
- Bash + jq for the soft hook (matches `visual-fidelity-pr-gate.sh` pattern).
- Daemon: Kysely + SQLite + Fastify + Zod (existing patterns). Numbered migration files in `packages/daemon/src/migrations/`.
- Dashboard: React + Vite + Tailwind (existing patterns), TanStack Query for the new metrics endpoints.
- `micromatch` (already a transitive dep via tooling) for glob validation.

---

## Epic structure

This plan covers **11 child tickets** in one Epic + **1 manual user-level task** outside the Epic. Tickets are labeled #1 through #11 throughout the plan. Each ticket section is self-contained — you can execute one ticket without reading the others (with the exception that all tickets are blocked-by ticket #1).

| Ticket   | Phase   | Title                                                 | Blocked-by |
| -------- | ------- | ----------------------------------------------------- | ---------- |
| #1       | Phase 1 | Foundation — scaffold + rename + validator + baseline | —          |
| #2       | Phase 2 | `.agents/architecture.md`                             | #1         |
| #3       | Phase 2 | `.agents/local-dev.md`                                | #1         |
| #4       | Phase 2 | `.agents/testing.md`                                  | #1         |
| #5       | Phase 2 | `.agents/dispatch.md`                                 | #1         |
| #6       | Phase 2 | `.agents/security.md`                                 | #1         |
| #7       | Phase 2 | `.agents/design-system.md`                            | #1         |
| #8       | Phase 2 | `.agents/workflow.md`                                 | #1         |
| #9       | Phase 2 | `.agents/commands.md`                                 | #1         |
| #10      | Phase 3 | Soft doc-parity hook                                  | #1         |
| #11      | Phase 4 | Metrics pipeline                                      | #1         |
| (manual) | Phase 3 | Extend `verification-before-completion` skill         | #1         |

After all Phase 2 tickets land, a small cleanup commit removes the verbose inline content from root `AGENTS.md` (the spec's "Final cleanup at end of Phase 2" clause). This commit lives in whichever Phase 2 ticket ships last — assign it to ticket #9 by convention.

---

## File structure overview

**New files created:**

```
AGENTS.md                                              # (renamed from CLAUDE.md, then indexed)
packages/cli/AGENTS.md                                 # per-package
packages/daemon/AGENTS.md
packages/dashboard/AGENTS.md
packages/shared/AGENTS.md
.agents/README.md                                      # meta-doc
.agents/architecture.md
.agents/local-dev.md
.agents/testing.md
.agents/dispatch.md
.agents/security.md
.agents/design-system.md
.agents/workflow.md
.agents/commands.md
docs/rationale/                                        # NEW directory
docs/rationale/architecture.md                         # populated by ticket #2
docs/rationale/sandbox-limitations.md                  # populated by ticket #6 (if any rationale extracted)
docs/rationale/design-system.md                        # populated by ticket #7
scripts/validate-agents-frontmatter.ts                 # validator
scripts/validate-agents-frontmatter.test.ts            # validator tests
scripts/baseline-metrics-capture.ts                    # one-time throwaway, runs in CI of Phase 1 PR
packages/cli/scripts/hooks/doc-parity-gate.sh          # soft hook
packages/cli/scripts/hooks/doc-parity-gate.test.sh     # hook tests
packages/daemon/src/migrations/0003_run_metrics.ts     # schema
packages/daemon/src/migrations/0003_run_metrics.test.ts
packages/daemon/src/services/MetricsService.ts
packages/daemon/src/services/MetricsService.test.ts
packages/daemon/src/routes/metrics.ts
packages/daemon/src/routes/metrics.test.ts
packages/shared/src/transcripts/extract-bash-commands.ts
packages/shared/src/transcripts/extract-bash-commands.test.ts
packages/shared/src/transcripts/extract-read-paths.ts
packages/shared/src/transcripts/extract-read-paths.test.ts
packages/dashboard/src/routes/MetricsPage.tsx          # if standalone, or tab on AgentDetail
packages/dashboard/src/components/MetricsTrendWidget.tsx
```

**Files modified:**

```
CLAUDE.md                                              # deleted via rename to AGENTS.md
docs/plans/architecture.md                             # deleted (content moved)
docs/plans/project-resolution.md                       # deleted
docs/plans/sandbox-limitations.md                      # deleted
docs/plans/design-system.md                            # deleted
docs/plans/                                            # directory removed after empty
package.json                                           # add validator script to lint
.claude/settings.json                                  # register the new hook
packages/daemon/src/db.ts                              # extend RunsTable with metric columns
packages/dashboard/src/routes/AgentDetailPage.tsx      # add Metrics tab
packages/dashboard/src/routes/AgentsListPage.tsx       # add trend widget (or landing)
```

**Inbound-reference sweep targets (Phase 1):**
Any markdown file or skill description that mentions `CLAUDE.md` in the context of this repo needs updating to `AGENTS.md`. Identified at sweep-time via `grep -rn "CLAUDE\.md" --include='*.md' --include='*.ts' --include='*.sh' .`.

---

## Ticket #1 — Phase 1 Foundation

**Files:**

- Create: `.agents/README.md`, `.agents/architecture.md`, `.agents/local-dev.md`, `.agents/testing.md`, `.agents/dispatch.md`, `.agents/security.md`, `.agents/design-system.md`, `.agents/workflow.md`, `.agents/commands.md` (all as empty stubs with frontmatter only)
- Create: `packages/cli/AGENTS.md`, `packages/daemon/AGENTS.md`, `packages/dashboard/AGENTS.md`, `packages/shared/AGENTS.md` (template stubs)
- Create: `docs/rationale/` directory (initially empty; `.gitkeep` until ticket #2 populates it)
- Create: `scripts/validate-agents-frontmatter.ts`, `scripts/validate-agents-frontmatter.test.ts`
- Create: `scripts/baseline-metrics-capture.ts` (one-time use)
- Rename: `CLAUDE.md` → `AGENTS.md`, then edit to add the topic index while preserving the existing content sections
- Modify: `package.json` (add validator script to `lint` chain)
- Modify: inbound-reference sweep (CLAUDE.md → AGENTS.md text replacements)

### Step 1: Branch from main

- [ ] Create the working branch.

```bash
git checkout main
git pull --ff-only origin main
git checkout -b feat/ticket-1-agents-foundation
```

### Step 2: Write the validator script tests (TDD red)

- [ ] Create `scripts/validate-agents-frontmatter.test.ts` with the failing test cases.

```typescript
import { describe, it, expect } from 'vitest';
import { validateFrontmatter, type ValidationResult } from './validate-agents-frontmatter.js';

describe('validateFrontmatter', () => {
  it('passes a fully-valid .agents topic doc', () => {
    const content = `---
name: architecture
description: 4-package layering rules + dependency direction
last_updated: 2026-05-13
covers:
  - "packages/*/src/**/*.ts"
  - "package.json"
---

# Architecture
content here
`;
    const result = validateFrontmatter(content, '.agents/architecture.md');
    expect(result.ok).toBe(true);
  });

  it('fails when the name field is missing', () => {
    const content = `---
description: missing name
last_updated: 2026-05-13
covers: ["**"]
---
`;
    const result = validateFrontmatter(content, '.agents/architecture.md');
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('missing required field: name');
  });

  it('fails when filename does not match name field', () => {
    const content = `---
name: architecture
description: x
last_updated: 2026-05-13
covers: ["**"]
---
`;
    const result = validateFrontmatter(content, '.agents/local-dev.md');
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) =>
        e.includes('name "architecture" does not match filename "local-dev"'),
      ),
    ).toBe(true);
  });

  it('fails when last_updated is not ISO date', () => {
    const content = `---
name: architecture
description: x
last_updated: yesterday
covers: ["**"]
---
`;
    const result = validateFrontmatter(content, '.agents/architecture.md');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('last_updated'))).toBe(true);
  });

  it('fails when a covers glob is invalid micromatch', () => {
    const content = `---
name: architecture
description: x
last_updated: 2026-05-13
covers:
  - "packages/**[invalid"
---
`;
    const result = validateFrontmatter(content, '.agents/architecture.md');
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes('invalid micromatch'))).toBe(true);
  });

  it('passes a per-package AGENTS.md with the lighter schema (no covers)', () => {
    const content = `---
description: Patterns and rules for the crew-cli package
last_updated: 2026-05-13
---
`;
    const result = validateFrontmatter(content, 'packages/cli/AGENTS.md');
    expect(result.ok).toBe(true);
  });
});
```

### Step 3: Run tests to confirm they fail

- [ ] Verify the tests fail with "module not found".

```bash
npx vitest run scripts/validate-agents-frontmatter.test.ts
```

Expected: FAIL — module `./validate-agents-frontmatter.js` not found.

### Step 4: Implement the validator (minimal)

- [ ] Create `scripts/validate-agents-frontmatter.ts`.

```typescript
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { glob } from 'glob';
import * as yaml from 'js-yaml';
import micromatch from 'micromatch';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

interface AgentsFrontmatter {
  name?: string;
  description?: string;
  last_updated?: string;
  covers?: string[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function validateFrontmatter(content: string, filePath: string): ValidationResult {
  const errors: string[] = [];
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    errors.push('missing frontmatter block');
    return { ok: false, errors };
  }

  let fm: AgentsFrontmatter;
  try {
    fm = yaml.load(match[1]) as AgentsFrontmatter;
  } catch (e) {
    errors.push(`yaml parse failed: ${(e as Error).message}`);
    return { ok: false, errors };
  }

  const isTopicDoc = filePath.startsWith('.agents/') && !filePath.endsWith('/README.md');
  const isPackageAgents = /^packages\/[^/]+\/AGENTS\.md$/.test(filePath);

  if (isTopicDoc) {
    if (!fm.name) errors.push('missing required field: name');
    if (!fm.description) errors.push('missing required field: description');
    if (!fm.last_updated) errors.push('missing required field: last_updated');
    if (!fm.covers || !Array.isArray(fm.covers) || fm.covers.length === 0) {
      errors.push('missing required field: covers (must be non-empty array)');
    }

    if (fm.name) {
      const expectedName = path.basename(filePath, '.md');
      if (fm.name !== expectedName) {
        errors.push(`name "${fm.name}" does not match filename "${expectedName}"`);
      }
    }

    if (fm.last_updated && !ISO_DATE.test(fm.last_updated)) {
      errors.push(`last_updated must be ISO date (YYYY-MM-DD), got: ${fm.last_updated}`);
    }

    if (fm.covers && Array.isArray(fm.covers)) {
      for (const pattern of fm.covers) {
        try {
          micromatch.makeRe(pattern);
        } catch {
          errors.push(`invalid micromatch pattern in covers: ${pattern}`);
        }
      }
    }
  } else if (isPackageAgents) {
    if (!fm.description) errors.push('missing required field: description');
    if (!fm.last_updated) errors.push('missing required field: last_updated');
    if (fm.last_updated && !ISO_DATE.test(fm.last_updated)) {
      errors.push(`last_updated must be ISO date (YYYY-MM-DD), got: ${fm.last_updated}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export async function validateAll(repoRoot: string): Promise<ValidationResult> {
  const errors: string[] = [];
  const topicFiles = await glob('.agents/*.md', { cwd: repoRoot, ignore: ['.agents/README.md'] });
  const packageFiles = await glob('packages/*/AGENTS.md', { cwd: repoRoot });

  for (const file of [...topicFiles, ...packageFiles]) {
    const content = await fs.readFile(path.join(repoRoot, file), 'utf8');
    const result = validateFrontmatter(content, file);
    if (!result.ok) {
      errors.push(`${file}:`);
      for (const e of result.errors) errors.push(`  - ${e}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

async function main() {
  const result = await validateAll(process.cwd());
  if (!result.ok) {
    console.error('AGENTS frontmatter validation failed:');
    for (const e of result.errors) console.error(e);
    process.exit(1);
  }
  console.log('AGENTS frontmatter validation: ok');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
```

### Step 5: Install validator deps if missing

- [ ] Add `js-yaml`, `glob`, `micromatch` if not already deps; their `@types/` packages too.

```bash
npm install --save-dev js-yaml glob micromatch @types/js-yaml @types/micromatch
```

### Step 6: Run tests to confirm pass

- [ ] Verify all 6 test cases pass.

```bash
npx vitest run scripts/validate-agents-frontmatter.test.ts
```

Expected: PASS — 6/6.

### Step 7: Wire validator into npm scripts

- [ ] Edit `package.json` root: add a `lint:agents` script and chain it into `lint`.

```json
{
  "scripts": {
    "lint:agents": "tsx scripts/validate-agents-frontmatter.ts",
    "lint": "eslint packages && npm run lint:agents"
  }
}
```

Run to confirm wiring:

```bash
npm run lint:agents
```

Expected: fails because `.agents/` doesn't exist yet — confirms the wiring is in place. Move to next step (we'll un-fail it as we create the stub files).

### Step 8: Create `.agents/` and `docs/rationale/` directories with stubs

- [ ] Create each stub file. Frontmatter only, no body content. Use today's ISO date for `last_updated`.

`.agents/README.md` (meta-doc — special: no `name`/`covers` required since it isn't a topic doc):

```markdown
---
description: How the .agents/ system works and how to extend it
last_updated: 2026-05-13
---

# .agents/ — repo-scoped topic docs for AI agents

_Stub. Populated in ticket #1's later steps._
```

`.agents/architecture.md` (and the other 7 topic docs, substituting name/description/covers per spec):

```markdown
---
name: architecture
description: 4-package layering rules + dependency direction
last_updated: 2026-05-13
covers:
  - 'packages/*/src/**/*.ts'
  - 'package.json'
---

# Architecture

_Stub. Populated in ticket #2._
```

Use the following frontmatter for each:

| File                       | `name`          | `description`                                                  | `covers` (yaml list)                                                                        |
| -------------------------- | --------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `.agents/architecture.md`  | `architecture`  | `4-package layering rules + dependency direction`              | `packages/*/src/**/*.ts`, `package.json`                                                    |
| `.agents/local-dev.md`     | `local-dev`     | `Docker stack, env.toml, worktree isolation, sandbox baseline` | `docker-compose*.yml`, `env.toml`, `packages/daemon/seeds/**`                               |
| `.agents/testing.md`       | `testing`       | `Bruno + Playwright + daemon fixtures`                         | `bruno/**`, `packages/*/src/**/*.test.ts`, `packages/dashboard/tests/**`                    |
| `.agents/dispatch.md`      | `dispatch`      | `crew run prompt-build, skills injection, verification gates`  | `packages/cli/src/lib/{run,prompts,skills,preflight,figma-snapshot}/**`                     |
| `.agents/security.md`      | `security`      | `Secrets handling, sandbox model + known limitations`          | `**/.env*`, `**/secrets/**`, `.claude/settings*.json`                                       |
| `.agents/design-system.md` | `design-system` | `Crew Figma DS + Pill contract`                                | `packages/dashboard/src/components/**`, `*.figma.tsx`, `packages/dashboard/components.json` |
| `.agents/workflow.md`      | `workflow`      | `CREW-* tickets, followups, specs/plans, branching`            | `docs/tickets/**`, `docs/superpowers/**`, `docs/followups.md`, `docs/mumen/**`              |
| `.agents/commands.md`      | `commands`      | `npm scripts cheatsheet with env-var notes`                    | `package.json`, `packages/*/package.json`                                                   |

- [ ] Create `docs/rationale/.gitkeep` so the empty directory commits.

### Step 9: Write the meta-doc body

- [ ] Replace the `.agents/README.md` stub with the full meta-doc content per the spec's "Meta-doc structure" section. Content includes: what this is, discovery model, frontmatter spec table, when to add a topic file (3-criteria gate), when to split into a folder, parity rule, staleness gauge (30/90-day buckets), trigger system note, naming conventions, what-does-NOT-belong taxonomy (with the rationale-vs-pointer clarification), and the manually-maintained "Index of current topic docs" table.

Copy the full text from the spec verbatim (the spec section is already in the agreed final form).

### Step 10: Rename `CLAUDE.md` → `AGENTS.md` and add the topic index

- [ ] Rename the file. Preserve original content sections — they're the source material for Phase 2 tickets.

```bash
git mv CLAUDE.md AGENTS.md
```

- [ ] Edit the new root `AGENTS.md`: add the topic index near the top, immediately after the "Repo layout" section. The verbose content stays for now (per the spec's resolved ambiguity — final cleanup at end of Phase 2).

Insert this block in AGENTS.md:

```markdown
## When you need it

| Doing                                                                 | Read                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------ |
| Editing daemon services/routes                                        | `.agents/architecture.md`, `packages/daemon/AGENTS.md` |
| Adding/changing a CLI subcommand                                      | `.agents/architecture.md`, `packages/cli/AGENTS.md`    |
| Touching dispatch flow (run/fix-pr/finish, prompts, skills injection) | `.agents/dispatch.md`                                  |
| Adding or changing an HTTP route                                      | `.agents/architecture.md`, `.agents/testing.md`        |
| Adding a Bruno endpoint                                               | `.agents/testing.md`                                   |
| Sandbox / host-network / secrets behavior                             | `.agents/local-dev.md`, `.agents/security.md`          |
| Touching `docker-compose`, `env.toml`, worktree port hashing          | `.agents/local-dev.md`                                 |
| Working on the Figma DS or Pill components                            | `.agents/design-system.md`                             |
| Filing followups, writing tickets/specs/plans, branching              | `.agents/workflow.md`                                  |
| Running verification (lint/typecheck/test/bruno/visual-fidelity)      | `.agents/commands.md`                                  |

See [`.agents/README.md`](.agents/README.md) for how this system works and how to extend it.

> _Below this section, content is being migrated into `.agents/` during the Phase 2 rollout. Once migration completes, this file shrinks to the index above._
```

### Step 11: Create per-package AGENTS.md stubs

- [ ] Create `packages/cli/AGENTS.md`:

```markdown
---
description: Patterns and rules for the crew-cli package
last_updated: 2026-05-13
---

# crew-cli

Thin command-line wrapper. Subcommands parse args, call `shared/`, render output. No business logic in subcommands themselves.

## Rules specific to this package

- Each subcommand in `src/commands/<name>.ts` is a thin wrapper. Business logic lives in `src/lib/` or `packages/shared/`.
- Lib subdirs (`run/`, `prompts/`, `skills/`, `preflight/`, `figma-snapshot/`, `bruno-smoke/`, `db-clone/`, `jira/`, `github/`, `playwright/`) each own one concern. Don't cross-import between sibling lib subdirs without explicit reason.
- New subcommands register in `src/index.ts`; the command shape is `crew <name>`.

## When you need it

| Doing                                                   | Read                                                                  |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| Adding/modifying a subcommand                           | `.agents/architecture.md`                                             |
| Changing dispatch flow (run, prompts, skills injection) | `.agents/dispatch.md`                                                 |
| Touching anything in `bruno/`                           | `.agents/testing.md`, user-level `bruno-collection-maintenance` skill |
| Sandbox / host-network considerations in subcommands    | `.agents/local-dev.md`, `.agents/security.md`                         |
| Running verification before claiming done               | `.agents/commands.md`                                                 |

## Common gotchas

_To be populated as gotchas are surfaced in Phase 2._
```

- [ ] Create `packages/daemon/AGENTS.md`:

```markdown
---
description: Patterns and rules for the crew-daemon package
last_updated: 2026-05-13
---

# crew-daemon

Long-running state-tracking process. Watches transcripts, persists run state to SQLite, exposes REST + SSE for CLI and dashboard.

## Rules specific to this package

- Stack: Fastify + `fastify-type-provider-zod`, Kysely + `kysely-better-sqlite3`, `@fastify/awilix` for DI, pino for logging, chokidar for FS watching.
- Routes are thin: parse + validate input (Zod), call service, return result. No business logic in `routes/`.
- Services own the business logic. One service per domain (`AgentsService`, `ProjectsService`, etc).
- Migrations are numbered TypeScript files in `src/migrations/`. New migration = new number; never edit a shipped migration.
- The daemon never reads from disk for things the CLI can pass via API. Trust the CLI to send what it knows.

## When you need it

| Doing                                        | Read                                                                        |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| Writing a new route or service               | `.agents/architecture.md`, user-level `reaching-for-backend-patterns` skill |
| Adding a Bruno endpoint to cover a new route | `.agents/testing.md`, `bruno-collection-maintenance` skill                  |
| Schema changes / new migration               | `.agents/architecture.md`                                                   |
| Running verification                         | `.agents/commands.md`                                                       |

## Common gotchas

_To be populated._
```

- [ ] Create `packages/dashboard/AGENTS.md`:

```markdown
---
description: Patterns and rules for the crew-dashboard package
last_updated: 2026-05-13
---

# crew-dashboard

React + Vite + Tailwind web UI. Single-page app. No business logic — view over the daemon's API. Live updates via SSE.

## Rules specific to this package

- No business logic in this package. Data comes from the daemon's REST/SSE.
- Components split: cross-section primitives → `src/components/ui/`; feature-scoped → `src/components/<feature>/`.
- Tailwind utilities for styling. Global tokens in `index.css` `@theme` block.
- Tests: Vitest + React Testing Library + jsdom (existing setup).

## When you need it

| Doing                                   | Read                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| Writing a React component               | `.agents/architecture.md`, user-level `reaching-for-frontend-libraries` skill |
| Touching the Figma DS / Pill components | `.agents/design-system.md`, user-level `visual-fidelity-check` skill          |
| Adding e2e Playwright tests             | `.agents/testing.md`                                                          |
| Running verification                    | `.agents/commands.md`                                                         |

## Common gotchas

_To be populated._
```

- [ ] Create `packages/shared/AGENTS.md`:

```markdown
---
description: Patterns and rules for the crew-shared package
last_updated: 2026-05-13
---

# crew-shared

The leaf of the dependency graph. Types, transcript parsers, project config, Jira/GitHub clients, docker introspection.

## Rules specific to this package

- **No imports from `cli/`, `daemon/`, or `dashboard/`.** This package is the leaf — anything it depends on must be external.
- Types-only files go in `src/<concern>/types.ts`. Runtime code goes in named modules.
- Tests live alongside source: `foo.ts` + `foo.test.ts`.

## When you need it

| Doing                      | Read                      |
| -------------------------- | ------------------------- |
| Adding a new shared module | `.agents/architecture.md` |
| Running verification       | `.agents/commands.md`     |

## Common gotchas

_To be populated._
```

### Step 12: Run the validator — expect pass now

- [ ] Confirm validator passes against all stub files.

```bash
npm run lint:agents
```

Expected: `AGENTS frontmatter validation: ok`.

### Step 13: Write the baseline-metrics-capture script

- [ ] Create `scripts/baseline-metrics-capture.ts`. This is a one-time throwaway. It reads the last 20 `crew run` runs from the daemon DB and computes pre-deployment baseline rows for Metrics 2 (cleanliness pass rate) and Metric 3 (context size at PR-claim).

**Note:** Metrics 1 (doc-load coverage) and 4 (parity violations) are undefined pre-deployment (no `.agents/` exists yet) and don't have baseline values. The spec's "baseline=true" flag still applies — it marks rows from this pre-deployment capture so post-deployment comparison knows which rows are reference.

```typescript
import SqliteDatabase from 'better-sqlite3';
import * as path from 'node:path';
import * as os from 'node:os';
import { promises as fs } from 'node:fs';

const DB_PATH = path.join(os.homedir(), '.config', 'crew', 'state.db');
const CLEANLINESS_COMMANDS = [
  'npm run lint',
  'npm run typecheck',
  'npm run test:run',
  'npm run format:check',
  'npm run bruno:smoke',
];

async function readTranscript(jsonlPath: string): Promise<unknown[]> {
  const raw = await fs.readFile(jsonlPath, 'utf8');
  return raw
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function extractBashCommands(events: unknown[]): string[] {
  const out: string[] = [];
  for (const ev of events as Array<{
    message?: { content?: Array<{ type: string; name?: string; input?: { command?: string } }> };
  }>) {
    const items = ev.message?.content ?? [];
    for (const item of items) {
      if (item.type === 'tool_use' && item.name === 'Bash' && item.input?.command) {
        out.push(item.input.command);
      }
    }
  }
  return out;
}

function countCleanlinessChecks(commands: string[]): number {
  return CLEANLINESS_COMMANDS.filter((c) => commands.some((b) => b.includes(c))).length;
}

function lastInputTokens(events: unknown[]): number {
  const ev = events as Array<{ message?: { usage?: { input_tokens?: number } } }>;
  for (let i = ev.length - 1; i >= 0; i--) {
    const usage = ev[i].message?.usage;
    if (usage?.input_tokens) return usage.input_tokens;
  }
  return 0;
}

async function main() {
  const db = new SqliteDatabase(DB_PATH);
  // Read last 20 runs of command='run' with a completed transcript
  const rows = db
    .prepare(
      `SELECT runs.id, runs.session_id, runs.agent_key, agents.worktree_path
       FROM runs JOIN agents ON agents.key = runs.agent_key
       WHERE runs.command = 'run' AND runs.completed_at IS NOT NULL
       ORDER BY runs.completed_at DESC LIMIT 20`,
    )
    .all() as Array<{ id: number; session_id: string; agent_key: string; worktree_path: string }>;

  // Ensure run_metrics columns exist (migration #11 will create them properly later;
  // this script anticipates that schema or creates a holding table)
  db.exec(`CREATE TABLE IF NOT EXISTS baseline_metrics (
    run_id INTEGER PRIMARY KEY,
    cleanliness_pass_count INTEGER,
    pr_claim_input_tokens INTEGER,
    captured_at TEXT NOT NULL
  )`);

  for (const row of rows) {
    // Locate transcript file by session_id under ~/.claude/projects/
    const projectsDir = path.join(os.homedir(), '.claude', 'projects');
    // Find any *.jsonl matching session_id under any project subdir
    let transcriptPath: string | null = null;
    const projectDirs = await fs.readdir(projectsDir);
    for (const pdir of projectDirs) {
      const candidate = path.join(projectsDir, pdir, `${row.session_id}.jsonl`);
      try {
        await fs.access(candidate);
        transcriptPath = candidate;
        break;
      } catch {
        // not found in this dir, keep searching
      }
    }
    if (!transcriptPath) {
      console.warn(`run ${row.id}: transcript not found for session ${row.session_id}`);
      continue;
    }
    const events = await readTranscript(transcriptPath);
    const commands = extractBashCommands(events);
    const cleanlinessCount = countCleanlinessChecks(commands);
    const tokens = lastInputTokens(events);
    db.prepare(
      `INSERT OR REPLACE INTO baseline_metrics (run_id, cleanliness_pass_count, pr_claim_input_tokens, captured_at)
       VALUES (?, ?, ?, ?)`,
    ).run(row.id, cleanlinessCount, tokens, new Date().toISOString());
    console.log(
      `run ${row.id}: cleanliness=${cleanlinessCount}/${CLEANLINESS_COMMANDS.length}, tokens=${tokens}`,
    );
  }
  console.log('baseline capture complete');
  db.close();
}

void main();
```

- [ ] Run the script to capture the baseline.

```bash
npx tsx scripts/baseline-metrics-capture.ts
```

Expected: 20 lines of `run X: cleanliness=N/5, tokens=M` followed by `baseline capture complete`.

### Step 14: Sweep inbound references to CLAUDE.md

- [ ] Grep for and update any reference to `CLAUDE.md` that means _this repo's_ root doc. **Do not** update references to user-level `~/.claude/CLAUDE.md` or to other projects' CLAUDE.md.

```bash
grep -rn 'CLAUDE\.md' --include='*.md' --include='*.ts' --include='*.sh' . | grep -v node_modules | grep -v '\.git/'
```

For each hit:

- If it points at the repo root (now `AGENTS.md`): change `CLAUDE.md` → `AGENTS.md`.
- If it points at user-level `~/.claude/CLAUDE.md`: leave alone.
- If unclear: skip and surface in PR description as a manual-review item.

### Step 15: Cleanliness check + commit

- [ ] Run full cleanliness.

```bash
npm run lint && npm run format:check && npm run typecheck && npm run test:run
```

Expected: all green.

- [ ] Commit.

```bash
git add .
git commit -m "feat: AGENTS.md + .agents/ scaffold + validator + baseline (CREW-?)"
```

### Step 16: Open the Phase 1 PR

- [ ] Push and open PR. Title: `feat: AGENTS.md + .agents/ scaffold + validator + baseline`. Body should include the Phase 1 step list as a manual-verify checklist for the reviewer.

```bash
git push -u origin feat/ticket-1-agents-foundation
gh pr create --title "feat: AGENTS.md + .agents/ scaffold + validator + baseline" --body "..."
```

---

## Tickets #2–9 — Phase 2 Topic doc migrations

Each ticket follows the same procedural shape. Below: the canonical steps once (for ticket #2 — `architecture`), then per-ticket sections that name **source(s)**, **target**, **`covers:`**, **rationale extraction target**, and call back to the canonical steps with substituted paths.

The canonical procedure is documented in ticket #2 in full. Tickets #3–#9 list their specific inputs and any topic-specific gotchas; otherwise they execute the same step sequence.

### Ticket #2 — `.agents/architecture.md`

**Files:**

- Create/edit: `.agents/architecture.md` (replace stub with full content)
- Modify: `AGENTS.md` (fill in matching index entry; remove the inline content sections that are now in `.agents/architecture.md`)
- Modify: `packages/<pkg>/AGENTS.md` (update "When you need it" if architecture is mentioned)
- Create: `docs/rationale/architecture.md` (rationale-portion extraction)
- Delete: `docs/plans/architecture.md` (after content audit)

### Step 1: Branch and read source

- [ ] Branch from main.

```bash
git checkout main && git pull --ff-only origin main
git checkout -b feat/ticket-2-agents-architecture
```

- [ ] Read the source doc completely.

```bash
cat docs/plans/architecture.md
```

### Step 2: Content audit — classify each section

- [ ] In a scratch buffer (or directly in the PR description draft), walk `docs/plans/architecture.md` section-by-section and tag each as one of:
  - **A — Agent-actionable rule** (target: `.agents/architecture.md`)
  - **R — Rationale / historical narrative** (target: `docs/rationale/architecture.md`)
  - **S — Stale / superseded** (target: deletion; note "removed because: ..." in PR)

For `architecture.md` specifically:

- "Context" section → R (origin story, why crew exists)
- "Audience", "Non-goals" → R
- "Tech stack" table → A (current rules; condense bullet list of "use X for Y")
- "Architecture overview" + 4 sub-sections (CLI/Daemon/Dashboard/Shared modules) → A (these are the load-bearing layering rules)
- "State store", "Per-project config" → A
- "Phases" + sub-phases → R (historical roadmap)
- "Migration path for Recipes-App" → R
- "Open questions" → split: any still open → A; settled questions → R
- "Conventions inherited from Recipes-App" → A

### Step 3: Author `.agents/architecture.md`

- [ ] Replace the stub at `.agents/architecture.md` with the full content. Frontmatter stays the same except `last_updated` bumps to today's date. Body contains the A-tagged content from the audit, condensed and re-written for agent consumption (rules-first, no narrative).

Suggested structure for `.agents/architecture.md`:

```markdown
---
name: architecture
description: 4-package layering rules + dependency direction
last_updated: 2026-05-13
covers:
  - 'packages/*/src/**/*.ts'
  - 'package.json'
---

# Architecture

Four-package npm workspace. Dependency direction is one-way:
`cli` → `shared`, `daemon` → `shared`, `dashboard` → daemon's HTTP API.
`shared` is the leaf — it imports from nothing in this repo.

## Package layering rules

- **CLI** (`packages/cli/`) — subcommand wrappers. Each command parses args, validates input, and calls `shared/` or talks to the daemon. **No business logic in the CLI itself.**
- **Daemon** (`packages/daemon/`) — Fastify HTTP + SSE + SQLite state. Routes are thin; services own logic. **The daemon never reads disk for things the CLI can pass.**
- **Dashboard** (`packages/dashboard/`) — React + Vite. View over the daemon's API. **No business logic — purely presentational.**
- **Shared** (`packages/shared/`) — types, transcript parsers, project config, Jira/GitHub clients, docker introspection. **No imports from `cli/`, `daemon/`, or `dashboard/`.**

## Tech stack (current)

| Concern     | Pick                                       | Notes                               |
| ----------- | ------------------------------------------ | ----------------------------------- |
| Language    | TypeScript                                 | strict mode, `verbatimModuleSyntax` |
| Runtime     | Node 22+ via `tsx` for dev                 | no build step in dev                |
| Arg parsing | commander                                  |                                     |
| Subprocess  | execa                                      | for git/docker/gh/claude            |
| HTTP server | Fastify + `fastify-type-provider-zod`      | daemon only                         |
| DB          | Kysely + `kysely-better-sqlite3`           | daemon only                         |
| DI          | `@fastify/awilix`                          | daemon only                         |
| FS watching | chokidar                                   | daemon only                         |
| Testing     | Vitest + React Testing Library (frontend)  | tests live alongside source         |
| Logging     | pino (daemon), `picocolors` for CLI stdout |                                     |

For the _why_ behind these picks, see [`docs/rationale/architecture.md`](../docs/rationale/architecture.md).

## Per-project config

Per-project TOML at `~/.config/crew/projects/<name>.toml`. Auto-discovered when `crew` is invoked from inside a registered repo. **Nothing project-specific is hardcoded in code** — all customization flows through the loaded project config.

## State store

SQLite at `~/.config/crew/state.db`. Schema lives in `packages/daemon/src/db.ts` + numbered migrations in `packages/daemon/src/migrations/`. **Never edit a shipped migration; add a new numbered file instead.**

## Inherited conventions

- LF line endings via `.gitattributes` (universal).
- `.tsbuildinfo` files always gitignored.
- "Refuse to clobber files we didn't generate" — tag generated files with a `# generated by crew` header and refuse to overwrite without it.
- TOML over JSON for human-edited config.

See [`docs/rationale/architecture.md`](../docs/rationale/architecture.md) for the why behind these.
```

### Step 4: Create `docs/rationale/architecture.md`

- [ ] Copy R-tagged content from `docs/plans/architecture.md` into a new `docs/rationale/architecture.md`. Keep the original prose voice and structure for the rationale doc — it's read by humans, not agents.

Frontmatter is optional here (rationale docs aren't in `.agents/`). Use a light header:

```markdown
# Architecture — rationale & history

Background and design rationale for crew's architecture. The current rules live in [`.agents/architecture.md`](../../.agents/architecture.md); this file captures the _why_ and historical evolution.

## Origin (from Recipes-App scripts)

[paste "Context" section]

## Audience and non-goals

[paste audience + non-goals]

## Phased rollout history

[paste "Phases" section]

## Migration path from Recipes-App

[paste "Migration path" section]

## Settled open questions

[paste settled open questions; keep the "Open questions" framing for transparency]
```

### Step 5: Update root `AGENTS.md`

- [ ] In root `AGENTS.md`, locate the inline content sections that just migrated (architecture rules, tech stack, layering, state store). Remove them. The index entry already points at `.agents/architecture.md`.

The "Architecture rules" section of the current AGENTS.md (formerly CLAUDE.md) is the prime candidate for removal. Verify by re-reading both before deleting.

### Step 6: Update per-package AGENTS.md "When you need it"

- [ ] In each `packages/<pkg>/AGENTS.md` whose "When you need it" mentions `.agents/architecture.md`, verify the entry still makes sense after the migration. Adjust descriptions if architecture coverage changed.

### Step 7: Delete the source

- [ ] Remove `docs/plans/architecture.md` once the content audit is complete and R-content has its new home.

```bash
git rm docs/plans/architecture.md
```

### Step 8: Validator + cleanliness check

- [ ] Run validator.

```bash
npm run lint:agents
```

Expected: pass.

- [ ] Run full cleanliness.

```bash
npm run lint && npm run format:check && npm run typecheck && npm run test:run
```

Expected: pass.

### Step 9: Bump `last_updated`

- [ ] Confirm `.agents/architecture.md` frontmatter `last_updated` is today's ISO date.

### Step 10: Commit and PR

- [ ] Commit. PR description includes the full content-audit table from Step 2 (which sections were A/R/S, and S-tagged sections include a one-line "removed because" justification).

```bash
git add .
git commit -m "feat(.agents): migrate architecture topic doc + rationale extraction (CREW-?)"
git push -u origin feat/ticket-2-agents-architecture
gh pr create --title "feat(.agents): migrate architecture topic" --body "..."
```

---

### Ticket #3 — `.agents/local-dev.md`

**Sources:**

- Root `AGENTS.md` "Local development" section (inline content that survived ticket #1)
- `docs/plans/project-resolution.md` (full file)

**Target:** `.agents/local-dev.md`

**`covers:`** (from spec): `docker-compose*.yml`, `env.toml`, `packages/daemon/seeds/**`

**Rationale extraction:** `project-resolution.md` is mostly mechanical rules; rationale extraction expected to be minimal. If any narrative is identified, target is `docs/rationale/project-resolution.md`. Otherwise no rationale file is created.

**Execution:** Follow Ticket #2 Steps 1–10, substituting paths. Content audit (Step 2) classifies each section of both source files. Final cleanup deletes both sources.

**Topic-specific content to include in `.agents/local-dev.md`:**

- Hot-reload behavior (daemon `tsx watch`, dashboard Vite)
- Worktree DBs are ephemeral and seeded; `CREW_SEED_FIXTURES=1` runs seeds
- `env.toml` is the source of truth for per-worktree env vars; `${VAR}` syntax not `{httpPort}`
- `.claude/settings.json` sandbox baseline + `excludedCommands`
- ECONNREFUSED gotcha for sandboxed network calls to `localhost`
- Per-worktree docker port hashing convention
- Project resolution / discovery: how `crew` finds the active project from cwd

---

### Ticket #4 — `.agents/testing.md`

**Sources:**

- Root `AGENTS.md` "Bruno collection" section
- Scattered Bruno/Playwright/fixture references across the codebase (grep at content-audit time)

**Target:** `.agents/testing.md`

**`covers:`** (from spec): `bruno/**`, `packages/*/src/**/*.test.ts`, `packages/dashboard/tests/**`

**Rationale extraction:** likely none. No rationale file created unless an R-section surfaces.

**Execution:** Follow Ticket #2 Steps 1–10. Step 2's content audit cross-references the user-level `bruno-collection-maintenance` skill — content already covered by that skill is **not** duplicated; the topic doc links to it.

**Topic-specific content to include:**

- Bruno collection layout (`bruno/endpoints/<group>/<verb>-<name>.bru`, flows, `bruno/environments/` is gitignored)
- The same-commit rule: Bruno file updates with route changes
- Sandboxed vs un-sandboxed test runs (the `excludedCommands` exception for `bruno:smoke` + `test:e2e`)
- Playwright config (existing `playwright.config.ts` in dashboard; how to run e2e locally)
- Daemon fixture seeding via `CREW_SEED_FIXTURES`
- Pointer to user-level `bruno-collection-maintenance` skill for triggering events

---

### Ticket #5 — `.agents/dispatch.md`

**Source:** New synthesis from `packages/cli/src/lib/{run,prompts,skills,preflight,figma-snapshot}/`. There's no single existing doc to migrate.

**Target:** `.agents/dispatch.md`

**`covers:`** (from spec): `packages/cli/src/lib/{run,prompts,skills,preflight,figma-snapshot}/**`

**Rationale extraction:** none — this is a synthesis doc. No source doc to delete.

**Execution:** Modified Ticket #2 procedure — skip Step 2 (no content audit; new content), skip Step 4 (no rationale extraction), skip Step 7 (no source to delete). Steps 1, 3, 5, 6, 8, 9, 10 still apply.

**Topic-specific content to include:**

- Dispatch flow narrative: worktree creation → env.toml materialization → docker bringup → MCP config write → skills injection → prompt build → Claude launch → transcript watch → result reporting
- The `preflight/` step: probe URLs, verify excluded commands, build checks
- The `prompts/` builder: how `buildTicketPrompt` composes ticket-body + bruno-smoke block + visual-fidelity block + discovered-skills block + sandbox-network note
- The `skills/` injection: which skills get copied into the worktree's `.claude/skills/` at dispatch time
- The `figma-snapshot/` integration: pre-dispatch enrichment with Plugin-API data
- Verification gates: visual-fidelity-pr-gate hook (existing), doc-parity-gate hook (Ticket #10)
- Pointer to the existing PR-quality / dispatch flow specs in `docs/superpowers/specs/` for historical context

---

### Ticket #6 — `.agents/security.md`

**Source:** `docs/plans/sandbox-limitations.md` (full file) + secrets refs from user-level CLAUDE.md (link, do not copy).

**Target:** `.agents/security.md`

**`covers:`** (from spec): `**/.env*`, `**/secrets/**`, `.claude/settings*.json`

**Rationale extraction:** any narrative in `sandbox-limitations.md` (e.g. "we hit this limitation because…") goes to `docs/rationale/sandbox-limitations.md`.

**Execution:** Follow Ticket #2 Steps 1–10 fully. Content-audit classification of `sandbox-limitations.md` distinguishes rules (the catalog of known limitations + workarounds) from rationale (the narrative about _why_ a given limitation exists).

**Topic-specific content to include:**

- Secrets handling: never read `.env*`, `secrets/`, `credentials*`, `*token*` files; pointer to user-level CLAUDE.md "Secrets" section for the universal rule
- Sandbox model overview: `.claude/settings.json` baseline, `excludedCommands` exception path, `allowedDomains` network allowlist
- Catalog of known sandbox limitations (from `sandbox-limitations.md`) with their workarounds
- "Refuse to clobber files we didn't generate" rule for generated `.env*` / `settings.json` / `*.toml`
- Pointer to user-level CLAUDE.md for the "ask before reading sensitive files" override rule

---

### Ticket #7 — `.agents/design-system.md`

**Source:** `docs/plans/design-system.md` (441 lines — large; expect significant rationale extraction)

**Target:** `.agents/design-system.md`

**`covers:`** (from spec): `packages/dashboard/src/components/**`, `*.figma.tsx`, `packages/dashboard/components.json`

**Rationale extraction:** `docs/rationale/design-system.md` (expected to be substantial — the source has lots of historical evolution of the Pill system, palette decisions, etc.)

**Execution:** Follow Ticket #2 Steps 1–10. Step 2's audit is the largest of any Phase 2 ticket — expect 30+ sections to classify. Take time on it.

**Topic-specific content to include in `.agents/design-system.md`:**

- Pill contract: 6 types × 8 colors × 4 intensities = 192 variants (current state per memory)
- Token system: Crew Semantic Colors → tw/colors/slate aliasing strategy
- `components/ui/` vs `components/<feature>/` split rule (from user-level Node conventions; reaffirm here)
- Code Connect skipped (Pro plan limitation — `.figma.tsx` files are inert docs)
- Pointer to user-level `visual-fidelity-check` skill for verification before claiming UI-touching work done
- Crew's own visual-fidelity dogfooding status (referenced in the rolling B2 work; placeholder if not yet wired up)

---

### Ticket #8 — `.agents/workflow.md`

**Source:** Synthesis from user-level CLAUDE.md (planning workflow, branching, followup detection, conventions library) + repo conventions (CREW-\* tickets, `docs/tickets/_template.md`, `docs/superpowers/{specs,plans}/` naming, `docs/followups.md` location, mumen tier).

**Target:** `.agents/workflow.md`

**`covers:`** (from spec): `docs/tickets/**`, `docs/superpowers/**`, `docs/followups.md`, `docs/mumen/**`

**Rationale extraction:** none — this is a synthesis doc.

**Execution:** Modified Ticket #2 procedure (same shape as Ticket #5: no source doc to delete; no rationale extraction).

**Topic-specific content to include:**

- CREW-\* is the Jira prefix for this repo; tickets in this repo always start with CREW-
- Where each kind of doc lives (mirror the taxonomy from `.agents/README.md`'s "What does NOT belong" section)
- Branching convention for crew: `feat/<scope>`, `fix/<scope>`, `docs/<scope>` etc., matched against recent branches via `git log --oneline -10`
- Followups: `docs/followups.md` is the per-repo queue; the format is defined in user-level CLAUDE.md "Followup detection" section
- Tickets workflow: `docs/tickets/<KEY>.md` from `_template.md` for any non-trivial ticket
- Mumen tier: when scope fits a single unit of work but needs more than "just do it"; uses `docs/mumen/`
- Specs and plans: `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` (from brainstorming) and `docs/superpowers/plans/YYYY-MM-DD-<topic>.md` (from writing-plans)
- The "stop after planning + ticketing" rule for substantial work — implementation triggered by user via `crew run`

---

### Ticket #9 — `.agents/commands.md`

**Source:** Root `package.json` scripts + each package's `package.json` scripts. No prior doc to migrate.

**Target:** `.agents/commands.md`

**`covers:`** (from spec): `package.json`, `packages/*/package.json`

**Rationale extraction:** none.

**Execution:** Modified Ticket #2 procedure (no source doc, no rationale extraction).

**Topic-specific content to include:**

- The full "cleanliness check" command sequence to run before claiming work done: `npm run lint && npm run format:check && npm run typecheck && npm run test:run && npm run build`
- Bruno smoke: `npm run bruno:smoke` requires `CREW_BRUNO_ENV=local` (or similar) env var; failure mode without the env var
- E2E: `npm run test:e2e` (workspace-flagged to dashboard); local Docker stack must be up
- Per-package scripts not exposed at root: dashboard dev (`npm run dev --workspace=crew-dashboard`), daemon dev, etc.
- Docker stack commands: `docker compose up`, `docker compose down`, per-worktree COMPOSE_PROJECT_NAME considerations
- Format-on-save / format-fix: `npm run format` vs `npm run format:check`
- Lint-fix vs lint-check: `npm run lint:fix` vs `npm run lint`
- The validator: `npm run lint:agents` (alias of `tsx scripts/validate-agents-frontmatter.ts`)

### Step (Ticket #9 only): Final cleanup of root AGENTS.md inline content

Per the spec, the final ticket of Phase 2 also removes any remaining inline content sections from root `AGENTS.md`. By the time #9 is being worked, all topic-specific content should have migrated.

- [ ] In root `AGENTS.md`, remove the temporary "_Below this section, content is being migrated…_" notice and any leftover inline content sections. The file should now consist of: preamble (1-2 lines) + Repo layout block + topic index + a final pointer to `.agents/README.md`.

- [ ] Verify root `AGENTS.md` is under 60 lines (spec target).

```bash
wc -l AGENTS.md
```

Expected: ≤ 60.

- [ ] Also remove the `docs/plans/` directory itself if empty.

```bash
rmdir docs/plans 2>/dev/null || ls docs/plans
```

If `ls` reports anything, the directory is not empty — investigate and either move remaining files or note them in the PR.

---

## Ticket #10 — Phase 3 Soft doc-parity hook

**Files:**

- Create: `packages/cli/scripts/hooks/doc-parity-gate.sh`
- Create: `packages/cli/scripts/hooks/doc-parity-gate.test.sh`
- Modify: `.claude/settings.json` (register the new PreToolUse hook)

**Architecture:** Sibling to `visual-fidelity-pr-gate.sh`. Reads PreToolUse JSON from stdin. Gates `gh pr create` and `git commit` calls. Walks the active diff. For each `.agents/<topic>.md` whose `covers:` glob overlaps a changed path, checks whether the doc was touched in the same diff OR has a `last_updated` ≥ the current date. Warns (exit 1 with stderr message) if a parity violation is found; non-blocking (does **not** exit 2).

### Step 1: Branch and read the sibling hook

- [ ] Branch.

```bash
git checkout main && git pull --ff-only origin main
git checkout -b feat/ticket-10-doc-parity-hook
```

- [ ] Re-read `packages/cli/scripts/hooks/visual-fidelity-pr-gate.sh` and `visual-fidelity-pr-gate.test.sh` end-to-end. The new hook reuses the JSON-input + jq pattern.

### Step 2: Write the hook tests (TDD red)

- [ ] Create `packages/cli/scripts/hooks/doc-parity-gate.test.sh` using the same pattern as the sibling tests.

```bash
#!/usr/bin/env bash
#
# Tests for doc-parity-gate.sh.
#
# Each test sets up a fake working tree, fake diff, fake .agents/ topic docs,
# and pipes a mock PreToolUse payload into the hook.

set -euo pipefail
SCRIPT_DIR="$(dirname "$(readlink -f "$0")")"
HOOK="$SCRIPT_DIR/doc-parity-gate.sh"

pass=0
fail=0

run_test() {
  local name="$1"; shift
  local expected_exit="$1"; shift
  local payload="$1"; shift
  local repo_root="$1"; shift

  cd "$repo_root"
  local actual_exit=0
  printf '%s' "$payload" | "$HOOK" >/dev/null 2>&1 || actual_exit=$?

  if [[ "$actual_exit" -eq "$expected_exit" ]]; then
    echo "PASS: $name"
    pass=$((pass + 1))
  else
    echo "FAIL: $name (expected exit $expected_exit, got $actual_exit)"
    fail=$((fail + 1))
  fi
}

# Test 1: non-gh-pr-create command passes
tmp1=$(mktemp -d)
run_test "non-gated command passes" 0 \
  '{"tool_input":{"command":"ls"},"cwd":"'"$tmp1"'"}' "$tmp1"

# Test 2: gh pr create with no .agents/ docs in cwd passes
tmp2=$(mktemp -d)
mkdir -p "$tmp2/.git"
run_test "no .agents docs → pass" 0 \
  '{"tool_input":{"command":"gh pr create"},"cwd":"'"$tmp2"'"}' "$tmp2"

# Test 3: gh pr create with .agents doc whose covers matches a changed file BUT doc was also touched → pass
tmp3=$(mktemp -d)
mkdir -p "$tmp3/.agents" "$tmp3/.git/refs/heads"
cat > "$tmp3/.agents/architecture.md" <<EOF
---
name: architecture
description: x
last_updated: 2026-05-13
covers: ["packages/cli/**"]
---
EOF
# Fake a diff that touched both packages/cli/foo.ts AND .agents/architecture.md
cd "$tmp3"
git init -q
git add . && git -c user.email=t@t -c user.name=t commit -q -m initial
mkdir -p packages/cli
echo "x" > packages/cli/foo.ts
echo "updated" >> .agents/architecture.md
git add . && git -c user.email=t@t -c user.name=t commit -q -m "edit covered + doc"
run_test "doc updated alongside covered code → pass" 0 \
  '{"tool_input":{"command":"gh pr create"},"cwd":"'"$tmp3"'"}' "$tmp3"

# Test 4: gh pr create with .agents doc whose covers matches a changed file AND doc was NOT touched → warn (exit 1)
tmp4=$(mktemp -d)
mkdir -p "$tmp4/.agents"
cat > "$tmp4/.agents/architecture.md" <<EOF
---
name: architecture
description: x
last_updated: 2026-05-13
covers: ["packages/cli/**"]
---
EOF
cd "$tmp4"
git init -q
git add . && git -c user.email=t@t -c user.name=t commit -q -m initial
mkdir -p packages/cli
echo "x" > packages/cli/foo.ts
git add . && git -c user.email=t@t -c user.name=t commit -q -m "edit covered, no doc update"
run_test "covered code edited without doc → warn (exit 1)" 1 \
  '{"tool_input":{"command":"gh pr create"},"cwd":"'"$tmp4"'"}' "$tmp4"

# Cleanup
rm -rf "$tmp1" "$tmp2" "$tmp3" "$tmp4"

echo "---"
echo "$pass passed, $fail failed"
[[ "$fail" -eq 0 ]]
```

Make it executable.

```bash
chmod +x packages/cli/scripts/hooks/doc-parity-gate.test.sh
git update-index --add --chmod=+x packages/cli/scripts/hooks/doc-parity-gate.test.sh
```

### Step 3: Run tests to confirm they fail

- [ ] Run.

```bash
bash packages/cli/scripts/hooks/doc-parity-gate.test.sh
```

Expected: all 4 tests fail because `doc-parity-gate.sh` doesn't exist yet.

### Step 4: Implement the hook

- [ ] Create `packages/cli/scripts/hooks/doc-parity-gate.sh`.

```bash
#!/usr/bin/env bash
#
# PreToolUse hook for `gh pr create` and `git commit`. Walks the active diff,
# finds .agents/<topic>.md files whose `covers:` globs overlap any changed file,
# and warns if those docs were not touched in the same diff.
#
# Soft: exit 1 (warn) on violation. Never exits 2 (block).
#
# Expected stdin: PreToolUse payload with .tool_input.command and .cwd.

set -euo pipefail

input=$(cat)

# Only gate gh pr create and git commit
command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
case "$command" in
  "gh pr create"*) : ;;
  "git commit"*) : ;;
  *) exit 0 ;;
esac

cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
if [[ -z "$cwd" || ! -d "$cwd/.agents" ]]; then
  # No .agents/ in this cwd — nothing to check.
  exit 0
fi

# Gather changed files. For gh pr create, use the diff between current branch and main.
# For git commit, use staged changes.
cd "$cwd"
case "$command" in
  "gh pr create"*)
    # Get the merge-base with main (or default branch); diff against it.
    base=$(git merge-base HEAD main 2>/dev/null || git merge-base HEAD origin/main 2>/dev/null || echo "")
    if [[ -z "$base" ]]; then
      echo "doc-parity-gate: cannot determine merge base — skipping" >&2
      exit 0
    fi
    changed=$(git diff --name-only "$base" HEAD)
    ;;
  "git commit"*)
    changed=$(git diff --cached --name-only)
    ;;
esac

if [[ -z "$changed" ]]; then
  exit 0
fi

# Walk .agents/*.md and gather (file, covers globs).
violations=""
for doc in .agents/*.md; do
  [[ "$doc" == ".agents/README.md" ]] && continue

  # Extract covers: list using awk on the frontmatter block
  covers=$(awk '
    /^---$/ { count++; next }
    count == 1 && /^covers:/ { in_covers=1; next }
    in_covers && /^  - / { gsub(/^  - /, ""); gsub(/^"/, ""); gsub(/"$/, ""); print; next }
    in_covers && /^[^ ]/ { in_covers=0 }
    count == 2 { exit }
  ' "$doc")

  if [[ -z "$covers" ]]; then
    continue
  fi

  # Check if any changed file matches any covers glob
  doc_overlaps=false
  while IFS= read -r pattern; do
    [[ -z "$pattern" ]] && continue
    while IFS= read -r changed_file; do
      [[ -z "$changed_file" ]] && continue
      # Use git's glob matching via check-ignore semantics — fall back to bash glob with extglob
      shopt -s extglob globstar
      if [[ "$changed_file" == $pattern ]]; then
        doc_overlaps=true
        break 2
      fi
    done <<< "$changed"
  done <<< "$covers"

  if [[ "$doc_overlaps" == true ]]; then
    # Was the doc itself touched in the same diff?
    if ! echo "$changed" | grep -q "^$doc$"; then
      violations="$violations $doc"
    fi
  fi
done

if [[ -n "$violations" ]]; then
  echo "doc-parity-gate: warning — the following .agents/ docs cover changed code but were not updated:" >&2
  for v in $violations; do
    echo "  - $v" >&2
  done
  echo "" >&2
  echo "Review each and either update + bump last_updated, or confirm still-current." >&2
  echo "Override: re-run with CREW_DOC_PARITY_OVERRIDE=1 set, after stating your reason." >&2
  if [[ "${CREW_DOC_PARITY_OVERRIDE:-}" == "1" ]]; then
    echo "doc-parity-gate: override accepted." >&2
    exit 0
  fi
  exit 1
fi

exit 0
```

Make it executable.

```bash
chmod +x packages/cli/scripts/hooks/doc-parity-gate.sh
git update-index --add --chmod=+x packages/cli/scripts/hooks/doc-parity-gate.sh
```

### Step 5: Run tests to confirm pass

- [ ] Run.

```bash
bash packages/cli/scripts/hooks/doc-parity-gate.test.sh
```

Expected: `4 passed, 0 failed`.

### Step 6: Register the hook in `.claude/settings.json`

- [ ] Edit `.claude/settings.json` to add a PreToolUse entry alongside the existing `visual-fidelity-pr-gate`. Match the existing pattern (matchers, command path, type).

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "packages/cli/scripts/hooks/visual-fidelity-pr-gate.sh" },
          { "type": "command", "command": "packages/cli/scripts/hooks/doc-parity-gate.sh" }
        ]
      }
    ]
  }
}
```

Cross-check the existing file's exact structure before editing — match its formatting so the diff stays minimal.

### Step 7: Cleanliness check and commit

- [ ] Run cleanliness.

```bash
npm run lint && npm run format:check && npm run typecheck && npm run test:run
```

Expected: pass.

- [ ] Commit and PR.

```bash
git add .
git commit -m "feat(hook): soft doc-parity gate on commit/PR (CREW-?)"
git push -u origin feat/ticket-10-doc-parity-hook
gh pr create --title "feat(hook): soft doc-parity gate" --body "..."
```

---

## Ticket #11 — Phase 4 Metrics pipeline

**Files:**

- Create: `packages/shared/src/transcripts/extract-bash-commands.ts` + test
- Create: `packages/shared/src/transcripts/extract-read-paths.ts` + test
- Create: `packages/daemon/src/migrations/0003_run_metrics.ts` + test
- Create: `packages/daemon/src/services/MetricsService.ts` + test
- Create: `packages/daemon/src/routes/metrics.ts` + test
- Modify: `packages/daemon/src/db.ts` (extend `RunsTable` interface)
- Modify: `packages/daemon/src/container.ts` (register `MetricsService`)
- Modify: `packages/daemon/src/app.ts` (mount `/metrics` route)
- Create: `packages/dashboard/src/components/MetricsTrendWidget.tsx`
- Modify: `packages/dashboard/src/routes/AgentDetailPage.tsx` (add Metrics tab)
- Modify: `packages/dashboard/src/routes/AgentsListPage.tsx` (mount trend widget)
- Modify: `bruno/endpoints/agents/` or new `bruno/endpoints/metrics/` (add Bruno coverage per the bruno-collection-maintenance rule)

### Step 1: Branch

- [ ] Branch.

```bash
git checkout main && git pull --ff-only origin main
git checkout -b feat/ticket-11-metrics-pipeline
```

### Step 2: Write the transcript-parser extension tests (TDD red)

- [ ] Create `packages/shared/src/transcripts/extract-bash-commands.test.ts`.

```typescript
import { describe, it, expect } from 'vitest';
import { extractBashCommands } from './extract-bash-commands.js';

describe('extractBashCommands', () => {
  it('returns empty for no events', () => {
    expect(extractBashCommands([])).toEqual([]);
  });

  it('extracts commands from Bash tool_use entries', () => {
    const events = [
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'Bash', input: { command: 'npm run lint' } }],
        },
      },
      {
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'x.ts' } }] },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'Bash', input: { command: 'git status' } }],
        },
      },
    ];
    expect(extractBashCommands(events)).toEqual(['npm run lint', 'git status']);
  });

  it('handles events with no content array', () => {
    const events = [{ type: 'user', message: { content: 'plain text' } }];
    expect(extractBashCommands(events)).toEqual([]);
  });

  it('handles missing message field', () => {
    const events = [{ type: 'assistant' }];
    expect(extractBashCommands(events)).toEqual([]);
  });
});
```

- [ ] Create `packages/shared/src/transcripts/extract-read-paths.test.ts`.

```typescript
import { describe, it, expect } from 'vitest';
import { extractReadPaths } from './extract-read-paths.js';

describe('extractReadPaths', () => {
  it('returns empty for no events', () => {
    expect(extractReadPaths([])).toEqual([]);
  });

  it('extracts file paths from Read tool_use entries', () => {
    const events = [
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/path/to/file.ts' } }],
        },
      },
      {
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'ls' } }] },
      },
      {
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/other.md' } }],
        },
      },
    ];
    expect(extractReadPaths(events)).toEqual(['/path/to/file.ts', '/other.md']);
  });

  it('deduplicates repeated reads of the same file', () => {
    const events = [
      {
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/a.ts' } }] },
      },
      {
        type: 'assistant',
        message: { content: [{ type: 'tool_use', name: 'Read', input: { file_path: '/a.ts' } }] },
      },
    ];
    expect(extractReadPaths(events)).toEqual(['/a.ts']);
  });
});
```

### Step 3: Run tests to confirm they fail

- [ ] Run.

```bash
npx vitest run packages/shared/src/transcripts/extract-bash-commands.test.ts packages/shared/src/transcripts/extract-read-paths.test.ts
```

Expected: FAIL — modules don't exist.

### Step 4: Implement the extractors

- [ ] Create `packages/shared/src/transcripts/extract-bash-commands.ts`.

```typescript
interface ToolUseItem {
  type: string;
  name?: string;
  input?: {
    command?: string;
    file_path?: string;
  };
}

interface Event {
  message?: {
    content?: ToolUseItem[] | string;
  };
}

export function extractBashCommands(events: Event[]): string[] {
  const out: string[] = [];
  for (const ev of events) {
    const content = ev.message?.content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (item.type === 'tool_use' && item.name === 'Bash' && item.input?.command) {
        out.push(item.input.command);
      }
    }
  }
  return out;
}
```

- [ ] Create `packages/shared/src/transcripts/extract-read-paths.ts`.

```typescript
interface ToolUseItem {
  type: string;
  name?: string;
  input?: {
    file_path?: string;
  };
}

interface Event {
  message?: {
    content?: ToolUseItem[] | string;
  };
}

export function extractReadPaths(events: Event[]): string[] {
  const seen = new Set<string>();
  for (const ev of events) {
    const content = ev.message?.content;
    if (!Array.isArray(content)) continue;
    for (const item of content) {
      if (item.type === 'tool_use' && item.name === 'Read' && item.input?.file_path) {
        seen.add(item.input.file_path);
      }
    }
  }
  return Array.from(seen);
}
```

### Step 5: Run tests to confirm pass

- [ ] Run.

```bash
npx vitest run packages/shared/src/transcripts/
```

Expected: PASS.

### Step 6: Write the migration test

- [ ] Create `packages/daemon/src/migrations/0003_run_metrics.test.ts`. Match the existing migration test pattern (see `0002_state_transitions.test.ts` for shape).

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import SqliteDatabase from 'better-sqlite3';
import { Kysely, SqliteDialect, sql } from 'kysely';
import { up, down } from './0003_run_metrics.js';
import type { DaemonDatabase } from '../db.js';

describe('migration 0003_run_metrics', () => {
  let db: Kysely<DaemonDatabase>;
  let sqlite: InstanceType<typeof SqliteDatabase>;

  beforeEach(() => {
    sqlite = new SqliteDatabase(':memory:');
    db = new Kysely<DaemonDatabase>({ dialect: new SqliteDialect({ database: sqlite }) });
    // Pre-create the runs table from migration 0001 so 0003 has something to extend
    sqlite.exec(`CREATE TABLE runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_key TEXT NOT NULL,
      command TEXT NOT NULL,
      session_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      exit_code INTEGER
    )`);
  });

  it('adds metric columns to runs', async () => {
    await up(db);
    const cols = sqlite.prepare(`PRAGMA table_info(runs)`).all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).toContain('doc_load_coverage_pct');
    expect(names).toContain('cleanliness_pass');
    expect(names).toContain('pr_claim_input_tokens');
    expect(names).toContain('parity_violations');
    expect(names).toContain('baseline');
  });

  it('rolls back cleanly', async () => {
    await up(db);
    await down(db);
    const cols = sqlite.prepare(`PRAGMA table_info(runs)`).all() as Array<{ name: string }>;
    const names = cols.map((c) => c.name);
    expect(names).not.toContain('doc_load_coverage_pct');
    expect(names).not.toContain('baseline');
  });
});
```

### Step 7: Run migration test to confirm fail

```bash
npx vitest run packages/daemon/src/migrations/0003_run_metrics.test.ts
```

Expected: FAIL — module doesn't exist.

### Step 8: Implement the migration

- [ ] Create `packages/daemon/src/migrations/0003_run_metrics.ts`.

```typescript
import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`ALTER TABLE runs ADD COLUMN doc_load_coverage_pct REAL`.execute(db);
  await sql`ALTER TABLE runs ADD COLUMN cleanliness_pass INTEGER`.execute(db);
  await sql`ALTER TABLE runs ADD COLUMN pr_claim_input_tokens INTEGER`.execute(db);
  await sql`ALTER TABLE runs ADD COLUMN parity_violations INTEGER`.execute(db);
  await sql`ALTER TABLE runs ADD COLUMN baseline INTEGER DEFAULT 0`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // SQLite ALTER TABLE doesn't support DROP COLUMN in older versions; recreate the table.
  await sql`CREATE TABLE runs_new AS SELECT
    id, agent_key, command, session_id, started_at, completed_at, exit_code
    FROM runs`.execute(db);
  await sql`DROP TABLE runs`.execute(db);
  await sql`ALTER TABLE runs_new RENAME TO runs`.execute(db);
}
```

### Step 9: Extend `db.ts` RunsTable interface

- [ ] Modify `packages/daemon/src/db.ts` `RunsTable` interface to include the new columns:

```typescript
export interface RunsTable {
  id: Generated<number>;
  agent_key: string;
  command: 'run' | 'fix-pr' | 'finish';
  session_id: string;
  started_at: string;
  completed_at: string | null;
  exit_code: number | null;
  // metrics (added by migration 0003)
  doc_load_coverage_pct: number | null;
  cleanliness_pass: number | null;
  pr_claim_input_tokens: number | null;
  parity_violations: number | null;
  baseline: number; // 0 or 1
}
```

### Step 10: Run migration test to confirm pass

```bash
npx vitest run packages/daemon/src/migrations/0003_run_metrics.test.ts
```

Expected: PASS.

### Step 11: Write `MetricsService` tests (TDD red)

- [ ] Create `packages/daemon/src/services/MetricsService.test.ts`.

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import SqliteDatabase from 'better-sqlite3';
import { Kysely, SqliteDialect } from 'kysely';
import { MetricsService } from './MetricsService.js';
import type { DaemonDatabase } from '../db.js';

describe('MetricsService', () => {
  let db: Kysely<DaemonDatabase>;
  let svc: MetricsService;

  beforeEach(() => {
    const sqlite = new SqliteDatabase(':memory:');
    sqlite.exec(`CREATE TABLE runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_key TEXT NOT NULL,
      command TEXT NOT NULL,
      session_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      exit_code INTEGER,
      doc_load_coverage_pct REAL,
      cleanliness_pass INTEGER,
      pr_claim_input_tokens INTEGER,
      parity_violations INTEGER,
      baseline INTEGER DEFAULT 0
    )`);
    db = new Kysely<DaemonDatabase>({ dialect: new SqliteDialect({ database: sqlite }) });
    svc = new MetricsService(db);
  });

  it('records metrics for a run', async () => {
    await db
      .insertInto('runs')
      .values({
        agent_key: 'KEY-1',
        command: 'run',
        session_id: 's1',
        started_at: '2026-05-13T10:00:00Z',
        completed_at: '2026-05-13T11:00:00Z',
        exit_code: 0,
        doc_load_coverage_pct: null,
        cleanliness_pass: null,
        pr_claim_input_tokens: null,
        parity_violations: null,
        baseline: 0,
      })
      .execute();

    await svc.recordMetrics(1, {
      docLoadCoveragePct: 85,
      cleanlinessPass: 1,
      prClaimInputTokens: 12000,
      parityViolations: 0,
    });
    const row = await db
      .selectFrom('runs')
      .selectAll()
      .where('id', '=', 1)
      .executeTakeFirstOrThrow();
    expect(row.doc_load_coverage_pct).toBe(85);
    expect(row.cleanliness_pass).toBe(1);
    expect(row.pr_claim_input_tokens).toBe(12000);
    expect(row.parity_violations).toBe(0);
  });

  it('aggregates non-baseline metrics', async () => {
    await db
      .insertInto('runs')
      .values([
        {
          agent_key: 'a',
          command: 'run',
          session_id: 's1',
          started_at: 't',
          completed_at: 't',
          exit_code: 0,
          doc_load_coverage_pct: 80,
          cleanliness_pass: 1,
          pr_claim_input_tokens: 10000,
          parity_violations: 0,
          baseline: 0,
        },
        {
          agent_key: 'b',
          command: 'run',
          session_id: 's2',
          started_at: 't',
          completed_at: 't',
          exit_code: 0,
          doc_load_coverage_pct: 90,
          cleanliness_pass: 1,
          pr_claim_input_tokens: 8000,
          parity_violations: 1,
          baseline: 0,
        },
        {
          agent_key: 'c',
          command: 'run',
          session_id: 's3',
          started_at: 't',
          completed_at: 't',
          exit_code: 0,
          doc_load_coverage_pct: null,
          cleanliness_pass: 0,
          pr_claim_input_tokens: 20000,
          parity_violations: null,
          baseline: 1,
        },
      ])
      .execute();

    const agg = await svc.aggregate({ baseline: false });
    expect(agg.runCount).toBe(2);
    expect(agg.avgDocLoadCoverage).toBe(85);
    expect(agg.cleanlinessPassRate).toBe(1.0);
    expect(agg.avgPrClaimInputTokens).toBe(9000);
    expect(agg.parityViolationRate).toBe(0.5);
  });

  it('aggregates baseline separately', async () => {
    await db
      .insertInto('runs')
      .values([
        {
          agent_key: 'a',
          command: 'run',
          session_id: 's1',
          started_at: 't',
          completed_at: 't',
          exit_code: 0,
          doc_load_coverage_pct: null,
          cleanliness_pass: 1,
          pr_claim_input_tokens: 15000,
          parity_violations: null,
          baseline: 1,
        },
        {
          agent_key: 'b',
          command: 'run',
          session_id: 's2',
          started_at: 't',
          completed_at: 't',
          exit_code: 0,
          doc_load_coverage_pct: null,
          cleanliness_pass: 0,
          pr_claim_input_tokens: 18000,
          parity_violations: null,
          baseline: 1,
        },
      ])
      .execute();

    const agg = await svc.aggregate({ baseline: true });
    expect(agg.runCount).toBe(2);
    expect(agg.cleanlinessPassRate).toBe(0.5);
    expect(agg.avgPrClaimInputTokens).toBe(16500);
  });
});
```

### Step 12: Run service tests to confirm fail

```bash
npx vitest run packages/daemon/src/services/MetricsService.test.ts
```

Expected: FAIL — module doesn't exist.

### Step 13: Implement `MetricsService`

- [ ] Create `packages/daemon/src/services/MetricsService.ts`.

```typescript
import type { Kysely } from 'kysely';
import type { DaemonDatabase } from '../db.js';

export interface MetricInputs {
  docLoadCoveragePct: number | null;
  cleanlinessPass: 0 | 1;
  prClaimInputTokens: number | null;
  parityViolations: number | null;
}

export interface AggregateMetrics {
  runCount: number;
  avgDocLoadCoverage: number | null;
  cleanlinessPassRate: number;
  avgPrClaimInputTokens: number;
  parityViolationRate: number;
}

export class MetricsService {
  constructor(private readonly db: Kysely<DaemonDatabase>) {}

  async recordMetrics(runId: number, inputs: MetricInputs): Promise<void> {
    await this.db
      .updateTable('runs')
      .set({
        doc_load_coverage_pct: inputs.docLoadCoveragePct,
        cleanliness_pass: inputs.cleanlinessPass,
        pr_claim_input_tokens: inputs.prClaimInputTokens,
        parity_violations: inputs.parityViolations,
      })
      .where('id', '=', runId)
      .execute();
  }

  async aggregate(opts: { baseline: boolean }): Promise<AggregateMetrics> {
    const baselineVal = opts.baseline ? 1 : 0;
    const rows = await this.db
      .selectFrom('runs')
      .selectAll()
      .where('baseline', '=', baselineVal)
      .execute();

    const runCount = rows.length;
    if (runCount === 0) {
      return {
        runCount: 0,
        avgDocLoadCoverage: null,
        cleanlinessPassRate: 0,
        avgPrClaimInputTokens: 0,
        parityViolationRate: 0,
      };
    }

    const docLoadValues = rows
      .map((r) => r.doc_load_coverage_pct)
      .filter((v): v is number => v !== null);
    const avgDocLoadCoverage =
      docLoadValues.length > 0
        ? docLoadValues.reduce((a, b) => a + b, 0) / docLoadValues.length
        : null;

    const cleanlinessPassCount = rows.filter((r) => r.cleanliness_pass === 1).length;
    const cleanlinessPassRate = cleanlinessPassCount / runCount;

    const tokenValues = rows
      .map((r) => r.pr_claim_input_tokens)
      .filter((v): v is number => v !== null);
    const avgPrClaimInputTokens =
      tokenValues.length > 0 ? tokenValues.reduce((a, b) => a + b, 0) / tokenValues.length : 0;

    const parityValues = rows
      .map((r) => r.parity_violations)
      .filter((v): v is number => v !== null);
    const parityViolationCount = parityValues.filter((v) => v > 0).length;
    const parityViolationRate =
      parityValues.length > 0 ? parityViolationCount / parityValues.length : 0;

    return {
      runCount,
      avgDocLoadCoverage,
      cleanlinessPassRate,
      avgPrClaimInputTokens,
      parityViolationRate,
    };
  }
}
```

### Step 14: Run service tests to confirm pass

```bash
npx vitest run packages/daemon/src/services/MetricsService.test.ts
```

Expected: PASS — 3/3.

### Step 15: Wire `MetricsService` into the Awilix container

- [ ] Edit `packages/daemon/src/container.ts` to register `MetricsService`. Match the existing service-registration pattern.

```typescript
import { MetricsService } from './services/MetricsService.js';

// Inside the container build function, where other services register:
container.register({
  metricsService: asClass(MetricsService).singleton(),
});
```

(Adjust import + registration to match the actual conventions in the existing `container.ts`.)

### Step 16: Write the `/metrics` route tests

- [ ] Create `packages/daemon/src/routes/metrics.test.ts`. Match the existing route-test pattern (`agents.test.ts` is a good model).

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { buildTestApp } from '../test/build-app.js'; // existing test helper
import type { FastifyInstance } from 'fastify';

describe('GET /metrics', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  it('returns aggregated current metrics', async () => {
    // Insert some test runs
    // ...
    const res = await app.inject({ method: 'GET', url: '/metrics?baseline=false' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveProperty('runCount');
    expect(body).toHaveProperty('avgDocLoadCoverage');
    expect(body).toHaveProperty('cleanlinessPassRate');
  });

  it('returns baseline metrics separately', async () => {
    const res = await app.inject({ method: 'GET', url: '/metrics?baseline=true' });
    expect(res.statusCode).toBe(200);
  });
});
```

### Step 17: Run route tests to confirm fail

```bash
npx vitest run packages/daemon/src/routes/metrics.test.ts
```

Expected: FAIL — route not registered.

### Step 18: Implement the `/metrics` route

- [ ] Create `packages/daemon/src/routes/metrics.ts`.

```typescript
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { MetricsService } from '../services/MetricsService.js';

const QuerySchema = z.object({
  baseline: z.coerce.boolean().optional().default(false),
});

const ResponseSchema = z.object({
  runCount: z.number(),
  avgDocLoadCoverage: z.number().nullable(),
  cleanlinessPassRate: z.number(),
  avgPrClaimInputTokens: z.number(),
  parityViolationRate: z.number(),
});

export const metricsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    '/metrics',
    {
      schema: { querystring: QuerySchema, response: { 200: ResponseSchema } },
    },
    async (request) => {
      const metricsService = fastify.diContainer.resolve<MetricsService>('metricsService');
      const agg = await metricsService.aggregate({ baseline: request.query.baseline });
      return agg;
    },
  );
};
```

### Step 19: Mount the route in `app.ts`

- [ ] Edit `packages/daemon/src/app.ts` to register `metricsRoutes`. Match the existing route registration pattern.

```typescript
import { metricsRoutes } from './routes/metrics.js';

// Inside the route registration block:
await fastify.register(metricsRoutes);
```

### Step 20: Run route tests to confirm pass

```bash
npx vitest run packages/daemon/src/routes/metrics.test.ts
```

Expected: PASS — 2/2.

### Step 21: Add Bruno coverage for `/metrics`

- [ ] Per the bruno-collection-maintenance rule (route change = Bruno endpoint update in same commit), create `bruno/endpoints/metrics/get.bru` modeled on existing endpoint files. Optionally add to `flows/main-smoke.bru`.

```
meta {
  name: GET /metrics
}

get {
  url: {{baseUrl}}/metrics?baseline=false
}

assert {
  res.status: 200
}
```

### Step 22: Write the dashboard widget tests

- [ ] Create `packages/dashboard/src/components/MetricsTrendWidget.test.tsx` — basic render test.

```typescript
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { MetricsTrendWidget } from './MetricsTrendWidget.js';

describe('MetricsTrendWidget', () => {
  it('renders nothing while loading', () => {
    render(<MetricsTrendWidget />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });
});
```

### Step 23: Implement `MetricsTrendWidget`

- [ ] Create `packages/dashboard/src/components/MetricsTrendWidget.tsx`. Use TanStack Query (existing dep) to call `/metrics`.

```tsx
import { useQuery } from '@tanstack/react-query';

interface Metrics {
  runCount: number;
  avgDocLoadCoverage: number | null;
  cleanlinessPassRate: number;
  avgPrClaimInputTokens: number;
  parityViolationRate: number;
}

async function fetchMetrics(baseline: boolean): Promise<Metrics> {
  const res = await fetch(`/api/metrics?baseline=${baseline}`);
  if (!res.ok) throw new Error('fetch failed');
  return res.json();
}

export function MetricsTrendWidget() {
  const current = useQuery({
    queryKey: ['metrics', 'current'],
    queryFn: () => fetchMetrics(false),
  });
  const baseline = useQuery({
    queryKey: ['metrics', 'baseline'],
    queryFn: () => fetchMetrics(true),
  });

  if (current.isLoading || baseline.isLoading) return <div>loading</div>;
  if (current.error || baseline.error) return <div>error</div>;

  const c = current.data!;
  const b = baseline.data!;

  return (
    <section className="rounded-md border p-4 space-y-2">
      <h2 className="text-sm font-medium">Agent docs system — metrics</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt>Doc-load coverage (current)</dt>
        <dd>{c.avgDocLoadCoverage !== null ? `${c.avgDocLoadCoverage.toFixed(0)}%` : 'n/a'}</dd>
        <dt>Cleanliness pass rate</dt>
        <dd>
          {(c.cleanlinessPassRate * 100).toFixed(0)}% (baseline:{' '}
          {(b.cleanlinessPassRate * 100).toFixed(0)}%)
        </dd>
        <dt>Avg context size at PR-claim</dt>
        <dd>
          {c.avgPrClaimInputTokens.toLocaleString()} tokens (baseline:{' '}
          {b.avgPrClaimInputTokens.toLocaleString()})
        </dd>
        <dt>Parity violation rate</dt>
        <dd>{(c.parityViolationRate * 100).toFixed(0)}%</dd>
      </dl>
    </section>
  );
}
```

### Step 24: Mount the widget in `AgentsListPage`

- [ ] Edit `packages/dashboard/src/routes/AgentsListPage.tsx` to render `<MetricsTrendWidget />` near the top of the page, above the agents list.

### Step 25: Add a Metrics tab to `AgentDetailPage`

- [ ] Edit `packages/dashboard/src/routes/AgentDetailPage.tsx` to add a "Metrics" tab section that surfaces the per-run metrics for that agent: `docLoadCoveragePct`, `cleanlinessPass`, `prClaimInputTokens`, `parityViolations`. Render as a small key-value table.

Implementation detail: extend the existing daemon `/agents/:key` endpoint response to include the metric columns from the `runs` table (or call `/metrics?agentKey=<key>` if a per-agent variant is preferred). Pick the lighter touch — extending the existing endpoint is simpler.

- [ ] Update `AgentsService.getDetail` to include the metrics columns in the returned `AgentDetail` interface. Add a test for the extended response.

### Step 26: Wire transcript-driven metric capture

- [ ] In the daemon's transcript ingest path (`IngestService` or wherever new events are processed), after a run completes (state transitions to `finished` or PR closes), compute the four metrics for that run and call `MetricsService.recordMetrics`.

This is the binding step: the parser extractors from Step 4 feed into the `MetricsService`. The exact location depends on `IngestService`'s shape; review it before editing.

- [ ] Add an integration test that simulates a transcript with known content and asserts the recorded metrics match expectations.

### Step 27: Cleanliness check

- [ ] Run the full cleanliness check.

```bash
npm run lint && npm run format:check && npm run typecheck && npm run test:run && npm run bruno:smoke
```

Expected: all green.

### Step 28: Commit and PR

- [ ] Commit and PR.

```bash
git add .
git commit -m "feat: metrics pipeline + dashboard widgets (CREW-?)"
git push -u origin feat/ticket-11-metrics-pipeline
gh pr create --title "feat: metrics pipeline + dashboard" --body "..."
```

---

## Manual user-level task — `.agents/` doc-parity at completion

**Scope:** User-level skill work — **not a ticket**, handled in-conversation per the "don't ticket user-level work" rule.

**Status:** Done — 2026-05-15. Delivered differently than the procedure below originally specified; see "What changed" and "As-built".

**Goal:** A completion-time self-audit so that before any "I'm done" claim, the agent scans changed files against each `.agents/<topic>.md`'s `covers:` globs and updates docs the change made stale.

**Original procedure (superseded):** Edit `~/.claude/skills/superpowers/verification-before-completion/SKILL.md` to insert a doc-parity audit step after the lint/typecheck/test checks — get changed files via `git diff`, match against each doc's `covers:` glob, update + bump `last_updated` on the docs a change affects.

**What changed:** That path does not exist. `verification-before-completion` ships inside the `superpowers` *plugin*, cached at `~/.claude/plugins/cache/claude-plugins-official/superpowers/<version>/skills/` — and edits to a cached plugin file are silently discarded on the next plugin update. Extending the plugin skill in place was not viable.

So the audit was delivered as a **new standalone user-level skill**, `agents-doc-parity-check` (`~/.claude/skills/agents-doc-parity-check/`), positioned as a companion to `verification-before-completion` — the same pattern `visual-fidelity-check` already uses. It is update-proof and inert in repos with no `.agents/` directory.

A RED-GREEN-REFACTOR pressure test (per `superpowers:writing-skills`) then surfaced a second issue: a standalone skill does not reliably *self-trigger*. A subagent finishing a task under time pressure did not invoke it even with the skill present in its menu — whereas both test agents followed an instruction carried in `~/.claude/CLAUDE.md`. The fix: an explicit trigger lives in this repo's root `AGENTS.md` (§ "Before claiming work complete"), since `AGENTS.md`/`CLAUDE.md` instructions demonstrably propagate to dispatched agents and get followed. The skill carries the *procedure*; `AGENTS.md` carries the *trigger*.

**As-built:**

- **Skill** — `~/.claude/skills/agents-doc-parity-check/SKILL.md`. Workflow: confirm `.agents/` exists → collect committed + staged + unstaged changes → match each against every doc's `covers:` globs via git's `:(glob)` pathspec → review and update each in-scope doc, bumping `last_updated` → gate the completion claim. Handles the overlap case (one file matched by multiple docs → update all of them).
- **Trigger** — root `AGENTS.md` § "Before claiming work complete".
- **Relationship to Ticket #10 (CREW-163, `doc-parity-gate.sh`):** the skill is the *completion-time* self-audit; the hook is the independent *commit/PR-time* net. Both are intended to coexist.

**Done when:** working in a repo with `.agents/`, the root `AGENTS.md` trigger directs the agent to run `agents-doc-parity-check` before any completion claim. ✅

---

## Self-review checklist

I'll do this against the spec one section at a time.

**Spec coverage check:**

- [x] Two-tier progressive disclosure (AGENTS.md + `.agents/`) — covered by Ticket #1 + Phase 2 tickets
- [x] Root AGENTS.md under 60 lines — final cleanup in Ticket #9, verified by `wc -l`
- [x] Per-package AGENTS.md lazy-loaded — files created in Ticket #1
- [x] `.agents/` topic library — 9 files specced; 1 created in Ticket #1, 8 in tickets #2–9
- [x] Self-describing meta-doc — written in Ticket #1 Step 9
- [x] Frontmatter-based staleness/coverage — schema in Ticket #1 validator
- [x] Soft hook on commit/PR — Ticket #10
- [x] Layer-1 metrics — Ticket #11; baseline capture in Ticket #1 Step 13
- [x] Forward compatibility with hybrid trigger system — reserved fields documented in meta-doc; no code needed
- [x] Migration path from `docs/plans/*.md` — Phase 2 tickets with content-audit step
- [x] `docs/rationale/` for historical narrative — created in Ticket #1 Step 8; populated in Phase 2 tickets
- [x] Manual verification-before-completion extension — manual task section

**Placeholder scan:** No "TBD"/"TODO"/"implement later" remaining; the "_To be populated_" lines in per-package AGENTS.md "Common gotchas" sections are intentional and tracked — gotchas are surfaced organically as Phase 2 tickets land, not pre-fabricated.

**Type consistency check:**

- `MetricInputs.cleanlinessPass: 0 | 1` matches `RunsTable.cleanliness_pass: number | null` (storing as integer per SQLite convention)
- `AggregateMetrics.avgDocLoadCoverage: number | null` matches the SQL nullable column
- `validateFrontmatter`'s return type `ValidationResult` is consistent across the validator file
- `extractBashCommands` / `extractReadPaths` share the same `Event` shape

**Scope check:** This plan is large but each ticket is independently sized. No single ticket exceeds ~30 steps. Phase 2 tickets are 8–10 steps each (procedural). Ticket #11 is the largest at 28 steps because metrics pipeline spans parser + service + route + dashboard.
