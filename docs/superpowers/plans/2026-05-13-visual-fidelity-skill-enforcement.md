# Visual-fidelity-check skill enforcement (Thread B1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `visual-fidelity-check` skill fire reliably on every UI-touching `crew run` dispatch — via a numbered workflow step, dispatcher-side skill injection into worktrees, and a PreToolUse hook as a hard-gate fallback.

**Architecture:** The dispatch run-prompt template gains a numbered "Visual fidelity gate" step (B1.1). The crew CLI dispatcher gains a generic skill-injection step that copies skill directories from `packages/cli/src/lib/skills/<name>/` into each worktree's `.claude/skills/<name>/` based on per-project applicability rules (B1.2b). A PreToolUse hook on `gh pr create` blocks the call when the active session transcript shows no `visual-fidelity-check` invocation (B1.3). The skill content itself already landed in PR #189 — this plan implements the runtime around it.

**Tech Stack:** TypeScript (Node 20+), Vitest, commander, execa, picocolors. Hook script is bash (per spec's open-question default).

**Spec:** `docs/superpowers/specs/2026-05-13-visual-fidelity-skill-enforcement.md`

---

## Phase 1 — Visual-fidelity numbered workflow step (B1.1)

### Task 1.1: Restructure `ticket-visual-fidelity.md` to render a numbered workflow step body

**Files:**
- Modify: `packages/cli/src/lib/prompts/templates/ticket-visual-fidelity.md`

The current template renders an `## Visual-fidelity verification` H2 between numbered steps. After this task, it renders the body of a numbered step 8 — no H2, no leading blank line that would orphan it from the step number injected by `ticket.md`.

- [ ] **Step 1: Replace the template contents**

Replace the entire file with:

```markdown
8. **Visual fidelity gate** (this project's UI work). Invoke the `visual-fidelity-check` skill. The skill compares your rendered work against the Figma snapshot at **`{{snapshotPath}}`** (an `index.json` plus per-component PNG + JSON) and reports structural / caller / visual mismatches across **`{{componentDir}}`** (including any new or modified `.figma.tsx` files). Fix any high-severity findings before proceeding; surface medium/low findings in the PR description. The skill reads the snapshot from disk — no Figma network access is required from inside the sandbox.

   **Fail-closed:** if the snapshot is missing, or the comparison can't run, stop and surface the blocker. Do not treat "couldn't run" as "passed."

   This step is required IN ADDITION TO step 9 (Verify) — that step covers tests, lint, and build correctness; this one covers visual fidelity. They are not interchangeable. Running one does not replace the other.
```

- [ ] **Step 2: Commit**

```bash
git add packages/cli/src/lib/prompts/templates/ticket-visual-fidelity.md
git commit -m "feat(cli): make ticket-visual-fidelity render as numbered step 8 body"
```

### Task 1.2: Renumber the subsequent steps in `ticket.md` and re-anchor the block

**Files:**
- Modify: `packages/cli/src/lib/prompts/templates/ticket.md`

Steps 8 (Verify), 9 (Self-review), 10 (Push and PR), 11 (Move to In Review), 12 (Final report) become 9, 10, 11, 12, 13. The `{{visualFidelityBlock}}` placeholder moves to where the new step 8 belongs and loses any surrounding prose that previously framed it as an aside.

- [ ] **Step 1: Update the workflow section**

In `packages/cli/src/lib/prompts/templates/ticket.md`, locate the existing block:

```
7. **Execute, committing per step.** Use `superpowers:test-driven-development`. Frequent small commits referencing `{{key}}`.
{{playwrightBlock}}
{{brunoSmokeBlock}}
{{visualFidelityBlock}}
{{sandboxNetworkBlock}}
8. **Verify.** Invoke `superpowers:verification-before-completion`. Run lint / format / typecheck / test:run.

9. **Self-review.** Invoke `superpowers:requesting-code-review`.

10. **Push and PR.**
```

Replace with:

```
7. **Execute, committing per step.** Use `superpowers:test-driven-development`. Frequent small commits referencing `{{key}}`.
{{playwrightBlock}}
{{brunoSmokeBlock}}
{{sandboxNetworkBlock}}
{{visualFidelityBlock}}
9. **Verify.** Invoke `superpowers:verification-before-completion`. Run lint / format / typecheck / test:run.

10. **Self-review.** Invoke `superpowers:requesting-code-review`.

11. **Push and PR.**
```

Note: `{{visualFidelityBlock}}` already starts with its own `8.` prefix from Task 1.1 — keep it as the last template-injected block so the numbered sequence reads 7 → (optional 8 from the block) → 9. When the project has no visual-fidelity config the block renders empty and the agent sees 7 → 9 (skipping 8); that's acceptable because the numbered scheme is for legibility, not execution-order semantics.

- [ ] **Step 2: Update the push command block + remaining numbered steps**

In the same file, find the `## Push and PR` command + the steps that follow it. Renumber:

- `11. **Move {{key}} to "In Review".**` → `12.`
- `12. **Final report.**` → `13.`

The exact final-report shell block stays as-is — only the leading numeral changes.

- [ ] **Step 3: Run existing prompt-rendering tests to see them fail**

```bash
npm run test --workspace=crew-cli -- packages/cli/src/lib/prompts/builders.test.ts packages/cli/src/lib/prompts/render.test.ts 2>&1 | tail -40
```

Expected: snapshot tests under `packages/cli/src/lib/prompts/__snapshots__/` fail (their committed snapshots predate the renumbering).

- [ ] **Step 4: Update the snapshots**

```bash
npm run test --workspace=crew-cli -- packages/cli/src/lib/prompts/builders.test.ts packages/cli/src/lib/prompts/render.test.ts -u 2>&1 | tail -20
```

Inspect the diff in `packages/cli/src/lib/prompts/__snapshots__/` — verify only the numeral changes (8→9, 9→10, etc.) and the new visual-fidelity step body landed. Reject if anything else moved.

```bash
git diff packages/cli/src/lib/prompts/__snapshots__/
```

- [ ] **Step 5: Add a focused test for the numbered-step behavior**

Append to `packages/cli/src/lib/prompts/builders.test.ts`:

```ts
it('renders the visual-fidelity block as numbered step 8 body when visualFidelity is provided', () => {
  const out = buildTicketPrompt({
    key: 'CREW-999',
    githubRepo: 'foo/bar',
    jiraSite: 'https://x.atlassian.net',
    visualFidelity: { snapshotPath: '.crew/snap', componentDir: 'packages/dashboard/src/components' },
  });
  expect(out).toMatch(/^8\. \*\*Visual fidelity gate\*\*/m);
  expect(out).toMatch(/^9\. \*\*Verify\.\*\*/m);
  expect(out).toMatch(/IN ADDITION TO step 9/);
});

it('omits step 8 entirely when visualFidelity is not provided', () => {
  const out = buildTicketPrompt({
    key: 'CREW-999',
    githubRepo: 'foo/bar',
    jiraSite: 'https://x.atlassian.net',
  });
  expect(out).not.toMatch(/Visual fidelity gate/);
  // step 9 still exists at its renumbered position
  expect(out).toMatch(/^9\. \*\*Verify\.\*\*/m);
});
```

- [ ] **Step 6: Run the new tests and confirm pass**

```bash
npm run test --workspace=crew-cli -- packages/cli/src/lib/prompts/builders.test.ts 2>&1 | tail -20
```

Expected: all builders tests pass, including the two new cases.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/lib/prompts/templates/ticket.md packages/cli/src/lib/prompts/__snapshots__/ packages/cli/src/lib/prompts/builders.test.ts
git commit -m "feat(cli): promote visual-fidelity to numbered step 8 of dispatch workflow"
```

---

## Phase 2 — Dispatcher skill injection (B1.2b)

The crew CLI dispatcher gains a generic skill-injection step that copies skill directories from `packages/cli/src/lib/skills/<name>/` into the dispatched worktree's `.claude/skills/<name>/` before the agent boots. Applicability rules are per-skill — `visual-fidelity-check` injects only when `config.visual_fidelity` is set.

> **Project-specific:** mirrors the pattern in `packages/cli/src/lib/run/figma-snapshot-step.ts` (gated on `config.visual_fidelity`, worktree-targeted, non-fatal on failure with `log`/`warn` callbacks).

### Task 2.1: Author the applicability + discovery helper

**Files:**
- Create: `packages/cli/src/lib/run/skill-injection.ts`
- Create: `packages/cli/src/lib/run/skill-injection.test.ts`

A small pure module that, given a `ProjectConfig`, returns the list of skill names that should be injected into a worktree for that project. Starts with one rule (`visual-fidelity-check` ↔ `config.visual_fidelity`) and is shaped so adding more is one entry.

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/lib/run/skill-injection.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { ProjectConfig } from 'crew-shared';
import { skillsApplicableTo } from './skill-injection.js';

const baseConfig: ProjectConfig = {
  name: 'crew',
  repo_path: '/tmp/repo',
  default_branch: 'main',
  github: { repo: 'foo/bar' },
  jira: { site: 'https://x.atlassian.net', project_key: 'CREW' },
} as ProjectConfig;

describe('skillsApplicableTo', () => {
  it('returns no skills when no per-skill config is set', () => {
    expect(skillsApplicableTo(baseConfig)).toEqual([]);
  });

  it('returns visual-fidelity-check when visual_fidelity is configured', () => {
    const config = {
      ...baseConfig,
      visual_fidelity: { snapshot_path: '.crew/snap', component_dir: 'packages/dashboard/src/components' },
    } as ProjectConfig;
    expect(skillsApplicableTo(config)).toEqual(['visual-fidelity-check']);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
npm run test --workspace=crew-cli -- packages/cli/src/lib/run/skill-injection.test.ts 2>&1 | tail -10
```

Expected: FAIL with "Failed to resolve import" or "skillsApplicableTo is not defined".

- [ ] **Step 3: Create the helper module**

Create `packages/cli/src/lib/run/skill-injection.ts`:

```ts
import type { ProjectConfig } from 'crew-shared';

/**
 * Skills the dispatcher injects into the worktree's `.claude/skills/` based
 * on per-project config. Adding a new dispatcher-managed skill: add its name
 * here, paired with the config field that gates it.
 */
const SKILL_APPLICABILITY: ReadonlyArray<{
  name: string;
  applicable: (config: ProjectConfig) => boolean;
}> = [
  {
    name: 'visual-fidelity-check',
    applicable: (config) => Boolean(config.visual_fidelity),
  },
];

export function skillsApplicableTo(config: ProjectConfig): string[] {
  return SKILL_APPLICABILITY.filter((entry) => entry.applicable(config)).map((entry) => entry.name);
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npm run test --workspace=crew-cli -- packages/cli/src/lib/run/skill-injection.test.ts 2>&1 | tail -10
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/run/skill-injection.ts packages/cli/src/lib/run/skill-injection.test.ts
git commit -m "feat(cli): add skillsApplicableTo helper for dispatcher skill injection"
```

### Task 2.2: Implement the copy-skill-into-worktree function

**Files:**
- Modify: `packages/cli/src/lib/run/skill-injection.ts`
- Modify: `packages/cli/src/lib/run/skill-injection.test.ts`

Add `copySkillIntoWorktree(worktree, skillName, sourceRoot)` that copies the skill directory and returns where it landed. The function does not check applicability — that's the caller's job (it uses `skillsApplicableTo`).

- [ ] **Step 1: Write the failing test**

Append to `packages/cli/src/lib/run/skill-injection.test.ts`:

```ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { copySkillIntoWorktree } from './skill-injection.js';

describe('copySkillIntoWorktree', () => {
  it('copies SKILL.md, workflow.md, and examples/ into <worktree>/.claude/skills/<name>/', () => {
    const root = mkdtempSync(join(tmpdir(), 'crew-skill-inject-'));
    const worktree = join(root, 'worktree');
    const sourceRoot = join(root, 'src-skills');

    // Source layout
    mkdirSync(join(sourceRoot, 'visual-fidelity-check', 'examples'), { recursive: true });
    writeFileSync(join(sourceRoot, 'visual-fidelity-check', 'SKILL.md'), '# skill\n');
    writeFileSync(join(sourceRoot, 'visual-fidelity-check', 'workflow.md'), '# workflow\n');
    writeFileSync(join(sourceRoot, 'visual-fidelity-check', 'examples', 'good.md'), '# good\n');

    mkdirSync(worktree, { recursive: true });

    const result = copySkillIntoWorktree(worktree, 'visual-fidelity-check', sourceRoot);

    expect(result.destDir).toBe(join(worktree, '.claude', 'skills', 'visual-fidelity-check'));
    expect(readFileSync(join(result.destDir, 'SKILL.md'), 'utf8')).toBe('# skill\n');
    expect(readFileSync(join(result.destDir, 'workflow.md'), 'utf8')).toBe('# workflow\n');
    expect(readFileSync(join(result.destDir, 'examples', 'good.md'), 'utf8')).toBe('# good\n');
  });

  it('throws when the source skill directory does not exist', () => {
    const root = mkdtempSync(join(tmpdir(), 'crew-skill-inject-missing-'));
    mkdirSync(join(root, 'worktree'), { recursive: true });
    expect(() => copySkillIntoWorktree(join(root, 'worktree'), 'nope', join(root, 'src-skills'))).toThrow(
      /skill directory not found/i,
    );
  });
});
```

- [ ] **Step 2: Run tests to confirm new ones fail**

```bash
npm run test --workspace=crew-cli -- packages/cli/src/lib/run/skill-injection.test.ts 2>&1 | tail -20
```

Expected: FAIL with "copySkillIntoWorktree is not defined" or import error.

- [ ] **Step 3: Implement `copySkillIntoWorktree`**

Append to `packages/cli/src/lib/run/skill-injection.ts`:

```ts
import { cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

export interface CopySkillResult {
  destDir: string;
}

export function copySkillIntoWorktree(
  worktree: string,
  skillName: string,
  sourceRoot: string,
): CopySkillResult {
  const srcDir = join(sourceRoot, skillName);
  if (!existsSync(srcDir) || !statSync(srcDir).isDirectory()) {
    throw new Error(`copySkillIntoWorktree: skill directory not found at ${srcDir}`);
  }
  const destDir = join(worktree, '.claude', 'skills', skillName);
  mkdirSync(join(worktree, '.claude', 'skills'), { recursive: true });
  cpSync(srcDir, destDir, { recursive: true });
  return { destDir };
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npm run test --workspace=crew-cli -- packages/cli/src/lib/run/skill-injection.test.ts 2>&1 | tail -15
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/run/skill-injection.ts packages/cli/src/lib/run/skill-injection.test.ts
git commit -m "feat(cli): add copySkillIntoWorktree for dispatcher skill injection"
```

### Task 2.3: Add the run-time orchestrator step

**Files:**
- Create: `packages/cli/src/lib/run/skill-injection-step.ts`
- Create: `packages/cli/src/lib/run/skill-injection-step.test.ts`

The orchestrator (`runSkillInjection`) is the function `run.ts` calls. It computes the applicable skills, copies each into the worktree, calls `log`/`warn` callbacks for visibility, and returns a result describing what landed. Mirrors `runPreDispatchFigmaSnapshot`'s shape.

- [ ] **Step 1: Write the failing test**

Create `packages/cli/src/lib/run/skill-injection-step.test.ts`:

```ts
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ProjectConfig } from 'crew-shared';
import { runSkillInjection } from './skill-injection-step.js';

function makeSourceRoot(skillNames: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'crew-skill-source-'));
  for (const name of skillNames) {
    mkdirSync(join(root, name), { recursive: true });
    writeFileSync(join(root, name, 'SKILL.md'), `# ${name}\n`);
  }
  return root;
}

