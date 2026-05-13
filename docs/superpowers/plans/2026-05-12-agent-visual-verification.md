# Agent visual verification — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Note:** Phase A is in-chat work (per `~/.claude/CLAUDE.md` user-level-skill rule) and is not for autonomous-dispatch execution. Phase B is the ticketed portion.

**Goal:** Build the autonomous visual-verification gate that the CREW-135 failure exposed the need for — Figma snapshot generator + user-scoped skill + validation harness, composing into a pre-completion gate the dispatched agent uses before claiming any UI-touching task done.

**Architecture:** Two phases. Phase A authors the skill + first fixture in-chat (user-level skills can't run through `crew run`). Phase B builds the `crew figma-snapshot` CLI and wires it into `crew run` so the snapshot is available in every dispatch — this part is ticketable.

**Tech Stack:** Node.js (`packages/cli/`), commander, Zod (config schema in `packages/shared/`), Figma REST API for snapshot generation, vitest for tests. The skill itself is markdown only.

**Spec:** [`docs/superpowers/specs/2026-05-12-agent-visual-verification-design.md`](../specs/2026-05-12-agent-visual-verification-design.md)

---

## Phase A — Skill authoring + first fixture (in-chat, NO Jira tickets)

Per `~/.claude/CLAUDE.md` "Don't ticket — handle manually": deliverables under `~/.claude/**` can't dispatch through `crew run` (Claude Code's sensitive-file check blocks writes there). Author the skill + its first fixture interactively. The work below maps cleanly into a single in-chat session.

### Task A.1: Scaffold the skill-fixtures harness

**Files:**
- Create: `<repo>/docs/superpowers/skill-fixtures/visual-fidelity-check/README.md`
- Create: `<repo>/docs/superpowers/skill-fixtures/visual-fidelity-check/_template/description.md`
- Create: `<repo>/docs/superpowers/skill-fixtures/visual-fidelity-check/_template/expected/.gitkeep`
- Create: `<repo>/docs/superpowers/skill-fixtures/visual-fidelity-check/_template/snapshot/.gitkeep`
- Create: `<repo>/docs/superpowers/skill-fixtures/visual-fidelity-check/_template/rendered/.gitkeep`
- Create: `<repo>/docs/superpowers/skill-fixtures/visual-fidelity-check/_template/runs/.gitkeep`

- [ ] **Step 1: Author harness README**

```markdown
# visual-fidelity-check skill fixtures

Calibration harness for the user-scoped `visual-fidelity-check` skill. Each
fixture captures a known UI-component implementation + its Figma source-of-
truth + ground-truth findings the skill should produce.

## Fixture structure

Each fixture is a folder:

```
<fixture-name>/
├── description.md       # what's wrong in this fixture (ground truth)
├── snapshot/            # Figma snapshot at the time of the fixture
├── rendered/            # captured screenshots of the actual rendered output
├── expected/            # what the skill SHOULD report
└── runs/                # actual skill outputs from each iteration
    ├── 2026-05-12-run-01.md
    └── ...
```

## Adding a fixture

1. Copy `_template/` to `<new-fixture>/`.
2. Fill in `description.md` — name the regressions, link to PR/commit if any.
3. Hand-capture Figma snapshot data into `snapshot/` (use the existing crew
   Figma MCP access to fetch screenshots + structural JSON).
4. Render the rendered code state into `rendered/` (screenshot via Playwright
   MCP or browser DevTools).
5. Author `expected/findings.md` — what the skill should flag.

## Running the skill against a fixture

(see SKILL.md at `~/.claude/skills/visual-fidelity-check/` once authored)
```

- [ ] **Step 2: Create template directories with .gitkeep placeholders**

```bash
mkdir -p docs/superpowers/skill-fixtures/visual-fidelity-check/_template/{snapshot,rendered,expected,runs}
touch docs/superpowers/skill-fixtures/visual-fidelity-check/_template/{snapshot,rendered,expected,runs}/.gitkeep
```

- [ ] **Step 3: Author template description.md**

```markdown
# <fixture-name>

**What's wrong (ground truth):**

- (list each known regression — be specific: which component, which property, expected vs actual)

**Source:** (PR number, commit, or "manual fixture")

**Date captured:** YYYY-MM-DD
```

- [ ] **Step 4: Commit the harness scaffold**

```bash
git add docs/superpowers/skill-fixtures/visual-fidelity-check/
git commit -m "docs(harness): scaffold visual-fidelity-check skill-fixtures dir"
```

### Task A.2: Capture CREW-135 fixture — Figma snapshot

**Files:**
- Create: `<repo>/docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/snapshot/index.json`
- Create: `<repo>/docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/snapshot/variables.json`
- Create: `<repo>/docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/snapshot/composites/272-120.{png,json}` (Pill set)
- Create: `<repo>/docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/snapshot/screens/1-756.{png,json}` (Agent drawer header for context — has 4 of the affected buttons + 1 close icon)

CREW-135 touched Button, Badge, and Tag. Pill is the consolidated Figma source. We need per-variant data for the variants the PR actually uses + a couple of in-context screen renders.

- [ ] **Step 1: Use Figma MCP to fetch Pill set screenshot**

In chat, invoke `mcp__plugin_figma_figma__get_screenshot` for node `272:120` in file `9FeJPriqdsdA4n9R5Xsrr8`. Save the returned PNG to `crew-135/snapshot/composites/272-120.png`.

- [ ] **Step 2: Use Figma MCP to fetch Pill structural data**

Invoke `mcp__plugin_figma_figma__use_figma` with a script that traverses the Pill component set and emits the per-variant JSON described in the spec ("Per-component JSON shape" section). The script should produce JSON matching this shape per variant:

```json
{
  "name": "type=button-sm, color=running, intensity=mid",
  "resolvedStyles": {
    "fills": [{ "type": "SOLID", "tokenAlias": "tw/colors/slate/1050", "hex": "#0F172A1A" }],
    "strokes": [{ "tokenAlias": "tw/colors/slate/500", "hex": "#64748B", "weight": 1 }],
    "textColor": { "tokenAlias": "tw/colors/slate/400", "hex": "#94A3B8" }
  },
  "geometry": { "height": 32, "paddingTop": 6, "paddingRight": 12, "paddingBottom": 6, "paddingLeft": 12, "cornerRadius": 6, "itemSpacing": 6 },
  "font": { "family": "Hanken Grotesk", "weight": "Medium", "size": 14 }
}
```

