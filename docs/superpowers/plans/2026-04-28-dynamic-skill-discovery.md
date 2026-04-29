# Dynamic Skill Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discover user-level (`~/.claude/skills/`) and project-level (`<repo>/.claude/skills/`) skills at prompt-build time and inject them into both the `ticket` and `fix-pr` prompts so newly authored skills are picked up automatically.

**Architecture:** New `packages/cli/src/lib/prompts/skills.ts` module owns discovery + rendering. The two prompt builders (`buildTicketPrompt`, `buildFixPrPrompt`) accept a pre-rendered `discoveredSkillsBlock` string. The two callers (`runTicket` in `run.ts`, `runFixPr` in `fix-pr.ts`) call `discoverSkills` + `renderDiscoveredSkillsBlock` and pass the result through. The two markdown templates gain a `{{discoveredSkillsBlock}}` placeholder under their existing `## Skills` header that collapses to empty when no skills are discovered.

**Tech Stack:** TypeScript (strict), vitest (test runner + snapshots), gray-matter (YAML frontmatter parser, new dep).

**Spec:** [`docs/superpowers/specs/2026-04-28-dynamic-skill-discovery-design.md`](../specs/2026-04-28-dynamic-skill-discovery-design.md)

---

## Task 1: Add `gray-matter` dependency and create the `skills.ts` module skeleton

**Files:**
- Modify: `packages/cli/package.json`
- Create: `packages/cli/src/lib/prompts/skills.ts`

- [ ] **Step 1: Add `gray-matter` to CLI package dependencies**

Edit `packages/cli/package.json` and insert `"gray-matter": "^4.0.3",` into the `dependencies` block, alphabetized. The result should look like:

```json
"dependencies": {
  "@inquirer/prompts": "^8.4.2",
  "cli-table3": "^0.6.5",
  "commander": "^14.0.3",
  "execa": "^9.6.1",
  "gray-matter": "^4.0.3",
  "listr2": "^10.2.1",
  ...
}
```

- [ ] **Step 2: Run `npm install` from the repo root to update the lockfile**

Run: `npm install --workspace crew-cli`

Expected: completes without errors; `package-lock.json` is updated.

- [ ] **Step 3: Create `packages/cli/src/lib/prompts/skills.ts` with type definitions and stubs**

Write this file:

```typescript
import { homedir } from 'node:os';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';

export interface DiscoveredSkill {
  name: string;
  description: string;
  source: 'user' | 'project';
}

export interface DiscoverSkillsOptions {
  repoPath: string;
  home?: string;
}

export function discoverSkills(_opts: DiscoverSkillsOptions): DiscoveredSkill[] {
  return [];
}

export function renderDiscoveredSkillsBlock(_skills: DiscoveredSkill[]): string {
  return '';
}
```

- [ ] **Step 4: Verify the package still typechecks**

Run: `npm run typecheck --workspace crew-cli`

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/package.json package-lock.json packages/cli/src/lib/prompts/skills.ts
git commit -m "feat(skills): scaffold skill discovery module + add gray-matter dep"
```

---

## Task 2: Implement `discoverSkills` (TDD)

**Files:**
- Create: `packages/cli/src/lib/prompts/skills.test.ts`
- Modify: `packages/cli/src/lib/prompts/skills.ts`
- Create: `packages/cli/test/fixtures/skills-home/.claude/skills/alpha-skill/SKILL.md`
- Create: `packages/cli/test/fixtures/skills-home/.claude/skills/beta-skill/SKILL.md`
- Create: `packages/cli/test/fixtures/skills-home/.claude/skills/no-description/SKILL.md`
- Create: `packages/cli/test/fixtures/skills-home/.claude/skills/malformed/SKILL.md`
- Create: `packages/cli/test/fixtures/skills-home/.claude/skills/empty-dir/.gitkeep`
- Create: `packages/cli/test/fixtures/skills-repo/.claude/skills/project-skill/SKILL.md`

- [ ] **Step 1: Create the fixture skills**

`packages/cli/test/fixtures/skills-home/.claude/skills/alpha-skill/SKILL.md`:

```markdown
---
name: alpha-skill
description: Use when alpha-skill scenarios apply.
---