function makeWorktree(): string {
  const wt = mkdtempSync(join(tmpdir(), 'crew-skill-wt-'));
  mkdirSync(wt, { recursive: true });
  return wt;
}

const baseConfig: ProjectConfig = {
  name: 'crew',
  repo_path: '/tmp/repo',
  default_branch: 'main',
  github: { repo: 'foo/bar' },
  jira: { site: 'https://x.atlassian.net', project_key: 'CREW' },
} as ProjectConfig;

describe('runSkillInjection', () => {
  it('returns "skipped" when no skills are applicable', async () => {
    const sourceRoot = makeSourceRoot(['visual-fidelity-check']);
    const worktree = makeWorktree();
    const log = vi.fn();
    const warn = vi.fn();
    const result = await runSkillInjection({ worktree, config: baseConfig, sourceRoot, log, warn });
    expect(result).toEqual({ kind: 'skipped' });
    expect(log).not.toHaveBeenCalled();
  });

  it('copies an applicable skill into the worktree and logs the destination', async () => {
    const sourceRoot = makeSourceRoot(['visual-fidelity-check']);
    const worktree = makeWorktree();
    const log = vi.fn();
    const warn = vi.fn();
    const config = {
      ...baseConfig,
      visual_fidelity: { snapshot_path: '.crew/snap', component_dir: 'packages/dashboard/src/components' },
    } as ProjectConfig;

    const result = await runSkillInjection({ worktree, config, sourceRoot, log, warn });
    expect(result).toEqual({ kind: 'ok', skillsInjected: ['visual-fidelity-check'] });
    expect(readFileSync(join(worktree, '.claude/skills/visual-fidelity-check/SKILL.md'), 'utf8')).toBe(
      '# visual-fidelity-check\n',
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('visual-fidelity-check'));
    expect(warn).not.toHaveBeenCalled();
  });

  it('warns and continues when a skill copy fails', async () => {
    const sourceRoot = makeSourceRoot([]); // intentionally missing visual-fidelity-check
    const worktree = makeWorktree();
    const log = vi.fn();
    const warn = vi.fn();
    const config = {
      ...baseConfig,
      visual_fidelity: { snapshot_path: '.crew/snap', component_dir: 'packages/dashboard/src/components' },
    } as ProjectConfig;

    const result = await runSkillInjection({ worktree, config, sourceRoot, log, warn });
    expect(result.kind).toBe('warning');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('visual-fidelity-check'));
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test --workspace=crew-cli -- packages/cli/src/lib/run/skill-injection-step.test.ts 2>&1 | tail -10
```

Expected: FAIL — module missing.

- [ ] **Step 3: Implement the orchestrator**

Create `packages/cli/src/lib/run/skill-injection-step.ts`:

```ts
import type { ProjectConfig } from 'crew-shared';
import { copySkillIntoWorktree, skillsApplicableTo } from './skill-injection.js';

export type SkillInjectionResult =
  | { kind: 'skipped' }
  | { kind: 'ok'; skillsInjected: string[] }
  | { kind: 'warning'; reason: string; skillsInjected: string[] };

export interface SkillInjectionOptions {
  worktree: string;
  config: ProjectConfig;
  /** Filesystem path containing skill directories. Default: packages/cli/src/lib/skills/ */
  sourceRoot: string;
  log: (msg: string) => void;
  warn: (msg: string) => void;
}

/**
 * Pre-dispatch step that copies each applicable skill from sourceRoot into
 * the worktree's `.claude/skills/<name>/`. Per-skill failures are non-fatal —
 * the dispatched agent's discovery still succeeds for any skills that did
 * land, and the missing skill's gate degrades naturally (e.g. visual-fidelity
 * gate reports "skill not loaded" via the PreToolUse hook in B1.3).
 */
export async function runSkillInjection(opts: SkillInjectionOptions): Promise<SkillInjectionResult> {
  const applicable = skillsApplicableTo(opts.config);
  if (applicable.length === 0) return { kind: 'skipped' };

  const injected: string[] = [];
  const failures: string[] = [];

  for (const name of applicable) {
    try {
      const { destDir } = copySkillIntoWorktree(opts.worktree, name, opts.sourceRoot);
      injected.push(name);
      opts.log(`skill-injection: ${name} → ${destDir}`);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      failures.push(`${name}: ${reason}`);
      opts.warn(`skill-injection: failed to inject ${name} — ${reason}`);
    }
  }

  if (failures.length > 0) {
    return { kind: 'warning', reason: failures.join('; '), skillsInjected: injected };
  }
  return { kind: 'ok', skillsInjected: injected };
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npm run test --workspace=crew-cli -- packages/cli/src/lib/run/skill-injection-step.test.ts 2>&1 | tail -15
```

Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/run/skill-injection-step.ts packages/cli/src/lib/run/skill-injection-step.test.ts
git commit -m "feat(cli): add runSkillInjection pre-dispatch step"
```

### Task 2.4: Export from `lib/run/index.ts`

**Files:**
- Modify: `packages/cli/src/lib/run/index.ts`

Export the new public surface so `commands/run.ts` can import alongside the existing run-step exports.

- [ ] **Step 1: Add export**

Open `packages/cli/src/lib/run/index.ts`. Add (near the existing `runPreDispatchFigmaSnapshot` export):

```ts
export { runSkillInjection, type SkillInjectionResult, type SkillInjectionOptions } from './skill-injection-step.js';
```

- [ ] **Step 2: Verify typecheck**

```bash
npm run typecheck --workspace=crew-cli 2>&1 | tail -10
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/lib/run/index.ts
git commit -m "feat(cli): export runSkillInjection from lib/run barrel"
```

### Task 2.5: Wire into `commands/run.ts`

**Files:**
- Modify: `packages/cli/src/commands/run.ts`

The skill-injection step runs after the figma-snapshot step (which materializes the snapshot the skill compares against) and before `prepareAgentEnvironment` (which sets up the agent's MCP config). Co-locating the two visual-fidelity pre-dispatch hooks makes the dependency obvious.

- [ ] **Step 1: Locate the figma-snapshot call site**

Read `packages/cli/src/commands/run.ts:342-350` — the existing block:

```ts
if (config.visual_fidelity) {
  console.log(pc.dim('→ generating Figma snapshot for visual-fidelity verification…'));
  await runPreDispatchFigmaSnapshot({
    worktree,
    config,
    log: (msg) => console.log(pc.dim(`    ${msg}`)),
    warn: (msg) => console.warn(pc.yellow(`  ! ${msg}`)),
  });
}
```

- [ ] **Step 2: Add the skill-injection step right after**

Immediately after that block, add (inside the `if (config.visual_fidelity)` body — the only project that gets skill injection today is one with visual_fidelity, so co-locating is correct):

```ts
console.log(pc.dim('→ injecting dispatcher-managed skills into the worktree…'));
const skillsSourceRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'lib',
  'skills',
);
await runSkillInjection({
  worktree,
  config,
  sourceRoot: skillsSourceRoot,
  log: (msg) => console.log(pc.dim(`    ${msg}`)),
  warn: (msg) => console.warn(pc.yellow(`  ! ${msg}`)),
});
```

`fileURLToPath` and `dirname` are not yet imported in `run.ts`. Add to the existing `node:` imports at the top of the file:

```ts
import { dirname, basename, join } from 'node:path';   // basename + join already there; add dirname
import { fileURLToPath } from 'node:url';              // new
```

Also add `runSkillInjection` to the existing import block from `../lib/run/index.js`:

```ts
import {
  // ... existing imports
  runPreDispatchFigmaSnapshot,
  runSkillInjection,            // new
  // ... existing imports
} from '../lib/run/index.js';
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck --workspace=crew-cli 2>&1 | tail -10
```

Expected: clean. Resolve any import-path issues if `import.meta.url` produces a different layout in the built output vs source (the source compiles to `dist/commands/run.js`, so `../lib/skills` resolves to `dist/lib/skills`; the build step must copy the skill files into `dist/lib/skills/` — see Task 2.6 next).

- [ ] **Step 4: Commit**

```bash
git add packages/cli/src/commands/run.ts
git commit -m "feat(cli): wire runSkillInjection into crew run pre-dispatch flow"
```

### Task 2.6: Ensure skill files are included in the built CLI output

**Files:**
- Modify: `packages/cli/package.json` (potentially)
- Modify: `packages/cli/tsconfig.json` (potentially)

The skill files are markdown — TypeScript's compiler ignores them by default. They need to land in `dist/lib/skills/` so the production CLI binary can read them via the `import.meta.url`-derived path.

- [ ] **Step 1: Inspect the current build output**

```bash
npm run build --workspace=crew-cli 2>&1 | tail -15
ls /home/safturento/Repos/crew/packages/cli/dist/lib/ 2>/dev/null
```

If `dist/lib/skills/` is absent: the build doesn't copy non-TS assets.

- [ ] **Step 2: Add a build-step that copies the skills directory**

Open `packages/cli/package.json`. Find the existing `"build"` script. Update to copy the skills tree after `tsc`. Example shape (adapt to existing script):

```json
{
  "scripts": {
    "build": "tsc && cp -r src/lib/skills dist/lib/"
  }
}
```

If the existing build is `tsc -p tsconfig.build.json`, prepend the `cp -r` step the same way. Use `shx cp` if cross-platform matters (the repo's other scripts are bash-on-WSL — plain `cp -r` is acceptable per CLAUDE.md).

- [ ] **Step 3: Verify the rebuilt dist contains the skill files**

```bash
rm -rf /home/safturento/Repos/crew/packages/cli/dist
npm run build --workspace=crew-cli 2>&1 | tail -10
ls /home/safturento/Repos/crew/packages/cli/dist/lib/skills/visual-fidelity-check/
```

Expected: `SKILL.md`, `workflow.md`, `examples/` present.

- [ ] **Step 4: Commit**

```bash
git add packages/cli/package.json
git commit -m "build(cli): copy lib/skills/ into dist during build"
```

### Task 2.7: Integration test — full dispatch step against a fixture worktree

**Files:**
- Modify: `packages/cli/src/lib/run/skill-injection-step.test.ts`

Add a test that exercises the full step against a realistic config and source-root, asserting the worktree ends up with a discoverable skill that `skills.ts`'s existing `readSkillsFromRoot` would find.

- [ ] **Step 1: Append the integration test**

```ts
import { discoverSkills } from '../prompts/skills.js';

describe('runSkillInjection — end-to-end discovery', () => {
  it('produces a worktree whose project-level skill discovery finds the injected skill', async () => {
    const sourceRoot = makeSourceRoot([]);
    // Realistic visual-fidelity-check skeleton
    mkdirSync(join(sourceRoot, 'visual-fidelity-check'), { recursive: true });
    writeFileSync(
      join(sourceRoot, 'visual-fidelity-check', 'SKILL.md'),
      '---\nname: visual-fidelity-check\ndescription: real-looking description\n---\n# body\n',
    );

    const worktree = makeWorktree();
    const config = {
      ...baseConfig,
      visual_fidelity: { snapshot_path: '.crew/snap', component_dir: 'packages/dashboard/src/components' },
    } as ProjectConfig;

    await runSkillInjection({
      worktree,
      config,
      sourceRoot,
      log: () => {},
      warn: () => {},
    });

    const skills = discoverSkills({ repoPath: worktree, home: '/nonexistent' });
    expect(skills).toContainEqual(
      expect.objectContaining({ name: 'visual-fidelity-check', source: 'project' }),
    );
  });
});
```

- [ ] **Step 2: Run + confirm pass**

```bash
npm run test --workspace=crew-cli -- packages/cli/src/lib/run/skill-injection-step.test.ts 2>&1 | tail -20
```

Expected: 4 passed.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/lib/run/skill-injection-step.test.ts
git commit -m "test(cli): end-to-end skill-injection discoverability check"
```

---

## Phase 3 — PreToolUse hook on `gh pr create` (B1.3)

A bash hook script ships in the repo and is referenced from `.claude/settings.json` via a relative path. All dispatched worktrees inherit it via the worktree checkout — no per-dispatch injection needed. The hook itself checks at runtime whether the current project has visual-fidelity config; if not, it no-ops.

### Task 3.1: Author the hook script

**Files:**
- Create: `packages/cli/scripts/hooks/visual-fidelity-pr-gate.sh`

A bash script that reads the hook input (JSON on stdin per Claude Code's hook contract), determines whether the active session transcript shows a visual-fidelity-check skill invocation, and exits with a blocking message if not. Fails closed.

- [ ] **Step 1: Create the hook script**

Create `packages/cli/scripts/hooks/visual-fidelity-pr-gate.sh`:

```bash
#!/usr/bin/env bash
#
# PreToolUse hook for `gh pr create`. Blocks the call if the active session
# transcript does not contain a Skill tool_use entry for visual-fidelity-check
# AND the project has visual-fidelity wired up. Fail-closed: when the hook
# can't tell, surface a warning rather than silently allowing.
#
# Hook input shape (stdin) — Claude Code PreToolUse payload, see
# https://docs.claude.com/en/docs/claude-code/hooks:
#   { "session_id": "...",
#     "transcript_path": "/path/to/session.jsonl",
#     "cwd": "/path/to/worktree",
#     "hook_event_name": "PreToolUse",
#     "tool_name": "Bash",
#     "tool_input": { "command": "..." } }

set -euo pipefail

input=$(cat)

# Only gate gh pr create — let everything else pass.
command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
case "$command" in
  "gh pr create"*) : ;;
  *) exit 0 ;;
esac

cwd=$(printf '%s' "$input" | jq -r '.cwd // empty')
if [[ -z "$cwd" ]]; then
  echo "visual-fidelity-pr-gate: hook input missing cwd — failing closed" >&2
  exit 2
fi

# Project must have visual-fidelity config; otherwise no gate.
if [[ ! -f "$cwd/.crew/visual-fidelity.json" ]]; then
  # Also accept the TOML form: [visual_fidelity] in any .toml under .crew/
  if ! grep -lq '^\[visual_fidelity\]' "$cwd"/.crew/*.toml 2>/dev/null; then
    exit 0
  fi
fi

transcript=$(printf '%s' "$input" | jq -r '.transcript_path // empty')
if [[ -z "$transcript" || ! -f "$transcript" ]]; then
  echo "visual-fidelity-pr-gate: cannot read transcript ($transcript) — failing closed" >&2
  exit 2
fi

# Scan the JSONL for any Skill tool_use whose input.skill equals visual-fidelity-check.
if jq -e --slurp '
  any(
    .[] |
    select(.type == "assistant") |
    .message.content // [] |
    .[] |
    select(.type == "tool_use" and .name == "Skill") |
    .input.skill == "visual-fidelity-check"
  )
' "$transcript" >/dev/null; then
  exit 0
fi

cat >&2 <<'MSG'
visual-fidelity-check skill has not been invoked this session.

Per the dispatch workflow (step 8), the visual-fidelity gate must run before
opening a PR. Invoke the skill via the Skill tool, address any high-severity
findings, then retry `gh pr create`.
MSG
exit 2
```

- [ ] **Step 2: Make the script executable**

```bash
chmod +x /home/safturento/Repos/crew/packages/cli/scripts/hooks/visual-fidelity-pr-gate.sh
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/scripts/hooks/visual-fidelity-pr-gate.sh
git commit -m "feat(cli): add visual-fidelity-pr-gate PreToolUse hook script"
```

### Task 3.2: Wire the hook into `.claude/settings.json`

**Files:**
- Modify: `.claude/settings.json`

Reference the hook from the repo's committed settings so all dispatched worktrees inherit it via the worktree checkout.

- [ ] **Step 1: Update `.claude/settings.json`**

Open `.claude/settings.json` and add a top-level `hooks` block alongside the existing `sandbox` block:

```json
{
  "sandbox": { /* ... unchanged ... */ },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "./packages/cli/scripts/hooks/visual-fidelity-pr-gate.sh"
          }
        ]
      }
    ]
  }
}
```

Preserve the existing `sandbox` block contents byte-for-byte; only add `hooks`. The hook command is a path relative to the repo root (which is the working directory for Claude Code sessions in this repo).

- [ ] **Step 2: Commit**

```bash
git add .claude/settings.json
git commit -m "feat: enable visual-fidelity-pr-gate hook in repo settings"
```

### Task 3.3: Test the hook with fixture transcripts

**Files:**
- Create: `packages/cli/scripts/hooks/visual-fidelity-pr-gate.test.sh`

A small shell test that feeds known transcript fixtures + hook inputs into the hook and asserts the exit code and stderr.

> **Correction (post-implementation):** the embedded fixtures below use the legacy `{tool_use:{name,input:{command}}}` shape, but Claude Code's real PreToolUse payload is flat — `{tool_name, tool_input:{command}, transcript_path, cwd, session_id, hook_event_name}`. The shipped test file at `packages/cli/scripts/hooks/visual-fidelity-pr-gate.test.sh` is the source of truth; it uses the real shape via a `make_input` helper and adds three more fixtures (different-skill, malformed-JSONL, TOML-config) for 9 assertions total.

- [ ] **Step 1: Create the test script**

Create `packages/cli/scripts/hooks/visual-fidelity-pr-gate.test.sh`:

```bash
#!/usr/bin/env bash
#
# Bash-level tests for visual-fidelity-pr-gate.sh.
# Run with: bash packages/cli/scripts/hooks/visual-fidelity-pr-gate.test.sh