Save to `crew-135/snapshot/composites/272-120.json` with full `componentPropertyDefinitions` + the `variants` array.

- [ ] **Step 3: Fetch agent-drawer screen snapshot**

`mcp__plugin_figma_figma__get_screenshot` for node `1:756` (agent drawer header context — has the 4 button instances we care about). Save PNG + structural JSON to `crew-135/snapshot/screens/`.

- [ ] **Step 4: Compile index.json + variables.json**

`index.json` maps every captured node ID to `{ name, page, screenshotPath, metadataPath }`. `variables.json` contains the resolved values for `state/running`, `state/error`, `state/waiting`, `state/finished`, `state/idle`, `state/initializing`, `state/pr_open` (each aliased to its Tailwind shade). Cross-reference with `packages/dashboard/src/data/state-meta.ts` for the canonical Tailwind mapping.

- [ ] **Step 5: Commit the snapshot**

```bash
git add docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/snapshot/
git commit -m "docs(harness): CREW-135 fixture — Figma snapshot (Pill set + agent drawer screen)"
```

### Task A.3: Capture CREW-135 fixture — rendered state

**Files:**
- Create: `<repo>/docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/rendered/*.png`

- [ ] **Step 1: Check out PR #177 locally + boot dashboard**

```bash
git fetch origin pull/177/head:crew-135-fixture-source
git checkout crew-135-fixture-source
cd packages/dashboard
docker compose up -d   # or whichever stack-up command for this worktree
```

- [ ] **Step 2: Screenshot the agent drawer header in a browser**

Open `http://localhost:<port>/#/agent/CREW-102` (port from `env.toml`). Use Chrome DevTools or a Playwright session to capture the agent drawer header at 1× resolution, exactly framed to the title bar + buttons area. Save to `crew-135/rendered/agent-drawer-header.png`.

- [ ] **Step 3: Screenshot the project page modal-overlay state**

Navigate to the projects page, trigger the Delete confirmation modal (or take the screen at `18:2`/`23:2` equivalent — these were the modal-overlay screens with the Edit/Provide input/Finish/View PR buttons). Save to `crew-135/rendered/project-modal-overlay.png`.

- [ ] **Step 4: Back out to the working branch**

```bash
git checkout docs/agent-visual-verification-spec
```

- [ ] **Step 5: Commit the rendered captures**

```bash
git add docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/rendered/
git commit -m "docs(harness): CREW-135 fixture — captured rendered state from PR #177"
```

### Task A.4: Author CREW-135 fixture — description + expected findings

**Files:**
- Create: `<repo>/docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/description.md`
- Create: `<repo>/docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/expected/findings.md`

- [ ] **Step 1: Author description.md (ground truth)**

```markdown
# CREW-135 fixture (T1 Pill primitives)

**Source:** PR #177 — feat(dashboard): T1 pill primitives (Button/Badge/Tag color × intensity contract)

**Date captured:** 2026-05-12

**What's wrong (ground truth):**

1. **Outline (border) missing on `<Button color="running" intensity="mid">`.**
   Figma variant `type=button-sm, color=running, intensity=mid` binds
   `border-slate-500` (1px stroke). Code's `pillSurfaceClasses('running','mid')`
   emits `bg-slate-1050 border border-slate-500 text-slate-400` correctly,
   but `ui/button.tsx`'s base class string lacks the cn() guarantee that
   the border-color class actually wins over a parent reset.

2. **Close button icon (button-icon-sm/running/ghost) renders the default
   git-pull-request glyph instead of lucide/x.**
   The Figma variant has `Icon` INSTANCE_SWAP defaulting to lucide/x for
   icon-only types; the code's `<Button size="icon-sm"><X /></Button>` is
   correct in the source but the agent drawer's close button still uses
   the old "Button - Close" raw FRAME pattern from before the Pill migration.

3. **Padding on `<Button size="sm">` is 8/4 px instead of 12/6 px.**
   Figma spec: padX=12, padY=6 for button-sm. Code's `buttonSizes` cva
   has `sm: 'h-8 gap-1.5 px-3 has-[>svg]:px-2.5'` which sets padX=12
   (`px-3` = 12) but no padY — `py` defaults to 0, conflicting with
   the h-8 height calc.
```