# Alpha Skill

Body text here is irrelevant to discovery.
```

`packages/cli/test/fixtures/skills-home/.claude/skills/beta-skill/SKILL.md`:

```markdown
---
name: beta-skill
description: Use when beta-skill scenarios apply.
---

# Beta Skill
```

`packages/cli/test/fixtures/skills-home/.claude/skills/no-description/SKILL.md`:

```markdown
---
name: no-description
---

# No Description

Frontmatter is missing the `description` field — discoverSkills must skip this entry.
```

`packages/cli/test/fixtures/skills-home/.claude/skills/malformed/SKILL.md`:

```markdown
---
name: malformed
description: "unterminated string
---

# Malformed
```

`packages/cli/test/fixtures/skills-home/.claude/skills/empty-dir/.gitkeep`:

```
```

(Empty file — the directory exists but contains no `SKILL.md`. `.gitkeep` is needed because git doesn't track empty directories.)

`packages/cli/test/fixtures/skills-repo/.claude/skills/project-skill/SKILL.md`:

```markdown
---
name: project-skill
description: Use when project-skill scenarios apply.
---

# Project Skill
```

- [ ] **Step 2: Write the failing tests**

Create `packages/cli/src/lib/prompts/skills.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { discoverSkills } from './skills.js';

const FIXTURES_DIR = join(__dirname, '../../../test/fixtures');
const HOME_FIXTURE = join(FIXTURES_DIR, 'skills-home');
const REPO_FIXTURE = join(FIXTURES_DIR, 'skills-repo');
const EMPTY_DIR = join(FIXTURES_DIR); // any path with no .claude/skills/ subdir