set -euo pipefail

cd "$(dirname "$0")"
HOOK="$PWD/visual-fidelity-pr-gate.sh"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

pass=0
fail=0

assert_exit() {
  local expected="$1"
  local actual="$2"
  local name="$3"
  if [[ "$actual" -eq "$expected" ]]; then
    printf "  ok %s\n" "$name"
    pass=$((pass+1))
  else
    printf "  FAIL %s (expected exit %s, got %s)\n" "$name" "$expected" "$actual"
    fail=$((fail+1))
  fi
}

# Fixture 1: gh pr create + no visual-fidelity config → pass (no gate applies)
mkdir -p "$TMP/no-vf-project"
transcript="$TMP/transcript-empty.jsonl"
echo '{"type":"user","message":{"content":"hi"}}' > "$transcript"
input=$(jq -n --arg cwd "$TMP/no-vf-project" --arg t "$transcript" \
  '{tool_use:{name:"Bash",input:{command:"gh pr create --title foo"}},transcript_path:$t,cwd:$cwd}')
set +e; printf '%s' "$input" | "$HOOK"; assert_exit 0 $? "no-vf-config passes"; set -e

# Fixture 2: gh pr create + has visual-fidelity config + transcript without skill → block
mkdir -p "$TMP/vf-project/.crew"
echo '{"figmaFileKey":"x"}' > "$TMP/vf-project/.crew/visual-fidelity.json"
transcript="$TMP/transcript-no-skill.jsonl"
echo '{"type":"assistant","message":{"content":[{"type":"text","text":"hello"}]}}' > "$transcript"
input=$(jq -n --arg cwd "$TMP/vf-project" --arg t "$transcript" \
  '{tool_use:{name:"Bash",input:{command:"gh pr create --title foo"}},transcript_path:$t,cwd:$cwd}')