(These are illustrative ground-truth items based on the user's reported visual issues. Adjust per the real PR review.)

- [ ] **Step 2: Author expected/findings.md (what the skill should report)**

```markdown
# Expected findings for crew-135 fixture

The skill, when run against this fixture, must produce findings that cover
each of the regressions in `description.md`. Acceptable findings format:

## Component: ui/button.tsx — color=running, intensity=mid

- **Structural (border):** Figma variant binds `border-slate-500` (1px stroke);
  rendered class string contains the border declaration but visual screenshot
  shows no visible border. Possible class-precedence issue.
- **Visual (border):** Figma snapshot shows a 1px slate stroke around the
  button shape; rendered screenshot does not.

## Component: ui/button.tsx — size=icon-sm, color=running, intensity=ghost

- **Visual (icon):** Figma snapshot shows a clean × glyph (lucide/x); rendered
  screenshot shows a git-pull-request glyph at the same position.

## Component: ui/button.tsx — size=sm padding

- **Structural (padding):** Figma variant geometry: padY=6. Rendered class
  string lacks `py-1.5` (Tailwind for 6px vertical padding); only `h-8`
  is declared.
- **Visual (padding):** Text in the rendered button sits flush against the
  top/bottom border; Figma snapshot shows ~6px breathing room.
```

- [ ] **Step 3: Commit the description + expected**

```bash
git add docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/{description.md,expected/}
git commit -m "docs(harness): CREW-135 fixture — description.md + expected findings"
```

### Task A.5: Author the visual-fidelity-check skill via superpowers:writing-skills

This is the moment where you stop using `executing-plans`-style steps and switch to interactive chat. The `superpowers:writing-skills` skill drives this — invoke it, scaffold the skill, iterate.

- [ ] **Step 1: Invoke superpowers:writing-skills in chat**

In a chat session, say: *"I want to author a new user-scoped skill at `~/.claude/skills/visual-fidelity-check/`. Invoke the writing-skills skill to help."* The writing-skills skill will scaffold the directory, frontmatter, and discovery process.

- [ ] **Step 2: Provide the skill's purpose + workflow**

When writing-skills asks about scope, paste in the spec's "Skill workflow" section (steps 1–5 of "Piece 2: visual-fidelity-check skill") as the skill's core procedure. Provide the spec's "What the skill is NOT" section as the boundary cases.

- [ ] **Step 3: Write the SKILL.md frontmatter + description**

The frontmatter should include:

```yaml
---
name: visual-fidelity-check
description: Use when about to claim any UI-touching task complete, before creating a PR or claiming verified — even if all tests pass, even if you've already done a visual smoke. Triggers on any file change under a project's componentDir or any new/modified .figma.tsx file. Reads project config from <repo>/.crew/visual-fidelity.json. Fails closed — if the skill can't find a snapshot or can't compare, the agent must not claim done.
---
```

The "even if X" clauses are loophole-closers per writing-skills convention — every "I already ran the build" or "I already screenshotted" rationale leads back into the skill.

- [ ] **Step 4: Author workflow.md**

Transcribe the spec's 5-step workflow (identify touched components → map to Figma node → structural check + visual check → compile report → iterate or proceed) into the skill's workflow.md. Make each step explicit, including the report markdown template.

- [ ] **Step 5: Author examples/**

Two example outputs: `examples/good-report.md` (clean run, no findings, agent proceeds to PR) and `examples/findings-report.md` (representative findings from the CREW-135 fixture, agent iterates).

- [ ] **Step 6: Commit nothing in this step**

The skill lives at `~/.claude/skills/visual-fidelity-check/` which is outside this repo. The writing-skills skill handles its own commit/sync if applicable.

### Task A.6: Calibrate the skill against the CREW-135 fixture

This is iterative — there's no fixed step count. Run the skill, review accuracy with the user, sharpen the prompt, repeat.

- [ ] **Step 1: Run the skill against the fixture (first attempt)**

In chat: *"Invoke `visual-fidelity-check` against the CREW-135 fixture at `<repo>/docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/`. Use the snapshot at `<fixture>/snapshot/` as the Figma reference and the rendered images at `<fixture>/rendered/` as the actual output."*

The skill produces a findings report. Save it to `crew-135/runs/2026-05-12-run-01.md`.

- [ ] **Step 2: Score the findings against expected**

User reviews the findings. For each finding:

- **Hit** — matches an entry in `expected/findings.md`
- **Miss** — an `expected` finding the skill did not catch
- **False positive** — a finding not in `expected` (could still be valid, but flag for review)

- [ ] **Step 3: If accuracy is low, edit the skill prompt**

Edit `~/.claude/skills/visual-fidelity-check/SKILL.md` or `workflow.md` to address the misses or false positives. Common iterations:

- Misses → workflow step is too vague, sharpen the instruction
- False positives → add a "what's NOT a finding" section, or tighten the structural-check rules

- [ ] **Step 4: Re-run the skill (next iteration)**

Save the new run to `crew-135/runs/2026-05-12-run-02.md`. Compare to expected again.

- [ ] **Step 5: Repeat until accuracy is acceptable**

"Acceptable" is the user's judgment. A practical target: skill catches 100% of expected findings, false-positive rate ≤ 1-2 per fixture run.

- [ ] **Step 6: Commit the calibration runs to the repo**

```bash
git add docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/runs/
git commit -m "docs(harness): CREW-135 fixture — skill calibration runs"
```

(The skill itself, at `~/.claude/skills/`, is outside the repo.)

### Phase A verification

After A.1–A.6:

- `~/.claude/skills/visual-fidelity-check/` exists with SKILL.md + workflow.md + examples
- `<repo>/docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/` has snapshot/, rendered/, description.md, expected/, runs/
- The most recent run in `runs/` shows the skill catching all (or near-all) `expected/findings.md` items
- The skill's behavior has been observed and calibrated against at least one real failure case

Phase A is done when the user is satisfied the skill catches CREW-135's regressions reliably.

---

## Phase B — `crew figma-snapshot` CLI + dispatch integration (Jira-ticketed)

Now that the skill works against a hand-rolled fixture, automate the snapshot generation so it works in every dispatched agent's worktree.

### T-B1: Project config schema + `crew figma-snapshot` CLI

Adds the `[visual_fidelity]` section to the crew project config schema, plus the new `crew figma-snapshot` subcommand that reads it.

#### Task B1.1: Add `visualFidelitySchema` to packages/shared

**Files:**
- Modify: `packages/shared/src/config/schema.ts` (add schema)
- Modify: `packages/shared/src/index.ts` (re-export if needed)
- Test: `packages/shared/src/config/schema.test.ts` (extend existing)

- [ ] **Step 1: Write failing test**

In `packages/shared/src/config/schema.test.ts`, add:

```ts
import { describe, expect, it } from 'vitest';
import { projectConfigSchema } from './schema.js';

describe('visualFidelitySchema', () => {
  it('parses a minimal visual_fidelity block', () => {
    const result = projectConfigSchema.parse({
      // ... existing required fields, copy from another test ...
      visual_fidelity: {
        figma_file_key: '9FeJPriqdsdA4n9R5Xsrr8',
        figma_pages: ['Composites', 'Dashboard Screens'],
        component_dir: 'packages/dashboard/src/components',
        dashboard_url: '${DASHBOARD_URL}',
      },
    });
    expect(result.visual_fidelity?.figma_file_key).toBe('9FeJPriqdsdA4n9R5Xsrr8');
  });

  it('defaults snapshot_path to .crew/figma-snapshot', () => {
    const result = projectConfigSchema.parse({
      // ... required fields ...
      visual_fidelity: {
        figma_file_key: 'X',
        figma_pages: ['p1'],
        component_dir: 'src/components',
        dashboard_url: 'http://localhost:3000',
      },
    });
    expect(result.visual_fidelity?.snapshot_path).toBe('.crew/figma-snapshot');
  });

  it('rejects missing figma_file_key', () => {
    expect(() => projectConfigSchema.parse({
      // ... required fields ...
      visual_fidelity: { figma_pages: ['p1'], component_dir: 'x', dashboard_url: 'x' },
    })).toThrow();
  });
});
```

- [ ] **Step 2: Run test (expect failure)**

```bash
cd packages/shared && npm run test -- schema.test
```

Expected: FAIL — `visual_fidelity` not recognized.

- [ ] **Step 3: Add schema in packages/shared/src/config/schema.ts**

```ts
// Near the top with the other schemas (e.g. after playwrightSchema)
const visualFidelitySchema = z.object({
  figma_file_key: z.string().min(1),
  figma_pages: z.array(z.string()).min(1),
  component_dir: z.string().min(1),
  dashboard_url: z.string().min(1),
  snapshot_path: z.string().default('.crew/figma-snapshot'),
  code_connect_glob: z.string().default('**/*.figma.tsx'),
  skip_snapshot: z.boolean().default(false),
});