describe('discoverSkills', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  it('returns [] when neither home nor repoPath has .claude/skills/', () => {
    const result = discoverSkills({ home: EMPTY_DIR, repoPath: EMPTY_DIR });
    expect(result).toEqual([]);
  });

  it('discovers user-level skills from <home>/.claude/skills/*/SKILL.md', () => {
    const result = discoverSkills({ home: HOME_FIXTURE, repoPath: EMPTY_DIR });
    const userNames = result.filter((s) => s.source === 'user').map((s) => s.name);
    expect(userNames).toContain('alpha-skill');
    expect(userNames).toContain('beta-skill');
  });

  it('discovers project-level skills from <repoPath>/.claude/skills/*/SKILL.md', () => {
    const result = discoverSkills({ home: EMPTY_DIR, repoPath: REPO_FIXTURE });
    const projectNames = result.filter((s) => s.source === 'project').map((s) => s.name);
    expect(projectNames).toEqual(['project-skill']);
  });

  it('combines both sources when both exist, alphabetized within source, user before project', () => {
    const result = discoverSkills({ home: HOME_FIXTURE, repoPath: REPO_FIXTURE });
    const valid = result.filter((s) => ['alpha-skill', 'beta-skill', 'project-skill'].includes(s.name));
    expect(valid).toEqual([
      { name: 'alpha-skill', description: 'Use when alpha-skill scenarios apply.', source: 'user' },
      { name: 'beta-skill', description: 'Use when beta-skill scenarios apply.', source: 'user' },
      { name: 'project-skill', description: 'Use when project-skill scenarios apply.', source: 'project' },
    ]);
  });

  it('skips skill directories that lack a SKILL.md', () => {
    const result = discoverSkills({ home: HOME_FIXTURE, repoPath: EMPTY_DIR });
    expect(result.find((s) => s.name === 'empty-dir')).toBeUndefined();
  });

  it('skips frontmatter without a description field and warns', () => {
    const result = discoverSkills({ home: HOME_FIXTURE, repoPath: EMPTY_DIR });
    expect(result.find((s) => s.name === 'no-description')).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no-description'),
    );
  });

  it('skips SKILL.md files with unparseable frontmatter and warns', () => {
    const result = discoverSkills({ home: HOME_FIXTURE, repoPath: EMPTY_DIR });
    expect(result.find((s) => s.name === 'malformed')).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('malformed'),
    );
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `npm run test:run --workspace crew-cli -- skills.test`

Expected: all tests under `discoverSkills` fail because the function returns `[]` unconditionally.

- [ ] **Step 4: Implement `discoverSkills`**

Replace the stub in `packages/cli/src/lib/prompts/skills.ts`:

```typescript
import { homedir } from 'node:os';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import matter from 'gray-matter';

export interface DiscoveredSkill {
  name: string;
  description: string;
  source: 'user' | 'project';
}

export interface DiscoverSkillsOptions {
  repoPath: string;
  home?: string;
}

export function discoverSkills(opts: DiscoverSkillsOptions): DiscoveredSkill[] {
  const home = opts.home ?? homedir();
  const userSkillsRoot = join(home, '.claude', 'skills');
  const projectSkillsRoot = join(opts.repoPath, '.claude', 'skills');

  const userSkills = readSkillsFromRoot(userSkillsRoot, 'user');
  const projectSkills = readSkillsFromRoot(projectSkillsRoot, 'project');

  return [...sortByName(userSkills), ...sortByName(projectSkills)];
}

function readSkillsFromRoot(root: string, source: 'user' | 'project'): DiscoveredSkill[] {
  if (!existsSync(root)) return [];

  const entries: DiscoveredSkill[] = [];
  for (const dir of readdirSync(root)) {
    const skillDir = join(root, dir);
    if (!statSync(skillDir).isDirectory()) continue;

    const skillFile = join(skillDir, 'SKILL.md');
    if (!existsSync(skillFile)) continue;

    let frontmatter: Record<string, unknown>;
    try {
      const raw = readFileSync(skillFile, 'utf8');
      frontmatter = matter(raw).data;
    } catch (err) {
      console.warn(
        `crew: skipping skill at ${skillFile} — could not parse frontmatter (${(err as Error).message})`,
      );
      continue;
    }

    const description = frontmatter.description;
    if (typeof description !== 'string' || description.trim() === '') {
      console.warn(
        `crew: skipping skill at ${skillFile} — frontmatter has no description`,
      );
      continue;
    }

    const name = typeof frontmatter.name === 'string' && frontmatter.name.trim() !== ''
      ? frontmatter.name
      : dir;

    entries.push({ name, description, source });
  }

  return entries;
}

function sortByName(skills: DiscoveredSkill[]): DiscoveredSkill[] {
  return [...skills].sort((a, b) => a.name.localeCompare(b.name));
}

export function renderDiscoveredSkillsBlock(_skills: DiscoveredSkill[]): string {
  return '';
}
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `npm run test:run --workspace crew-cli -- skills.test`

Expected: all 7 `discoverSkills` tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/prompts/skills.ts \
        packages/cli/src/lib/prompts/skills.test.ts \
        packages/cli/test/fixtures/skills-home \
        packages/cli/test/fixtures/skills-repo
git commit -m "feat(skills): implement discoverSkills with user + project sources"
```

---

## Task 3: Implement `renderDiscoveredSkillsBlock` (TDD)

**Files:**
- Modify: `packages/cli/src/lib/prompts/skills.test.ts`
- Modify: `packages/cli/src/lib/prompts/skills.ts`

- [ ] **Step 1: Add the failing tests**

Append to `packages/cli/src/lib/prompts/skills.test.ts`:

```typescript
import { renderDiscoveredSkillsBlock } from './skills.js';

describe('renderDiscoveredSkillsBlock', () => {
  it('returns empty string for empty input', () => {
    expect(renderDiscoveredSkillsBlock([])).toBe('');
  });

  it('renders only the user paragraph when only user skills are present', () => {
    const result = renderDiscoveredSkillsBlock([
      { name: 'alpha', description: 'Use when alpha.', source: 'user' },
      { name: 'beta', description: 'Use when beta.', source: 'user' },
    ]);

    expect(result).toContain('user-level skills');
    expect(result).not.toContain('project-level skills');
    expect(result).toContain('- **`alpha`** — Use when alpha.');
    expect(result).toContain('- **`beta`** — Use when beta.');
  });

  it('renders only the project paragraph when only project skills are present', () => {
    const result = renderDiscoveredSkillsBlock([
      { name: 'gamma', description: 'Use when gamma.', source: 'project' },
    ]);

    expect(result).not.toContain('user-level skills');
    expect(result).toContain('project-level skills');
    expect(result).toContain('- **`gamma`** — Use when gamma.');
  });

  it('renders both paragraphs in user-then-project order', () => {
    const result = renderDiscoveredSkillsBlock([
      { name: 'alpha', description: 'Use when alpha.', source: 'user' },
      { name: 'gamma', description: 'Use when gamma.', source: 'project' },
    ]);

    const userIdx = result.indexOf('user-level skills');
    const projectIdx = result.indexOf('project-level skills');
    expect(userIdx).toBeGreaterThan(-1);
    expect(projectIdx).toBeGreaterThan(userIdx);
  });

  it('alphabetizes bullets within each source', () => {
    const result = renderDiscoveredSkillsBlock([
      { name: 'beta', description: 'Use when beta.', source: 'user' },
      { name: 'alpha', description: 'Use when alpha.', source: 'user' },
      { name: 'delta', description: 'Use when delta.', source: 'project' },
      { name: 'charlie', description: 'Use when charlie.', source: 'project' },
    ]);

    expect(result.indexOf('alpha')).toBeLessThan(result.indexOf('beta'));
    expect(result.indexOf('charlie')).toBeLessThan(result.indexOf('delta'));
  });

  it('starts with a blank-line separator so it concatenates cleanly under the curated block', () => {
    const result = renderDiscoveredSkillsBlock([
      { name: 'alpha', description: 'Use when alpha.', source: 'user' },
    ]);
    expect(result.startsWith('\n')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npm run test:run --workspace crew-cli -- skills.test`

Expected: all 6 new `renderDiscoveredSkillsBlock` tests fail; the 7 `discoverSkills` tests still pass.

- [ ] **Step 3: Implement `renderDiscoveredSkillsBlock`**

Replace the stub at the bottom of `packages/cli/src/lib/prompts/skills.ts`:

```typescript
export function renderDiscoveredSkillsBlock(skills: DiscoveredSkill[]): string {
  if (skills.length === 0) return '';

  const userSkills = sortByName(skills.filter((s) => s.source === 'user'));
  const projectSkills = sortByName(skills.filter((s) => s.source === 'project'));

  const paragraphs: string[] = [];
  if (userSkills.length > 0) {
    paragraphs.push(renderParagraph('user-level', userSkills));
  }
  if (projectSkills.length > 0) {
    paragraphs.push(renderParagraph('project-level', projectSkills));
  }

  return `\n\n${paragraphs.join('\n\n')}`;
}

function renderParagraph(label: 'user-level' | 'project-level', skills: DiscoveredSkill[]): string {
  const lead = `The following ${label} skills are equally required when their description matches what you're about to do — invoke them via the \`Skill\` tool the same way:`;
  const bullets = skills.map((s) => `- **\`${s.name}\`** — ${s.description}`).join('\n');
  return `${lead}\n\n${bullets}`;
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npm run test:run --workspace crew-cli -- skills.test`

Expected: all 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/lib/prompts/skills.ts \
        packages/cli/src/lib/prompts/skills.test.ts
git commit -m "feat(skills): render discovered skills block grouped by source"
```

---

## Task 4: Wire the discovered block into the ticket-prompt path

**Files:**
- Modify: `packages/cli/src/lib/prompts/templates/ticket.md`
- Modify: `packages/cli/src/lib/prompts/ticket.ts`
- Modify: `packages/cli/src/lib/prompts/index.ts`
- Modify: `packages/cli/src/lib/prompts/builders.test.ts`
- Modify: `packages/cli/src/lib/prompts/__snapshots__/builders.test.ts.snap`
- Modify: `packages/cli/src/commands/run.ts`

- [ ] **Step 1: Add the `{{discoveredSkillsBlock}}` placeholder to `ticket.md`**

Edit `packages/cli/src/lib/prompts/templates/ticket.md`. The current `## Skills` section ends at line 11 with the `superpowers:requesting-code-review` bullet. Append `{{discoveredSkillsBlock}}` on the next line — its leading `\n\n` from the renderer will produce the visual gap. The section should look like:

```markdown
## Skills

You are required to use these Superpowers skills as appropriate. Invoke each via the `Skill` tool when its trigger condition fires:

- **`superpowers:executing-plans`** — fires when a plan document exists at `docs/plans/{{key}}-*.md`, `docs/superpowers/plans/{{key}}-*.md`, or similar. If a plan exists, skip the inline-planning step and follow the plan task-by-task with the skill's checkpoint discipline.
- **`superpowers:test-driven-development`** — fires for every feature or bug fix you implement. Write the failing test first, watch it fail, then implement.
- **`superpowers:verification-before-completion`** — fires before claiming work is done, committing, or opening a PR. Required to run the verification commands and confirm output, not assume.
- **`superpowers:systematic-debugging`** — fires whenever you hit an unexpected failure (test red that you didn't write, type error you don't understand, runtime error). Don't guess at fixes; diagnose root causes.
- **`superpowers:requesting-code-review`** — fires as part of the Self-review step before pushing.{{discoveredSkillsBlock}}

## Workflow
```

(Note: `{{discoveredSkillsBlock}}` sits *inline* at the end of the last bullet line — no leading whitespace — so an empty render leaves that line ending exactly as it was.)

- [ ] **Step 2: Update `buildTicketPrompt` to accept and forward the block**

Edit `packages/cli/src/lib/prompts/ticket.ts`:

```typescript
import { render } from './render.js';

export interface VisualTestingPromptOptions {
  appUrl: string;
  startCommand?: string;
  authored?: {
    testsDir: string;
    testCommand: string;
  };
}

export interface BuildTicketPromptOptions {
  key: string;
  githubRepo: string;
  jiraSite: string;
  visualTesting?: VisualTestingPromptOptions;
  discoveredSkillsBlock?: string;
}

export function buildTicketPrompt(opts: BuildTicketPromptOptions): string {
  return render('ticket', {
    key: opts.key,
    githubRepo: opts.githubRepo,
    jiraSite: opts.jiraSite,
    visualTestingBlock: buildVisualTestingBlock(opts.visualTesting),
    discoveredSkillsBlock: opts.discoveredSkillsBlock ?? '',
  });
}

function buildVisualTestingBlock(vt: VisualTestingPromptOptions | undefined): string {
  if (vt === undefined) return '';
  return '';
}
```

- [ ] **Step 3: Verify the existing snapshot test still passes**

Run: `npm run test:run --workspace crew-cli -- builders.test`

Expected: All existing tests pass. The baseline snapshot is unchanged because `discoveredSkillsBlock` defaults to `''` and the placeholder is positioned with no surrounding whitespace.

If a snapshot mismatch appears, the `{{discoveredSkillsBlock}}` placeholder was inserted with stray whitespace — re-check Step 1 and ensure the placeholder is appended directly to the end of the `superpowers:requesting-code-review` bullet line with nothing between them.

- [ ] **Step 4: Add the populated-case snapshot test**

Append to `packages/cli/src/lib/prompts/builders.test.ts` inside the existing `describe('buildTicketPrompt', ...)` block:

```typescript
  it('renders the discovered skills block under the curated Skills list', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
      discoveredSkillsBlock:
        '\n\nThe following user-level skills are equally required when their description matches what you\'re about to do — invoke them via the `Skill` tool the same way:\n\n- **`reaching-for-frontend-libraries`** — Use when implementing frontend features.',
    });

    expect(prompt).toContain('superpowers:requesting-code-review');
    expect(prompt).toContain('user-level skills are equally required');
    expect(prompt).toContain('reaching-for-frontend-libraries');

    const curatedIdx = prompt.indexOf('superpowers:requesting-code-review');
    const discoveredIdx = prompt.indexOf('reaching-for-frontend-libraries');
    expect(discoveredIdx).toBeGreaterThan(curatedIdx);

    expect(prompt).toMatchSnapshot();
  });
```

- [ ] **Step 5: Run the tests and accept the new snapshot**

Run: `npm run test:run --workspace crew-cli -- builders.test`

Expected: The new test fails on first run because no snapshot exists yet. Run with the update flag:

`npm run test:run --workspace crew-cli -- builders.test -u`

Expected: All tests pass; `__snapshots__/builders.test.ts.snap` gains a new entry. Inspect the diff with `git diff packages/cli/src/lib/prompts/__snapshots__/` and confirm:
- The `## Skills` section ends with the curated bullets.
- A blank line follows.
- The `user-level skills` paragraph appears with the populated bullet.

- [ ] **Step 6: Wire `runTicket` to call discovery and forward the block**

Edit `packages/cli/src/commands/run.ts`. At the top, alongside the other prompt imports:

```typescript
import { buildTicketPrompt } from '../lib/prompts/index.js';
import { discoverSkills, renderDiscoveredSkillsBlock } from '../lib/prompts/skills.js';
```

(The first import already exists; only the second needs adding.)

Then update the `buildTicketPrompt` call site (currently around `run.ts:153`) to pass the rendered block:

```typescript
  const prompt = buildTicketPrompt({
    key,
    githubRepo: config.github.repo,
    jiraSite: config.jira.site,
    visualTesting:
      config.visual_testing?.enabled && resolvedAppUrl
        ? {
            // … existing visual testing fields …
          }
        : undefined,
    discoveredSkillsBlock: renderDiscoveredSkillsBlock(
      discoverSkills({ repoPath: config.repo_path }),
    ),
  });
```

(Preserve the existing `visualTesting` object exactly as it is — only add the `discoveredSkillsBlock` field.)

- [ ] **Step 7: Verify the package typechecks and all tests pass**

Run: `npm run typecheck --workspace crew-cli && npm run test:run --workspace crew-cli`

Expected: zero typecheck errors; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/lib/prompts/templates/ticket.md \
        packages/cli/src/lib/prompts/ticket.ts \
        packages/cli/src/lib/prompts/builders.test.ts \
        packages/cli/src/lib/prompts/__snapshots__/builders.test.ts.snap \
        packages/cli/src/commands/run.ts
git commit -m "feat(skills): inject discovered skills into crew run ticket prompt"
```

---

## Task 5: Wire the discovered block into the fix-pr prompt path

**Files:**
- Modify: `packages/cli/src/lib/prompts/templates/fix-pr.md`
- Modify: `packages/cli/src/lib/prompts/fix-pr.ts`
- Modify: `packages/cli/src/lib/prompts/builders.test.ts`
- Modify: `packages/cli/src/lib/prompts/__snapshots__/builders.test.ts.snap`
- Modify: `packages/cli/src/commands/fix-pr.ts`

- [ ] **Step 1: Add the `{{discoveredSkillsBlock}}` placeholder to `fix-pr.md`**

Edit `packages/cli/src/lib/prompts/templates/fix-pr.md`. The current `## Skills` block ends at line 15 with `superpowers:requesting-code-review`. Append `{{discoveredSkillsBlock}}` to the end of that bullet's line, same convention as in `ticket.md`:

```markdown
## Skills

- **`superpowers:test-driven-development`** — for every feedback item that requires implementation work.
- **`superpowers:verification-before-completion`** — before pushing.
- **`superpowers:systematic-debugging`** — when something fails unexpectedly.
- **`superpowers:requesting-code-review`** — before pushing.{{discoveredSkillsBlock}}

## Apply the fixes
```

- [ ] **Step 2: Update `buildFixPrPrompt` to accept and forward the block**

Edit `packages/cli/src/lib/prompts/fix-pr.ts` — add the new field on the input interface and forward it to `render`:

```typescript
export interface BuildFixPrPromptOptions {
  key: string;
  feedback: string;
  feedbackSource: string;
  conflictFiles?: string[];
  discoveredSkillsBlock?: string;
}

export function buildFixPrPrompt(opts: BuildFixPrPromptOptions): string {
  const conflictFiles = opts.conflictFiles ?? [];
  const hasConflicts = conflictFiles.length > 0;
  const conflictPreamble = hasConflicts
    ? render('conflict-preamble', {
        key: opts.key,
        fileList: conflictFiles.map((f) => `- ${f}`).join('\n'),
      })
    : '';
  const pushDirective = hasConflicts
    ? `**DO NOT PUSH this run.** Conflicts were resolved during the rebase, so the human must inspect the resolution commits before they reach origin. After your feedback fixes are committed and verified, print exactly one line and exit: "Rebase resolution + feedback ready for inspection — run 'git push --force-with-lease origin ${opts.key}' once you've reviewed."`
    : `Push with \`git push --force-with-lease origin ${opts.key}\` to extend the existing PR. Do NOT open a new PR. Plain \`--force\` is never allowed.`;
  return render('fix-pr', {
    key: opts.key,
    feedback: opts.feedback,
    feedbackSource: opts.feedbackSource,
    conflictPreamble,
    pushDirective,
    discoveredSkillsBlock: opts.discoveredSkillsBlock ?? '',
  });
}
```

- [ ] **Step 3: Verify existing snapshots still pass**

Run: `npm run test:run --workspace crew-cli -- builders.test`

Expected: All existing `buildFixPrPrompt` tests pass. The current snapshot is unchanged because the placeholder collapses to empty.

- [ ] **Step 4: Add a populated-case test for `buildFixPrPrompt`**

Append inside the `describe('buildFixPrPrompt', ...)` block in `builders.test.ts`:

```typescript
  it('renders the discovered skills block under the curated Skills list', () => {
    const prompt = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: 'Some feedback',
      feedbackSource: 'manual test',
      discoveredSkillsBlock:
        '\n\nThe following user-level skills are equally required when their description matches what you\'re about to do — invoke them via the `Skill` tool the same way:\n\n- **`reaching-for-frontend-libraries`** — Use when implementing frontend features.',
    });

    expect(prompt).toContain('superpowers:requesting-code-review');
    expect(prompt).toContain('reaching-for-frontend-libraries');
    const curatedIdx = prompt.indexOf('superpowers:requesting-code-review');
    const discoveredIdx = prompt.indexOf('reaching-for-frontend-libraries');
    expect(discoveredIdx).toBeGreaterThan(curatedIdx);
  });
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:run --workspace crew-cli -- builders.test`

Expected: all `buildFixPrPrompt` tests pass.

- [ ] **Step 6: Wire `runFixPr` to call discovery and forward the block**

Edit `packages/cli/src/commands/fix-pr.ts`:

Add the import at the top with the other lib imports:

```typescript
import { discoverSkills, renderDiscoveredSkillsBlock } from '../lib/prompts/skills.js';
```

`fix-pr.ts` currently has no `ProjectConfig` loaded — the worktree path is derived directly from `git rev-parse --show-toplevel`. To get the canonical `repoPath`, walk the worktree's parent. Crew's worktree convention is `<repo_path>-<KEY>` (see `packages/cli/src/lib/run/index.ts` `worktreePathFor`), so stripping the `-<KEY>` suffix from the worktree gives the repo path.

Add a small helper just above `runFixPr` in `fix-pr.ts`:

```typescript
function repoPathFromWorktree(worktree: string, key: string): string {
  const suffix = `-${key}`;
  return worktree.endsWith(suffix) ? worktree.slice(0, -suffix.length) : worktree;
}
```

Then update the `buildFixPrPrompt` call site (currently around `fix-pr.ts:179`):

```typescript
  const prompt = buildFixPrPrompt({
    key,
    feedback,
    feedbackSource: source,
    conflictFiles: conflicts,
    discoveredSkillsBlock: renderDiscoveredSkillsBlock(
      discoverSkills({ repoPath: repoPathFromWorktree(worktree, key) }),
    ),
  });