set +e; printf '%s' "$input" | "$HOOK" 2>/dev/null; assert_exit 2 $? "no-skill blocks"; set -e

# Fixture 3: gh pr create + has visual-fidelity config + transcript WITH skill → pass
transcript="$TMP/transcript-with-skill.jsonl"
echo '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Skill","input":{"skill":"visual-fidelity-check"}}]}}' > "$transcript"
input=$(jq -n --arg cwd "$TMP/vf-project" --arg t "$transcript" \
  '{tool_use:{name:"Bash",input:{command:"gh pr create --title foo"}},transcript_path:$t,cwd:$cwd}')
set +e; printf '%s' "$input" | "$HOOK"; assert_exit 0 $? "skill-present passes"; set -e

# Fixture 4: not gh pr create → always pass (hook is opt-in to the command)
input=$(jq -n --arg cwd "$TMP/vf-project" --arg t "$transcript" \
  '{tool_use:{name:"Bash",input:{command:"npm run build"}},transcript_path:$t,cwd:$cwd}')
set +e; printf '%s' "$input" | "$HOOK"; assert_exit 0 $? "non-gh-pr-create passes"; set -e

# Fixture 5: missing transcript_path → fail closed (exit 2)
input=$(jq -n --arg cwd "$TMP/vf-project" \
  '{tool_use:{name:"Bash",input:{command:"gh pr create --title foo"}},cwd:$cwd}')