// In the projectConfigSchema's z.object({...}) call, add:
//   visual_fidelity: visualFidelitySchema.optional(),
```

Then re-export `visualFidelitySchema` from `packages/shared/src/index.ts` if not already covered by the project-config re-export.

- [ ] **Step 4: Run test (expect pass)**

```bash
cd packages/shared && npm run test -- schema.test
```

Expected: all assertions pass.

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/config/schema.ts packages/shared/src/config/schema.test.ts
git commit -m "feat(shared): add visual_fidelity project-config block"
```

#### Task B1.2: Scaffold `crew figma-snapshot` command

**Files:**
- Create: `packages/cli/src/commands/figma-snapshot.ts`
- Create: `packages/cli/src/commands/figma-snapshot.test.ts`
- Modify: `packages/cli/src/index.ts` (register the new command)

- [ ] **Step 1: Write a stub test**

```ts
// packages/cli/src/commands/figma-snapshot.test.ts
import { describe, expect, it } from 'vitest';
import { runFigmaSnapshot, type FigmaSnapshotDeps } from './figma-snapshot.js';

describe('crew figma-snapshot', () => {
  it('returns ok=false with a reason when visual_fidelity is missing from project config', async () => {
    const deps: FigmaSnapshotDeps = {
      worktree: '/tmp/nonexistent',
      config: { /* minimal config without visual_fidelity */ } as never,
      log: () => {},
    };
    const result = await runFigmaSnapshot(deps);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/visual_fidelity/);
  });
});
```

- [ ] **Step 2: Run test (expect failure)**

```bash
cd packages/cli && npm run test -- figma-snapshot
```

Expected: FAIL — module not found.

- [ ] **Step 3: Scaffold the command module**

```ts
// packages/cli/src/commands/figma-snapshot.ts
import { Command } from 'commander';
import pc from 'picocolors';
import { discoverProjectConfig, type ProjectConfig } from '../lib/index.js';

export interface FigmaSnapshotDeps {
  worktree: string;
  config: ProjectConfig;
  log: (msg: string) => void;
}

export interface FigmaSnapshotResult {
  ok: boolean;
  reason?: string;
  nodesExported?: number;
}

export async function runFigmaSnapshot(deps: FigmaSnapshotDeps): Promise<FigmaSnapshotResult> {
  if (!deps.config.visual_fidelity) {
    return { ok: false, reason: 'No [visual_fidelity] block in project config; nothing to snapshot.' };
  }
  if (deps.config.visual_fidelity.skip_snapshot) {
    return { ok: true, reason: 'skip_snapshot=true; no-op', nodesExported: 0 };
  }
  // Real implementation in B1.3-B1.5.
  return { ok: false, reason: 'not implemented yet' };
}

export function registerFigmaSnapshotCommand(program: Command): void {
  program
    .command('figma-snapshot')
    .description('Export the project\'s Figma file to <worktree>/.crew/figma-snapshot/ for agent visual verification.')
    .action(async () => {
      const cwd = process.cwd();
      const config = await discoverProjectConfig(cwd);
      if (!config) {
        console.error(pc.red('No project config found. Run from inside a crew-managed worktree.'));
        process.exit(1);
      }
      const result = await runFigmaSnapshot({
        worktree: cwd,
        config,
        log: (msg) => console.log(msg),
      });
      if (!result.ok) {
        console.error(pc.red(result.reason ?? 'snapshot failed'));
        process.exit(1);
      }
      console.log(pc.green(`✓ snapshot complete (${result.nodesExported ?? 0} nodes)`));
    });
}
```

- [ ] **Step 4: Register the command in CLI entry point**

In `packages/cli/src/index.ts`, find where other commands register (e.g., `registerEnvCommand(program)`) and add:

```ts
import { registerFigmaSnapshotCommand } from './commands/figma-snapshot.js';
// ...
registerFigmaSnapshotCommand(program);
```

- [ ] **Step 5: Run test (expect pass)**

```bash
cd packages/cli && npm run test -- figma-snapshot
```

Expected: the one assertion passes (no `visual_fidelity` → `ok=false` with reason).

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/commands/figma-snapshot.ts \
        packages/cli/src/commands/figma-snapshot.test.ts \
        packages/cli/src/index.ts
git commit -m "feat(cli): scaffold crew figma-snapshot command (stub)"
```

#### Task B1.3: Implement Figma REST client

**Files:**
- Create: `packages/cli/src/lib/figma-snapshot/client.ts`
- Create: `packages/cli/src/lib/figma-snapshot/client.test.ts`
- Modify: `packages/cli/src/lib/index.ts` (re-export the namespace)

Auth: read `FIGMA_API_TOKEN` from env. Document in README that the user needs a Figma personal access token (free tier supports this).

- [ ] **Step 1: Write test**

```ts
// packages/cli/src/lib/figma-snapshot/client.test.ts
import { describe, expect, it, vi } from 'vitest';
import { FigmaRestClient } from './client.js';

describe('FigmaRestClient', () => {
  it('throws if FIGMA_API_TOKEN env var is not set', () => {
    delete process.env.FIGMA_API_TOKEN;
    expect(() => new FigmaRestClient()).toThrow(/FIGMA_API_TOKEN/);
  });

  it('uses the token from env for the X-Figma-Token header', async () => {
    process.env.FIGMA_API_TOKEN = 'tok-123';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ document: { id: 'x', name: 'root', type: 'DOCUMENT', children: [] } }),
    });
    const client = new FigmaRestClient({ fetch: fetchMock as never });
    await client.getFile('FILEKEY');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.figma.com/v1/files/FILEKEY',
      expect.objectContaining({ headers: { 'X-Figma-Token': 'tok-123' } }),
    );
  });
});
```

- [ ] **Step 2: Run test (expect failure — module missing)**

```bash
cd packages/cli && npm run test -- figma-snapshot/client
```

- [ ] **Step 3: Implement the client**

```ts
// packages/cli/src/lib/figma-snapshot/client.ts
type FetchLike = typeof globalThis.fetch;

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  // ... other fields populated lazily as needed
  [key: string]: unknown;
}