```

- [ ] **Step 7: Verify the full CLI typechecks and all tests pass**

Run: `npm run typecheck --workspace crew-cli && npm run test:run --workspace crew-cli`

Expected: zero errors; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/lib/prompts/templates/fix-pr.md \
        packages/cli/src/lib/prompts/fix-pr.ts \
        packages/cli/src/lib/prompts/builders.test.ts \
        packages/cli/src/commands/fix-pr.ts
git commit -m "feat(skills): inject discovered skills into crew fix-pr prompt"
```

---

## Task 6: Final verification and PR

**Files:** none (verification only).

- [ ] **Step 1: Run lint, format, typecheck, and tests across the workspace**

Run each, confirming zero errors / no diff:

```bash
npm run lint
npm run format
npm run typecheck
npm run test:run
```

Expected:
- `lint`: clean
- `format`: no files would be reformatted
- `typecheck`: no errors
- `test:run`: every package green

- [ ] **Step 2: Manual smoke check (no real ticket)**

From the repo root:

```bash
node -e "
import('./packages/cli/src/lib/prompts/skills.js').then(m => {
  const skills = m.discoverSkills({ repoPath: process.cwd() });
  console.log(JSON.stringify(skills, null, 2));
  console.log('---');
  console.log(m.renderDiscoveredSkillsBlock(skills));
});
"
```