set +e; printf '%s' "$input" | "$HOOK" 2>/dev/null; assert_exit 2 $? "missing-transcript fails closed"; set -e

printf "\n%s passed, %s failed\n" "$pass" "$fail"
exit "$fail"
```

- [ ] **Step 2: Make it executable and run**

```bash
chmod +x /home/safturento/Repos/crew/packages/cli/scripts/hooks/visual-fidelity-pr-gate.test.sh
bash /home/safturento/Repos/crew/packages/cli/scripts/hooks/visual-fidelity-pr-gate.test.sh
```

Expected: `5 passed, 0 failed`.

- [ ] **Step 3: Commit**

```bash
git add packages/cli/scripts/hooks/visual-fidelity-pr-gate.test.sh
git commit -m "test(cli): bash tests for visual-fidelity-pr-gate hook"
```

---

## Phase 4 — Verify end-to-end

### Task 4.1: Manual dry-run via `crew run` against a no-op fixture

The intent is to confirm the dispatched agent's environment ends up correctly set up — workflow step 8 renders, skill files are in `<worktree>/.claude/skills/visual-fidelity-check/`, hook is in `.claude/settings.json`. This is a manual sanity step before merging.

- [ ] **Step 1: Run `npm run typecheck` + `npm run test` + `npm run build` at the repo root**

```bash
npm run typecheck 2>&1 | tail -10
npm run test 2>&1 | tail -10
npm run build 2>&1 | tail -10
```

All three must be clean.

- [ ] **Step 2: Render a synthetic dispatch prompt locally and inspect it**

```bash
cd /home/safturento/Repos/crew
node -e "
import('./packages/cli/dist/lib/prompts/index.js').then(({buildTicketPrompt}) => {
  const p = buildTicketPrompt({
    key: 'CREW-PREVIEW',
    githubRepo: 'foo/bar',
    jiraSite: 'https://x.atlassian.net',
    visualFidelity: { snapshotPath: '.crew/snap', componentDir: 'packages/dashboard/src/components' },
  });
  // Print step 7 → step 10 region
  const lines = p.split('\n');
  const start = lines.findIndex(l => l.startsWith('7. '));
  const end = lines.findIndex((l, i) => i > start && l.startsWith('11. '));
  console.log(lines.slice(start, end+1).join('\n'));
});
"
```

Expected output shows:
- Step 7 (Execute)
- Step 8 (Visual fidelity gate) with the IN ADDITION TO language
- Step 9 (Verify)
- Step 10 (Self-review)

- [ ] **Step 3: Push the branch + open a PR for review**

(Branch name follows the dispatch convention: `CREW-<key>`. PR description should call out the four observable changes — numbered step 8, skill files in dist, hook script, hook entry in settings.json — and link the spec.)

---

## Self-review (for the implementing agent)

Before claiming the plan complete:

- [ ] Step 8 of every UI-touching dispatch contains the new "Visual fidelity gate" body and the IN ADDITION TO disambiguation.
- [ ] Backend-only dispatches show step 7 → step 9 (no orphaned step number).
- [ ] `packages/cli/src/lib/skills/visual-fidelity-check/` is present and contains SKILL.md, workflow.md, examples/.
- [ ] `packages/cli/dist/lib/skills/visual-fidelity-check/` is present after `npm run build`.
- [ ] `runSkillInjection` is called from `crew run` after the figma-snapshot step.
- [ ] `.claude/settings.json` includes the `hooks.PreToolUse` entry pointing at `./packages/cli/scripts/hooks/visual-fidelity-pr-gate.sh`.
- [ ] The bash test for the hook (`visual-fidelity-pr-gate.test.sh`) exits 0 with `5 passed, 0 failed`.
- [ ] No `verification-before-completion` was run alone — `visual-fidelity-check` was invoked too (the agent should walk the talk for its own PR).

## Verification

The ultimate verification is Thread A's re-dispatch (CREW-135) against this gate. Expected outcome: the dispatched agent invokes `visual-fidelity-check` at step 8, the skill reads the injected snapshot, the agent fixes any high-severity findings before progressing, and `gh pr create` succeeds without the hook firing. If the hook DOES fire on a re-dispatch, that's a verification finding too — log it on the next session.