export interface FigmaFileResponse {
  document: FigmaNode;
  components?: Record<string, unknown>;
  componentSets?: Record<string, unknown>;
  styles?: Record<string, unknown>;
}

export interface FigmaImagesResponse {
  images: Record<string, string | null>; // nodeId → CDN URL
  err?: string;
}

export interface FigmaRestClientOptions {
  token?: string;
  fetch?: FetchLike;
}

export class FigmaRestClient {
  private token: string;
  private fetch: FetchLike;

  constructor(opts: FigmaRestClientOptions = {}) {
    const token = opts.token ?? process.env.FIGMA_API_TOKEN;
    if (!token) {
      throw new Error('FIGMA_API_TOKEN env var is required for figma-snapshot. Generate one at https://www.figma.com/developers/api#access-tokens');
    }
    this.token = token;
    this.fetch = opts.fetch ?? globalThis.fetch;
  }

  private async req<T>(path: string): Promise<T> {
    const res = await this.fetch(`https://api.figma.com/v1${path}`, {
      headers: { 'X-Figma-Token': this.token },
    });
    if (!res.ok) throw new Error(`Figma API ${res.status} for ${path}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  async getFile(fileKey: string): Promise<FigmaFileResponse> {
    return this.req(`/files/${fileKey}`);
  }

  async getImages(fileKey: string, nodeIds: string[], scale = 2): Promise<FigmaImagesResponse> {
    const params = new URLSearchParams({ ids: nodeIds.join(','), scale: String(scale), format: 'png' });
    return this.req(`/images/${fileKey}?${params}`);
  }
}
```

- [ ] **Step 4: Re-export from lib/index.ts**

```ts
// packages/cli/src/lib/index.ts — add:
export * from './figma-snapshot/client.js';
```

- [ ] **Step 5: Run test (expect pass)**

```bash
cd packages/cli && npm run test -- figma-snapshot/client
```

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/figma-snapshot/client.ts \
        packages/cli/src/lib/figma-snapshot/client.test.ts \
        packages/cli/src/lib/index.ts
git commit -m "feat(cli): FigmaRestClient wrapping Figma REST API (file + images)"
```

#### Task B1.4: Implement snapshot emission (page traversal + file writes)

**Files:**
- Create: `packages/cli/src/lib/figma-snapshot/emit.ts`
- Create: `packages/cli/src/lib/figma-snapshot/emit.test.ts`

- [ ] **Step 1: Write test against a fixture file response**

```ts
// packages/cli/src/lib/figma-snapshot/emit.test.ts
import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitSnapshot } from './emit.js';
import type { FigmaFileResponse, FigmaImagesResponse } from './client.js';

describe('emitSnapshot', () => {
  const mockFileResponse: FigmaFileResponse = {
    document: {
      id: '0:0', name: 'Document', type: 'DOCUMENT',
      children: [
        {
          id: '212:630', name: 'Composites', type: 'CANVAS',
          children: [
            { id: '272:120', name: 'Pill', type: 'COMPONENT_SET', children: [] },
          ],
        },
      ],
    },
  };

  const mockImagesResponse: FigmaImagesResponse = {
    images: { '272:120': 'https://cdn.figma.com/test.png' },
  };

  it('writes index.json, per-component PNG + JSON for nodes on the named pages', async () => {
    const outDir = mkdtempSync(join(tmpdir(), 'crew-snap-'));
    const mockClient = {
      getFile: vi.fn().mockResolvedValue(mockFileResponse),
      getImages: vi.fn().mockResolvedValue(mockImagesResponse),
    };
    const mockFetchImage = vi.fn().mockResolvedValue(Buffer.from('fake-png-bytes'));

    await emitSnapshot({
      fileKey: 'FILEKEY',
      pages: ['Composites'],
      outDir,
      client: mockClient as never,
      fetchImage: mockFetchImage,
    });

    expect(existsSync(join(outDir, 'index.json'))).toBe(true);
    expect(existsSync(join(outDir, 'composites/272-120.png'))).toBe(true);
    expect(existsSync(join(outDir, 'composites/272-120.json'))).toBe(true);

    const index = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8'));
    expect(index['272:120']).toMatchObject({ name: 'Pill', page: 'Composites' });

    rmSync(outDir, { recursive: true });
  });
});
```

- [ ] **Step 2: Run test (expect failure)**

```bash
cd packages/cli && npm run test -- figma-snapshot/emit
```

- [ ] **Step 3: Implement emit.ts**

```ts
// packages/cli/src/lib/figma-snapshot/emit.ts
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { FigmaNode, FigmaRestClient } from './client.js';

export interface EmitSnapshotOptions {
  fileKey: string;
  pages: string[];               // page names to include (e.g. ['Composites', 'Dashboard Screens'])
  outDir: string;                // <worktree>/.crew/figma-snapshot
  client: FigmaRestClient;
  fetchImage?: (url: string) => Promise<Buffer>;
  imageScale?: number;
}

export interface EmitSnapshotResult {
  nodesExported: number;
}

interface IndexEntry {
  name: string;
  type: string;
  page: string;
  screenshotPath: string;
  metadataPath: string;
}

const PAGE_DIR_MAP: Record<string, string> = {
  Composites: 'composites',
  'Dashboard Screens': 'screens',
};

function pageDir(name: string): string {
  return PAGE_DIR_MAP[name] ?? name.toLowerCase().replace(/\s+/g, '-');
}

async function defaultFetchImage(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`image fetch ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function emitSnapshot(opts: EmitSnapshotOptions): Promise<EmitSnapshotResult> {
  const fetchImage = opts.fetchImage ?? defaultFetchImage;
  const file = await opts.client.getFile(opts.fileKey);
  const pages = (file.document.children ?? []).filter(
    (c) => c.type === 'CANVAS' && opts.pages.includes(c.name),
  );

  await mkdir(opts.outDir, { recursive: true });

  const targets: Array<{ node: FigmaNode; page: string; dir: string }> = [];
  for (const page of pages) {
    const dir = pageDir(page.name);
    await mkdir(join(opts.outDir, dir), { recursive: true });
    for (const child of page.children ?? []) {
      if (child.type === 'COMPONENT' || child.type === 'COMPONENT_SET' || child.type === 'FRAME') {
        targets.push({ node: child, page: page.name, dir });
      }
    }
  }

  if (targets.length === 0) return { nodesExported: 0 };

  // Fetch all images in one REST call (Figma supports comma-separated ids)
  const ids = targets.map((t) => t.node.id);
  const images = await opts.client.getImages(opts.fileKey, ids, opts.imageScale ?? 2);

  const index: Record<string, IndexEntry> = {};
  for (const t of targets) {
    const safeId = t.node.id.replace(':', '-');
    const pngPath = join(t.dir, `${safeId}.png`);
    const jsonPath = join(t.dir, `${safeId}.json`);
    const cdnUrl = images.images[t.node.id];
    if (cdnUrl) {
      const buf = await fetchImage(cdnUrl);
      await writeFile(join(opts.outDir, pngPath), buf);
    }
    // Per-component JSON contains the node tree (subset for now)
    await writeFile(
      join(opts.outDir, jsonPath),
      JSON.stringify(
        { id: t.node.id, name: t.node.name, type: t.node.type, page: t.page, raw: t.node },
        null,
        2,
      ),
    );
    index[t.node.id] = {
      name: t.node.name,
      type: t.node.type,
      page: t.page,
      screenshotPath: pngPath,
      metadataPath: jsonPath,
    };
  }

  await writeFile(join(opts.outDir, 'index.json'), JSON.stringify(index, null, 2));

  return { nodesExported: targets.length };
}
```

- [ ] **Step 4: Run test (expect pass)**

```bash
cd packages/cli && npm run test -- figma-snapshot/emit
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/figma-snapshot/emit.ts \
        packages/cli/src/lib/figma-snapshot/emit.test.ts
git commit -m "feat(cli): emitSnapshot writes per-component PNG + JSON + index.json"
```

#### Task B1.5: Wire emit into the command

**Files:**
- Modify: `packages/cli/src/commands/figma-snapshot.ts`
- Modify: `packages/cli/src/commands/figma-snapshot.test.ts`

- [ ] **Step 1: Extend test to cover real path**

Add to `figma-snapshot.test.ts`:

```ts
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

it('writes a snapshot to <worktree>/.crew/figma-snapshot when visual_fidelity is configured', async () => {
  const worktree = mkdtempSync(join(tmpdir(), 'crew-fig-snap-'));
  const mockClient = {
    getFile: async () => ({
      document: {
        id: '0:0', name: 'Document', type: 'DOCUMENT',
        children: [
          { id: '212:630', name: 'Composites', type: 'CANVAS',
            children: [{ id: '272:120', name: 'Pill', type: 'COMPONENT_SET', children: [] }] },
        ],
      },
    }),
    getImages: async () => ({ images: { '272:120': 'https://cdn/x.png' } }),
  };
  const result = await runFigmaSnapshot({
    worktree,
    config: {
      visual_fidelity: {
        figma_file_key: 'FILEKEY',
        figma_pages: ['Composites'],
        component_dir: 'src',
        dashboard_url: 'http://localhost:3000',
        snapshot_path: '.crew/figma-snapshot',
        code_connect_glob: '**/*.figma.tsx',
        skip_snapshot: false,
      },
    } as never,
    log: () => {},
    clientFactory: () => mockClient as never,
    fetchImage: async () => Buffer.from('fake'),
  });
  expect(result.ok).toBe(true);
  expect(result.nodesExported).toBe(1);
  expect(existsSync(join(worktree, '.crew/figma-snapshot/composites/272-120.png'))).toBe(true);
  rmSync(worktree, { recursive: true });
});
```

- [ ] **Step 2: Run test (expect failure — runFigmaSnapshot doesn't take clientFactory yet)**

```bash
cd packages/cli && npm run test -- figma-snapshot --run
```

- [ ] **Step 3: Wire emit into runFigmaSnapshot**

```ts
// packages/cli/src/commands/figma-snapshot.ts — replace the stub body
import { join } from 'node:path';
import { FigmaRestClient, emitSnapshot } from '../lib/index.js';

export interface FigmaSnapshotDeps {
  worktree: string;
  config: ProjectConfig;
  log: (msg: string) => void;
  clientFactory?: () => FigmaRestClient;     // test seam
  fetchImage?: (url: string) => Promise<Buffer>;   // test seam
}

export async function runFigmaSnapshot(deps: FigmaSnapshotDeps): Promise<FigmaSnapshotResult> {
  const vf = deps.config.visual_fidelity;
  if (!vf) return { ok: false, reason: 'No [visual_fidelity] block in project config; nothing to snapshot.' };
  if (vf.skip_snapshot) return { ok: true, reason: 'skip_snapshot=true; no-op', nodesExported: 0 };

  const client = deps.clientFactory?.() ?? new FigmaRestClient();
  const outDir = join(deps.worktree, vf.snapshot_path);
  deps.log(`figma-snapshot: exporting pages ${vf.figma_pages.join(', ')} → ${outDir}`);
  const { nodesExported } = await emitSnapshot({
    fileKey: vf.figma_file_key,
    pages: vf.figma_pages,
    outDir,
    client,
    fetchImage: deps.fetchImage,
  });
  deps.log(`figma-snapshot: exported ${nodesExported} nodes`);
  return { ok: true, nodesExported };
}
```

- [ ] **Step 4: Run test (expect pass)**

```bash
cd packages/cli && npm run test -- figma-snapshot --run
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/figma-snapshot.ts \
        packages/cli/src/commands/figma-snapshot.test.ts
git commit -m "feat(cli): crew figma-snapshot writes snapshot to worktree"
```

#### Task B1.6: Update README + add `.crew/visual-fidelity.json` to crew's own config

**Files:**
- Modify: `README.md` (document figma-snapshot + the env var)
- Create: `packages/dashboard/.crew/visual-fidelity.json` (crew's own dashboard project config — eat your own dog food)

Wait — `.crew/visual-fidelity.json` is OUTSIDE the project-config schema. Re-reading the spec: the config lives at `<repo>/.crew/visual-fidelity.json` separately from the main crew project TOML. Let me reconcile: actually we put the schema INSIDE the main project-config TOML in B1.1 — so the file is just `~/.config/crew/projects/crew.toml`, not a separate JSON. Update task: the example config lives in `~/.config/crew/projects/crew.toml` under `[visual_fidelity]`.

- [ ] **Step 1: Update README**

Add a section to `README.md`:

```markdown
### Visual-fidelity verification

If your project has a Figma source-of-truth for its UI components, add a
`[visual_fidelity]` block to its crew project config (`~/.config/crew/projects/<project>.toml`):

\`\`\`toml
[visual_fidelity]
figma_file_key = "9FeJPriqdsdA4n9R5Xsrr8"
figma_pages = ["Composites", "Dashboard Screens"]
component_dir = "packages/dashboard/src/components"
dashboard_url = "\${DASHBOARD_URL}"
\`\`\`

Then set \`FIGMA_API_TOKEN\` in your shell (token from
https://www.figma.com/developers/api#access-tokens — read scope only).

\`crew figma-snapshot\` exports the file to \`<worktree>/.crew/figma-snapshot/\`.
\`crew run\` calls it automatically before dispatching the agent.
```

- [ ] **Step 2: Add `[visual_fidelity]` to crew's own project config**

Edit `~/.config/crew/projects/crew.toml` (or local equivalent) to add the block. NOTE: this is host config, not committed to the repo. Skip if running in CI; document the manual step in README.

- [ ] **Step 3: Smoke-test end-to-end**

```bash
export FIGMA_API_TOKEN=<your-token>
cd <crew-worktree>
crew figma-snapshot
ls .crew/figma-snapshot/composites/ | head -5
```

Expected: several PNGs + JSONs.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs(readme): document crew figma-snapshot + FIGMA_API_TOKEN setup"
```

### T-B2: `crew run` dispatch integration

Calls `crew figma-snapshot` before agent dispatch and updates the agent's run-prompt to require the visual-fidelity-check skill.

#### Task B2.1: Call figma-snapshot from `crew run` pre-dispatch

**Files:**
- Modify: `packages/cli/src/commands/run.ts` (or wherever the dispatch flow orchestrates pre-dispatch steps)
- Modify: `packages/cli/src/commands/run.test.ts`

The crew CLI's `run` command currently does env materialization, docker bringup, MCP file writing, then dispatch. Insert the figma-snapshot step between MCP and dispatch.

- [ ] **Step 1: Write a test asserting `crew run` calls figma-snapshot when visual_fidelity is configured**

(Adapt to whatever testing pattern is used in `run.test.ts` — likely a stubbed dispatch loop with spies on the sub-steps.)

```ts
it('calls runFigmaSnapshot before dispatch when visual_fidelity is configured', async () => {
  const figmaSnapshotSpy = vi.fn().mockResolvedValue({ ok: true, nodesExported: 50 });
  const dispatchSpy = vi.fn();
  await runCrew({
    config: { /* ... with visual_fidelity */ } as never,
    figmaSnapshot: figmaSnapshotSpy,
    dispatch: dispatchSpy,
    // ... other deps
  });
  expect(figmaSnapshotSpy).toHaveBeenCalled();
  expect(figmaSnapshotSpy.mock.invocationCallOrder[0]).toBeLessThan(dispatchSpy.mock.invocationCallOrder[0]);
});

it('skips figma-snapshot when visual_fidelity is absent', async () => {
  const figmaSnapshotSpy = vi.fn();
  const dispatchSpy = vi.fn();
  await runCrew({
    config: { /* no visual_fidelity */ } as never,
    figmaSnapshot: figmaSnapshotSpy,
    dispatch: dispatchSpy,
  });
  expect(figmaSnapshotSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run test (expect failure)**

```bash
cd packages/cli && npm run test -- run.test
```

- [ ] **Step 3: Insert the figma-snapshot call in run.ts**

In the run flow, after MCP-file-write and before dispatch, add:

```ts
if (deps.config.visual_fidelity) {
  deps.log('▸ Generating Figma snapshot for visual verification…');
  const snap = await deps.figmaSnapshot({ worktree, config: deps.config, log: deps.log });
  if (!snap.ok) {
    deps.warn(`figma-snapshot failed: ${snap.reason}. Continuing without snapshot.`);
  } else {
    deps.log(`✓ Figma snapshot: ${snap.nodesExported} nodes → ${join(worktree, deps.config.visual_fidelity.snapshot_path)}`);
  }
}
```

Add `figmaSnapshot` to `RunDeps` as a function-shaped dep with the default being `runFigmaSnapshot` from `../commands/figma-snapshot.js` (test seam).

- [ ] **Step 4: Run test (expect pass)**

```bash
cd packages/cli && npm run test -- run.test
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/commands/run.ts packages/cli/src/commands/run.test.ts
git commit -m "feat(cli): crew run calls figma-snapshot before dispatch when configured"
```

#### Task B2.2: Update the dispatch agent's run-prompt with the visual-fidelity gate

**Files:**
- Modify: `packages/cli/src/lib/run-prompt/*` (wherever the agent's dispatch prompt is templated — find via `grep -rn 'run-prompt\|dispatchPrompt\|agentPrompt' packages/cli/src/`)
- Test: extend existing run-prompt tests

The dispatch prompt currently includes sections on docker, MCP, sandbox-network-note, etc. Add a "Visual verification gate" section when `visual_fidelity` is configured.

- [ ] **Step 1: Find the run-prompt template**

```bash
grep -rn 'sandbox-network-note\|run-prompt' packages/cli/src/ | head -10
```

- [ ] **Step 2: Write a test asserting the visual-verification section is included**

```ts
it('includes a visual-fidelity-check gate when visual_fidelity is configured', () => {
  const prompt = buildRunPrompt({
    config: { /* with visual_fidelity */ } as never,
    worktree: '/tmp/wt',
  });
  expect(prompt).toMatch(/visual-fidelity-check/);
  expect(prompt).toMatch(/before claiming.*complete/i);
});

it('omits the gate section when visual_fidelity is absent', () => {
  const prompt = buildRunPrompt({
    config: { /* no visual_fidelity */ } as never,
    worktree: '/tmp/wt',
  });
  expect(prompt).not.toMatch(/visual-fidelity-check/);
});
```

- [ ] **Step 3: Add the gate-template fragment**

```ts
// In the run-prompt templating module
function visualFidelityGateSection(config: ProjectConfig, worktree: string): string {
  if (!config.visual_fidelity) return '';
  const snap = join(worktree, config.visual_fidelity.snapshot_path);
  return `
## Visual verification gate

This project has visual-fidelity verification enabled. Before claiming any
UI-touching task complete (file changes under \`${config.visual_fidelity.component_dir}\`,
or any new/modified \`.figma.tsx\` file), you MUST invoke the
\`visual-fidelity-check\` skill.

- Figma snapshot is pre-generated at: \`${snap}\`
- Project config: \`<repo>/.crew/visual-fidelity.json\` if present, else the [visual_fidelity] block on the main project config
- The skill reads the snapshot from disk; you do NOT need Figma network access

Do not claim a UI-touching task done without running this skill, even if tests
pass, even if the build is clean. The skill is the gate.
`.trim();
}
```

Slot it into the run-prompt assembly alongside the existing sections (docker, sandbox, etc.).

- [ ] **Step 4: Run test (expect pass)**

```bash
cd packages/cli && npm run test -- run-prompt
```

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/run-prompt/* packages/cli/src/lib/run-prompt/*.test.ts
git commit -m "feat(cli): run-prompt includes visual-fidelity-check gate when configured"
```

#### Task B2.3: End-to-end smoke

**Files:** (no new files; this is an exercise to validate the wiring)

- [ ] **Step 1: Set up the test environment**

```bash
# In the crew worktree:
export FIGMA_API_TOKEN=<token>
# Make sure crew.toml has [visual_fidelity] section
crew figma-snapshot         # standalone — should write ~50 PNGs to .crew/figma-snapshot/
```

- [ ] **Step 2: Dispatch a test ticket**

Either re-dispatch CREW-135 in a fresh worktree, or create a new "smoke test" ticket CREW-XXX with a trivial UI change ("change one button label"). Run:

```bash
crew run CREW-XXX
```

- [ ] **Step 3: Verify the dispatch flow**

Watch the `crew run` output for the new figma-snapshot step. Confirm `<worktree>/.crew/figma-snapshot/` is populated. Once the agent is running, check its transcript for the visual-fidelity-check skill invocation.

- [ ] **Step 4: Verify agent's findings report**

After the agent completes, inspect its PR. The visual-fidelity-check report should be in the PR description or a comment. Verify it ran, even if the smoke ticket had no real visual regressions.

- [ ] **Step 5: If everything works, no commit — this is verification only**

If wiring issues surface, file them as new tasks in B2.x or as followups.

### Phase B verification

After T-B1 + T-B2 land:

- `crew figma-snapshot` works standalone in any crew worktree with a `[visual_fidelity]` config + `FIGMA_API_TOKEN`
- `crew run` calls it automatically before dispatch
- The dispatched agent's run-prompt includes the visual-fidelity-check gate
- One end-to-end smoke dispatch confirms the agent finds + reads the snapshot, invokes the skill, and reports findings
- All tests pass: `cd packages/cli && npm run typecheck && npm run lint && npm run test`

---

## Spec coverage check

| Spec section | Plan tasks |
|---|---|
| Piece 1: Figma snapshot generator | T-B1 (tasks B1.1–B1.6) |
| Piece 2: visual-fidelity-check skill | Phase A (tasks A.5, calibrated via A.6) |
| Piece 3: Skill validation harness | Phase A (tasks A.1–A.4 + A.6) |
| Dispatch flow integration | T-B2 (tasks B2.1–B2.3) |
| Project config at `<repo>/.crew/visual-fidelity.json` (per spec) — adapted to `[visual_fidelity]` in the main TOML | T-B1 (task B1.1 + B1.6) |
| Snapshot output structure | T-B1 (tasks B1.4) |
| Per-component JSON shape | T-B1 (task B1.4) + Phase A (task A.2 for the first fixture, hand-rolled with richer data than REST alone) |
| variables.json | Phase A (task A.2 for fixture); deferred from B1 — variables come from project's own state-meta source (see "Plan deviations" below) |
| Skill workflow | Phase A (task A.5) — content from spec |
| Skill structure (SKILL.md + workflow.md + examples) | Phase A (task A.5) |
| Skill authoring approach (via superpowers:writing-skills) | Phase A (task A.5) |
| First fixture (CREW-135) | Phase A (tasks A.2–A.4) |
| Validation loop | Phase A (task A.6) |
| Testing strategy | Each task has tests; harness validation in A.6 |

## Plan deviations from spec

- **Spec mentions `<repo>/.crew/visual-fidelity.json` as project config; plan uses the main crew project TOML's `[visual_fidelity]` block instead.** Reason: the main crew project TOML is already the source of project-config truth (env, docker, playwright, etc.). Adding a sibling JSON would split the truth surface. The block-in-TOML pattern matches every other crew project config concern.
- **Spec's per-component JSON includes `tokenAlias` per fill (binding name like `tw/colors/slate/1050`); plan's REST-API-based implementation can't populate that field without Figma Enterprise.** Reason: variable bindings are only exposed in the Plugin API (not REST). Mitigation: the agent's skill reads the project's own state-meta module (e.g., `packages/dashboard/src/data/state-meta.ts` for crew dashboard) to map hex values back to Tailwind tokens. The bridge from "hex in Figma snapshot" → "Tailwind class in code" happens skill-side, not snapshot-side. For the Phase A hand-rolled fixture, the Plugin API IS used (this conversation's MCP access), so the fixture data has full bindings; only the automated B1 snapshot lacks them.
- **`variables.json` is part of the spec but is not emitted by the B1 snapshot generator.** Reason: same as above — variables aren't fetchable via REST. The skill instead relies on the project's own token map. If/when we move to Plugin-API-based snapshotting, variables.json comes back in.

## Self-review: placeholder scan

- No "TBD" / "TODO" placeholders in step instructions.
- A.5 ("Author the skill") is intentionally less granular than B1 tasks — it's in-chat collaborative work driven by `superpowers:writing-skills`, not a dispatched-agent execution.
- A.6 ("Calibrate") has an open-ended loop ("repeat until accuracy is acceptable") — by design; user judgment ends the loop.
- B2.3 ("End-to-end smoke") is verification not implementation — no commit step intentionally.

## Followups (filed elsewhere, do NOT block this plan)

Near-term:

- **Playwright e2e chromium binary cache fix** — separate followup
- **superpowers-chrome evaluation** — separate followup
- **Plugin-API snapshot generator (replaces REST)** — file as a near-term followup once B1 lands. The REST approach is "good enough for now" but loses variable bindings; promoting to Plugin API is the right long-term shape.

Long-tail:

- **Plugin-level skill distribution** — when a second project adopts the skill, promote from `~/.claude/skills/` to a versioned plugin
- **Automated perceptual diff** — replace agent eyeball comparison with a real pixel-diff engine
- **Snapshot caching** — currently regenerated every dispatch; cache-by-Figma-file-version when generation becomes slow