Expected: lists skills found under `~/.claude/skills/` (e.g. `reaching-for-backend-patterns`, `reaching-for-frontend-libraries`) plus any `<repo>/.claude/skills/` entries, then prints the rendered block. If any user-authored SKILL.md is malformed, you'll see a `crew: skipping skill at …` warning.

(Skip this step if running on a build agent without these skills installed; the unit tests already cover the discovery shape.)

- [ ] **Step 3: Push branch and open PR**

```bash
git push -u origin <branch>
gh pr create --base main --head <branch> --title "feat(skills): dynamic skill discovery for crew prompts" --body "$(cat <<'EOF'
## Summary
- Discovers user-level (`~/.claude/skills/`) and project-level (`<repo>/.claude/skills/`) skills at prompt-build time.
- Injects them into both the `crew run` and `crew fix-pr` prompts under the existing `## Skills` header, grouped by source.
- Closes the gap diagnosed in CREW-24, where `reaching-for-frontend-libraries` was registered for the session but never invoked because the curated list in `ticket.md` read as a closed allowlist.

## Test plan
- [ ] `npm run test:run` is green
- [ ] Snapshot diff for `builders.test.ts.snap` shows the new populated-case snapshot only (no churn on the empty-case snapshot)
- [ ] Local `crew run <KEY>` smoke run shows `reaching-for-*` skills in the rendered prompt
EOF
)"
```

(Replace `<branch>` with the actual branch name. The exact PR title/body can be adjusted to match the project's style.)

---

## Self-review

**Spec coverage:**
- Architecture (`skills.ts` module, two functions, two callers, two templates) — Task 1 + 2 + 3 + 4 + 5.
- Discovery from `~/.claude/skills/` and `<repo>/.claude/skills/` — Task 2.
- Source distinction via separate sub-paragraphs — Task 3.
- Empty-state collapse, alphabetization, user-then-project order — Task 3.
- Frontmatter parsing via `gray-matter`, best-effort with warnings — Task 1 + 2.
- Snapshot regression guard for empty case — Task 4 Step 3 + Task 5 Step 3.
- Snapshot for populated case — Task 4 Step 4 + Task 5 Step 4.
- Wiring into `run.ts` and `fix-pr.ts` — Task 4 Step 6 + Task 5 Step 6.

**Placeholder scan:** none. Every step has actual code, exact file paths, and concrete commands.

**Type consistency:** `DiscoveredSkill`, `DiscoverSkillsOptions`, `discoverSkills`, `renderDiscoveredSkillsBlock`, `BuildTicketPromptOptions.discoveredSkillsBlock`, `BuildFixPrPromptOptions.discoveredSkillsBlock` — all names match across tasks.
