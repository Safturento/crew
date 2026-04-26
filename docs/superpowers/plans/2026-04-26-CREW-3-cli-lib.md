# CREW-3 — `cli/src/lib/` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land six cross-cutting modules in `packages/cli/src/lib/` that the rest of Phase 1 (CREW-4..8) imports — typed config loader, transcript parser, prompt builders, Jira REST client, GitHub gh-CLI wrapper, and docker port-hash + compose helpers.

**Architecture:** Pure functions and small classes, one folder per concern. No subcommand wiring — that's CREW-4..8. Modules live under `packages/cli/src/lib/<concern>/`; each exports its public surface from `index.ts`. Tests live alongside (`<file>.test.ts`). All TS source runs via `tsx` at invocation time; no build step.

**Tech Stack:** Node 22+, TypeScript, vitest, smol-toml, zod, execa, picocolors. The library deps (smol-toml, zod, execa, picocolors) already land in `packages/cli/package.json` from CREW-2.

**Spec:** `docs/plans/architecture.md` (Architecture overview → "Shared modules" section). The Jira ticket CREW-3 lists the six modules + their public surface.

---

## File Structure

All paths under `packages/cli/src/lib/`:

```
lib/
├── index.ts                         # re-exports the public API of each module
├── config/
│   ├── index.ts                    # public exports
│   ├── schema.ts                   # zod schema + ProjectConfig type
│   ├── loader.ts                   # loadProjectConfig() + auto-discovery
│   └── loader.test.ts
├── docker/
│   ├── index.ts
│   ├── port-hash.ts                # portHash() — pure function
│   ├── port-hash.test.ts
│   ├── compose.ts                  # listRunningProjects(), getStackUrl()
│   └── compose.test.ts
├── transcripts/
│   ├── index.ts
│   ├── types.ts                    # TranscriptEvent discriminated union
│   ├── parser.ts                   # parseToolCall(), aggregateUsage(), formatToolCall()
│   └── parser.test.ts
├── prompts/
│   ├── index.ts
│   ├── ticket.ts                   # buildTicketPrompt()
│   ├── fix-pr.ts                   # buildFixPrPrompt()
│   └── builders.test.ts
├── jira/
│   ├── index.ts
│   ├── client.ts                   # JiraClient class with getIssue/getTransitions/transition
│   └── client.test.ts
└── github/
    ├── index.ts
    ├── client.ts                   # getPrForBranch(), getReviewComments(), mergeStatus()
    └── client.test.ts
```

**Test fixtures** (small, used across tests):

```
packages/cli/test/fixtures/
├── transcript-sample.jsonl
└── project-config-sample.toml
```

**Modified:**

- `packages/cli/package.json` — no changes needed (deps already installed via CREW-2)

---

## Task 1: lib/ scaffolding + index re-exports

Sets up the directory layout and a top-level barrel file that the rest of Phase 1 will import from. Each module's actual code lands in subsequent tasks.

**Files:**

- Create: `packages/cli/src/lib/index.ts`

- [ ] **Step 1: Create the barrel file**

```ts
// Re-export the public API of each lib module.
// Subcommands import from './lib' or './lib/<module>'.
export * from './config';
export * from './docker';
export * from './transcripts';
export * from './prompts';
export * from './jira';
export * from './github';
```

This file references modules that don't exist yet — leave it; it'll resolve as each module's `index.ts` lands. Don't typecheck after this step (it'll fail until Task 2).

- [ ] **Step 2: Commit**

```bash
cd packages/cli && git add src/lib/index.ts && git commit -m "feat(CREW-3): add lib/ barrel"
```

---

## Task 2: docker/port-hash (smallest, pure, fully testable)

Starts the TDD pattern that the rest of the plan repeats. Pure function, no IO, deterministic — perfect first module.

**Files:**

- Create: `packages/cli/src/lib/docker/port-hash.ts`
- Create: `packages/cli/src/lib/docker/port-hash.test.ts`
- Create: `packages/cli/src/lib/docker/index.ts` (partial; compose.ts ships in Task 3)

- [ ] **Step 1: Write the failing test**

`packages/cli/src/lib/docker/port-hash.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { portHash } from './port-hash';

describe('portHash', () => {
  it('returns deterministic offsets for a given basename', () => {
    const a = portHash('Recipes-App-KAN-23');
    const b = portHash('Recipes-App-KAN-23');
    expect(a).toEqual(b);
  });

  it('returns different offsets for different basenames', () => {
    const a = portHash('Recipes-App-KAN-23');
    const b = portHash('Recipes-App-KAN-25');
    expect(a).not.toEqual(b);
  });

  it('produces ports inside the documented ranges', () => {
    const ports = portHash('any-string');
    expect(ports.http).toBeGreaterThanOrEqual(8001);
    expect(ports.http).toBeLessThanOrEqual(8099);
    expect(ports.https).toBeGreaterThanOrEqual(8401);
    expect(ports.https).toBeLessThanOrEqual(8499);
    expect(ports.postgres).toBeGreaterThanOrEqual(15401);
    expect(ports.postgres).toBeLessThanOrEqual(15499);
  });

  it('matches the bash docker-env.sh output for the canonical KAN-23 case', () => {
    // Bash impl: echo -n "Recipes-App-KAN-23" | md5sum | head -c 4
    // → 1583 hex → 5507 dec → 5507 % 99 + 1 = 21
    // → http=8021, https=8421, postgres=15421
    expect(portHash('Recipes-App-KAN-23')).toEqual({
      http: 8021,
      https: 8421,
      postgres: 15421,
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/cli && npm run test:run -- port-hash
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `port-hash.ts`**

`packages/cli/src/lib/docker/port-hash.ts`:

```ts
import { createHash } from 'node:crypto';

export interface PortAssignment {
  http: number;
  https: number;
  postgres: number;
}

const HTTP_BASE = 8000;
const HTTPS_BASE = 8400;
const POSTGRES_BASE = 15400;
const RANGE = 99;

/**
 * Compute deterministic per-worktree docker host ports from the worktree's
 * directory basename.  Matches the algorithm used by the legacy
 * scripts/docker-env.sh in Recipes-App: md5(basename), take first 4 hex
 * chars, offset = (hash mod 99) + 1.
 */
export function portHash(basename: string): PortAssignment {
  const hashHex = createHash('md5').update(basename).digest('hex').slice(0, 4);
  const offset = (parseInt(hashHex, 16) % RANGE) + 1;
  return {
    http: HTTP_BASE + offset,
    https: HTTPS_BASE + offset,
    postgres: POSTGRES_BASE + offset,
  };
}
```

- [ ] **Step 4: Add the partial `docker/index.ts` (re-exports for now)**

`packages/cli/src/lib/docker/index.ts`:

```ts
export * from './port-hash';
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd packages/cli && npm run test:run -- port-hash
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Run typecheck across the workspace**

```bash
cd ~/Repos/crew && npm run typecheck
```

Expected: PASS. The `lib/index.ts` barrel from Task 1 still references modules that don't exist, but TypeScript is OK with that under `verbatimModuleSyntax` because re-exports don't cause an immediate failure for missing files — the resolution is deferred. If it does fail with module-not-found, comment out the missing-module re-exports in `lib/index.ts` temporarily and uncomment as each module lands.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/lib/docker/
git commit -m "feat(CREW-3): docker/portHash — deterministic per-worktree ports"
```

---

## Task 3: docker/compose helpers

Compose project introspection — used by `crew list` (CREW-8) and `crew docker-env` (CREW-7).

**Files:**

- Create: `packages/cli/src/lib/docker/compose.ts`
- Create: `packages/cli/src/lib/docker/compose.test.ts`
- Modify: `packages/cli/src/lib/docker/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/cli/src/lib/docker/compose.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listRunningProjects, getStackUrl } from './compose';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

import { execa } from 'execa';

const mockedExeca = vi.mocked(execa);

describe('listRunningProjects', () => {
  beforeEach(() => {
    mockedExeca.mockReset();
  });

  it('returns project names from `docker ps` output', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: 'recipes-app\nrecipes-app-kan-23\nrecipes-app-kan-25\n',
    } as never);

    const projects = await listRunningProjects();

    expect(projects).toEqual(['recipes-app', 'recipes-app-kan-23', 'recipes-app-kan-25']);
    expect(mockedExeca).toHaveBeenCalledWith('docker', expect.arrayContaining(['ps', '--format']));
  });

  it('deduplicates and skips empty lines', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: 'recipes-app\nrecipes-app\n\nrecipes-app-kan-23\n',
    } as never);

    const projects = await listRunningProjects();

    expect(projects).toEqual(['recipes-app', 'recipes-app-kan-23']);
  });

  it('returns empty array when docker reports no running projects', async () => {
    mockedExeca.mockResolvedValueOnce({ stdout: '' } as never);

    expect(await listRunningProjects()).toEqual([]);
  });
});

describe('getStackUrl', () => {
  beforeEach(() => {
    mockedExeca.mockReset();
  });

  it('returns the https URL for a running project', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: '0.0.0.0:8421\n[::]:8421\n',
    } as never);

    expect(await getStackUrl('recipes-app-kan-23')).toBe('https://localhost:8421');
  });

  it('returns null when the caddy container is not running', async () => {
    mockedExeca.mockRejectedValueOnce(new Error('No such container'));

    expect(await getStackUrl('recipes-app-kan-23')).toBeNull();
  });

  it('omits the port suffix when caddy is on 443', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: '0.0.0.0:443\n',
    } as never);

    expect(await getStackUrl('recipes-app')).toBe('https://localhost');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/cli && npm run test:run -- compose
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `compose.ts`**

`packages/cli/src/lib/docker/compose.ts`:

```ts
import { execa } from 'execa';

/**
 * Returns unique compose project names whose containers are currently running.
 * Wraps `docker ps --format '{{.Label "com.docker.compose.project"}}'`.
 */
export async function listRunningProjects(): Promise<string[]> {
  const { stdout } = await execa('docker', [
    'ps',
    '--format',
    '{{.Label "com.docker.compose.project"}}',
  ]);
  const seen = new Set<string>();
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

/**
 * Look up the host-bound HTTPS port for a compose project's caddy service
 * and render the URL the user should hit in a browser.  Returns null if the
 * project's caddy container isn't running.
 */
export async function getStackUrl(project: string): Promise<string | null> {
  try {
    // First find the caddy container for this project.
    const { stdout: containerId } = await execa('docker', [
      'ps',
      '-q',
      '--filter',
      `label=com.docker.compose.project=${project}`,
      '--filter',
      'label=com.docker.compose.service=caddy',
    ]);
    const id = containerId.trim().split('\n')[0];
    if (!id) return null;

    const { stdout } = await execa('docker', ['port', id, '443/tcp']);
    const portLine = stdout.split('\n')[0]?.trim();
    if (!portLine) return null;

    // Format is `0.0.0.0:8421` or `[::]:8421` — take the part after the last colon.
    const port = portLine.split(':').pop();
    if (!port) return null;

    return port === '443' ? 'https://localhost' : `https://localhost:${port}`;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Update `docker/index.ts` to re-export compose helpers**

`packages/cli/src/lib/docker/index.ts`:

```ts
export * from './port-hash';
export * from './compose';
```

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd packages/cli && npm run test:run -- docker
```

Expected: 7 tests pass (4 from port-hash + 3+3 from compose).

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/docker/
git commit -m "feat(CREW-3): docker/compose — listRunningProjects + getStackUrl"
```

---

## Task 4: prompts/ — typed prompt builders

Replaces the bash `__KEY__` sed-substitution with proper string interpolation. No IO, no fixtures — fully unit-testable.

**Files:**

- Create: `packages/cli/src/lib/prompts/ticket.ts`
- Create: `packages/cli/src/lib/prompts/fix-pr.ts`
- Create: `packages/cli/src/lib/prompts/builders.test.ts`
- Create: `packages/cli/src/lib/prompts/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/cli/src/lib/prompts/builders.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildTicketPrompt, buildFixPrPrompt } from './';

describe('buildTicketPrompt', () => {
  it('substitutes the ticket key throughout', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
    });

    expect(prompt).toContain('KAN-23');
    expect(prompt).not.toContain('__KEY__');
    expect(prompt).toContain('Safturento/Recipes');
    expect(prompt).toContain('https://safturento.atlassian.net');
  });

  it('mentions the required Superpowers skills', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
    });

    expect(prompt).toContain('superpowers:executing-plans');
    expect(prompt).toContain('superpowers:test-driven-development');
    expect(prompt).toContain('superpowers:verification-before-completion');
    expect(prompt).toContain('superpowers:requesting-code-review');
  });

  it('includes the Epic guard step', () => {
    const prompt = buildTicketPrompt({
      key: 'KAN-23',
      githubRepo: 'Safturento/Recipes',
      jiraSite: 'https://safturento.atlassian.net',
    });

    expect(prompt).toMatch(/issue_type\.name == "Epic"/);
  });
});

describe('buildFixPrPrompt', () => {
  it('substitutes the ticket key and feedback body', () => {
    const prompt = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: 'Please fix the typo in line 42.',
      feedbackSource: 'GitHub PR comments',
    });

    expect(prompt).toContain('KAN-23');
    expect(prompt).toContain('Please fix the typo in line 42.');
    expect(prompt).toContain('GitHub PR comments');
  });

  it('omits the conflict preamble when no conflicts are passed', () => {
    const prompt = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: '...',
      feedbackSource: 'stdin',
    });

    expect(prompt).not.toContain('mid-rebase');
    expect(prompt).toContain('git push --force-with-lease');
  });

  it('inserts the conflict preamble when conflictFiles are provided', () => {
    const prompt = buildFixPrPrompt({
      key: 'KAN-23',
      feedback: '...',
      feedbackSource: 'stdin',
      conflictFiles: ['src/foo.ts', 'src/bar.ts'],
    });

    expect(prompt).toContain('mid-rebase');
    expect(prompt).toContain('src/foo.ts');
    expect(prompt).toContain('src/bar.ts');
    expect(prompt).toContain('DO NOT PUSH this run');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/cli && npm run test:run -- prompts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ticket.ts`**

`packages/cli/src/lib/prompts/ticket.ts`:

```ts
export interface BuildTicketPromptOptions {
  key: string;
  githubRepo: string; // e.g. "Safturento/Recipes"
  jiraSite: string; // e.g. "https://safturento.atlassian.net"
}

export function buildTicketPrompt(opts: BuildTicketPromptOptions): string {
  return `You are running unattended on a fresh git worktree to implement Jira ticket ${opts.key} end-to-end. The repo's \`CLAUDE.md\` is your authoritative project guide; read it before doing anything else.

## Skills

You are required to use these Superpowers skills as appropriate. Invoke each via the \`Skill\` tool when its trigger condition fires:

- **\`superpowers:executing-plans\`** — fires when a plan document exists at \`docs/plans/${opts.key}-*.md\`, \`docs/superpowers/plans/${opts.key}-*.md\`, or similar. If a plan exists, skip the inline-planning step and follow the plan task-by-task with the skill's checkpoint discipline.
- **\`superpowers:test-driven-development\`** — fires for every feature or bug fix you implement. Write the failing test first, watch it fail, then implement.
- **\`superpowers:verification-before-completion\`** — fires before claiming work is done, committing, or opening a PR. Required to run the verification commands and confirm output, not assume.
- **\`superpowers:systematic-debugging\`** — fires whenever you hit an unexpected failure (test red that you didn't write, type error you don't understand, runtime error). Don't guess at fixes; diagnose root causes.
- **\`superpowers:requesting-code-review\`** — fires as part of the Self-review step before pushing.

## Workflow

1. **Pull the ticket.** Use \`mcp__atlassian__jira_get_issue\` with key \`${opts.key}\`. Note the \`issue_type.name\` and the current \`status.name\`.

2. **Epic guard.** If \`issue_type.name == "Epic"\`, do not implement. Find children via \`mcp__atlassian__jira_search\` with JQL \`parent = ${opts.key}\` (or \`"Epic Link" = ${opts.key}\` for older layouts), write a breakdown to \`docs/tickets/${opts.key}.md\`, commit, and exit. Do not push.

3. **Move ${opts.key} to "In Progress".** Use \`mcp__atlassian__jira_get_transitions\` and \`mcp__atlassian__jira_transition_issue\`. Bump the parent Epic from "To Do" to "In Progress" if applicable.

4. **Read context.** Skim \`CLAUDE.md\`, \`docs/plans/\`, and any related ticket files.

5. **Write the ticket file** at \`docs/tickets/${opts.key}.md\` from \`docs/tickets/_template.md\` if one is needed for this ticket.

6. **Plan inline (or follow an existing plan).** If a plan doc exists, invoke \`superpowers:executing-plans\` and let the plan drive. Otherwise decompose into commit-shaped steps via \`TaskCreate\`.

7. **Execute, committing per step.** Use \`superpowers:test-driven-development\`. Frequent small commits referencing \`${opts.key}\`.

8. **Verify.** Invoke \`superpowers:verification-before-completion\`. Run lint / format / typecheck / test:run.

9. **Self-review.** Invoke \`superpowers:requesting-code-review\`.

10. **Push and PR.**

    \`\`\`
    git push -u origin ${opts.key}
    gh pr create --base main --head ${opts.key} --title "<title>" --body "<Summary + Test Plan>"
    \`\`\`

11. **Move ${opts.key} to "In Review".**

## Repo context

- GitHub: ${opts.githubRepo}
- Jira: ${opts.jiraSite}
- Default branch: main

## Constraints

- Do not push to \`main\` or any branch other than \`${opts.key}\`.
- No \`--no-verify\`, no plain \`--force\`. \`--force-with-lease\` allowed on \`${opts.key}\` for rebases only.
- Do not write to \`.git\`, \`.claude\`, \`.husky\`, \`.vscode\`, \`.idea\`.
`;
}
```

- [ ] **Step 4: Implement `fix-pr.ts`**

`packages/cli/src/lib/prompts/fix-pr.ts`:

```ts
export interface BuildFixPrPromptOptions {
  key: string;
  feedback: string;
  feedbackSource: string; // human-readable: "GitHub PR comments", "stdin", "file: /tmp/x.md"
  conflictFiles?: string[];
}

export function buildFixPrPrompt(opts: BuildFixPrPromptOptions): string {
  const conflictPreamble =
    opts.conflictFiles && opts.conflictFiles.length > 0 ? buildConflictPreamble(opts) : '';

  const pushDirective =
    opts.conflictFiles && opts.conflictFiles.length > 0
      ? `**DO NOT PUSH this run.** Conflicts were resolved during the rebase, so the human must inspect the resolution commits before they reach origin. After your feedback fixes are committed and verified, print exactly one line and exit: "Rebase resolution + feedback ready for inspection — run 'git push --force-with-lease origin ${opts.key}' once you've reviewed."`
      : `Push with \`git push --force-with-lease origin ${opts.key}\` to extend the existing PR. Do NOT open a new PR. Plain \`--force\` is never allowed.`;

  return `${conflictPreamble}Code review feedback on the work you have already pushed for ${opts.key}.
Source: ${opts.feedbackSource}.

---

${opts.feedback}

---

## Skills

- **\`superpowers:test-driven-development\`** — for every feedback item that requires implementation work.
- **\`superpowers:verification-before-completion\`** — before pushing.
- **\`superpowers:systematic-debugging\`** — when something fails unexpectedly.
- **\`superpowers:requesting-code-review\`** — before pushing.

## Apply the fixes

- Update implementation and tests to address each point.
- After each meaningful unit of work, \`git add\` and commit with a clear message referencing ${opts.key}.
- Run \`npm run lint\`, \`npm run format\`, \`npm run typecheck\`, and \`npm run test:run\` — all must pass before pushing.
- ${pushDirective}
- If a piece of feedback is wrong or you disagree with it, write your reasoning back instead of blindly applying it.
- Do NOT resolve review threads on GitHub yourself.
`;
}

function buildConflictPreamble(opts: BuildFixPrPromptOptions): string {
  const fileList = (opts.conflictFiles ?? []).map((f) => `- ${f}`).join('\n');
  return `**You are mid-rebase.** \`${opts.key}\` is being rebased on top of \`origin/main\`, and these files have unresolved conflicts that you must resolve before applying the review feedback below:

${fileList}

## Conflict-resolution rules (do this FIRST, before any feedback work)

- Read each conflicting file. Use \`git log\` and \`git show\` if needed to understand both sides' intent.
- Resolve each conflict preserving both sides' intent where they don't directly contradict.
- After resolving a file: \`git add <file>\`.
- When all conflicts in the current rebase step are resolved: \`git rebase --continue\`. Loop until the rebase finishes.
- Run \`npm run lint\`, \`npm run typecheck\`, \`npm run test:run\` — ALL must pass.
- If you are not confident in a resolution: \`git rebase --abort\`, document the blocker in \`docs/tickets/${opts.key}.md\` "Open questions", and exit WITHOUT applying the review feedback.
- **DO NOT push, even if everything passes.** The human must inspect rebase resolution commits.

---

`;
}
```

- [ ] **Step 5: Add `prompts/index.ts`**

`packages/cli/src/lib/prompts/index.ts`:

```ts
export { buildTicketPrompt, type BuildTicketPromptOptions } from './ticket';
export { buildFixPrPrompt, type BuildFixPrPromptOptions } from './fix-pr';
```

- [ ] **Step 6: Run the test**

```bash
cd packages/cli && npm run test:run -- prompts
```

Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/src/lib/prompts/
git commit -m "feat(CREW-3): prompts/ — typed buildTicketPrompt + buildFixPrPrompt"
```

---

## Task 5: transcripts/ — JSONL parser + helpers

Replaces the bash watch-ticket.sh's jq filter with typed equivalents.

**Files:**

- Create: `packages/cli/src/lib/transcripts/types.ts`
- Create: `packages/cli/src/lib/transcripts/parser.ts`
- Create: `packages/cli/src/lib/transcripts/parser.test.ts`
- Create: `packages/cli/src/lib/transcripts/index.ts`
- Create: `packages/cli/test/fixtures/transcript-sample.jsonl`

- [ ] **Step 1: Write the test fixture**

`packages/cli/test/fixtures/transcript-sample.jsonl` — three sample events covering an assistant turn with a tool call, a user turn with a tool result, and a session-end marker:

```jsonl
{"type":"assistant","timestamp":"2026-04-26T17:47:39.520Z","message":{"id":"msg_001","model":"claude-opus-4-7","role":"assistant","content":[{"type":"tool_use","id":"tool_001","name":"Read","input":{"file_path":"/home/x/repo/foo.ts"}}],"usage":{"input_tokens":10,"cache_creation_input_tokens":0,"cache_read_input_tokens":1000,"output_tokens":42}}}
{"type":"user","timestamp":"2026-04-26T17:47:39.700Z","message":{"role":"user","content":[{"type":"tool_result","tool_use_id":"tool_001","content":"file contents..."}]}}
{"type":"last-prompt","lastPrompt":"...","sessionId":"abc123"}
```

(Single-line JSONL; the above is wrapped here for readability — write each as one literal line in the file.)

- [ ] **Step 2: Write the failing test**

`packages/cli/src/lib/transcripts/parser.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parseTranscript, parseToolCall, aggregateUsage, formatToolCall } from './';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../../../test/fixtures/transcript-sample.jsonl');

describe('parseTranscript', () => {
  it('parses a JSONL transcript into typed events', () => {
    const raw = readFileSync(FIXTURE, 'utf8');
    const events = parseTranscript(raw);

    expect(events).toHaveLength(3);
    expect(events[0]?.type).toBe('assistant');
    expect(events[1]?.type).toBe('user');
    expect(events[2]?.type).toBe('last-prompt');
  });

  it('skips blank lines', () => {
    const events = parseTranscript('\n\n');
    expect(events).toHaveLength(0);
  });

  it('skips lines that fail to parse as JSON', () => {
    const events = parseTranscript(
      '{"type":"assistant","timestamp":"x","message":{"id":"a","model":"m","role":"assistant","content":[],"usage":{"input_tokens":0,"cache_creation_input_tokens":0,"cache_read_input_tokens":0,"output_tokens":0}}}\n{not json}\n',
    );
    expect(events).toHaveLength(1);
  });
});

describe('parseToolCall', () => {
  it('extracts the tool_use from an assistant event', () => {
    const raw = readFileSync(FIXTURE, 'utf8');
    const [first] = parseTranscript(raw);
    const call = parseToolCall(first!);

    expect(call).not.toBeNull();
    expect(call?.name).toBe('Read');
    expect(call?.input).toEqual({ file_path: '/home/x/repo/foo.ts' });
    expect(call?.outputTokens).toBe(42);
    expect(call?.timestamp).toBe('2026-04-26T17:47:39.520Z');
  });

  it('returns null for non-assistant events', () => {
    const raw = readFileSync(FIXTURE, 'utf8');
    const events = parseTranscript(raw);
    expect(parseToolCall(events[1]!)).toBeNull();
    expect(parseToolCall(events[2]!)).toBeNull();
  });
});

describe('aggregateUsage', () => {
  it('sums output_tokens across assistant events', () => {
    const raw = readFileSync(FIXTURE, 'utf8');
    const events = parseTranscript(raw);
    const usage = aggregateUsage(events);

    expect(usage.outputTokens).toBe(42);
    expect(usage.cacheReadTokens).toBe(1000);
  });
});

describe('formatToolCall', () => {
  it('renders Read calls with the file path', () => {
    const call = parseToolCall(parseTranscript(readFileSync(FIXTURE, 'utf8'))[0]!);
    expect(formatToolCall(call!)).toContain('Read');
    expect(formatToolCall(call!)).toContain('/home/x/repo/foo.ts');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd packages/cli && npm run test:run -- transcripts
```

Expected: FAIL.

- [ ] **Step 4: Implement `types.ts`**

`packages/cli/src/lib/transcripts/types.ts`:

```ts
export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultContent {
  type: 'tool_result';
  tool_use_id: string;
  content: unknown;
}

export interface ThinkingContent {
  type: 'thinking';
  thinking: string;
  signature: string;
}

export type MessageContent =
  | ToolUseContent
  | ToolResultContent
  | ThinkingContent
  | { type: string };

export interface UsageBlock {
  input_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  output_tokens: number;
}

export interface AssistantEvent {
  type: 'assistant';
  timestamp: string;
  message: {
    id: string;
    model: string;
    role: 'assistant';
    content: MessageContent[];
    usage: UsageBlock;
  };
}

export interface UserEvent {
  type: 'user';
  timestamp: string;
  message: {
    role: 'user';
    content: MessageContent[];
  };
}

export interface LastPromptEvent {
  type: 'last-prompt';
  lastPrompt: string;
  sessionId: string;
}

export type TranscriptEvent = AssistantEvent | UserEvent | LastPromptEvent;

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  timestamp: string;
  outputTokens: number;
}

export interface AggregateUsage {
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  inputTokens: number;
}
```

- [ ] **Step 5: Implement `parser.ts`**

`packages/cli/src/lib/transcripts/parser.ts`:

```ts
import type {
  TranscriptEvent,
  AssistantEvent,
  ToolCall,
  AggregateUsage,
  ToolUseContent,
} from './types';

export function parseTranscript(raw: string): TranscriptEvent[] {
  const events: TranscriptEvent[] = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      events.push(JSON.parse(trimmed) as TranscriptEvent);
    } catch {
      // skip malformed lines
    }
  }
  return events;
}

export function parseToolCall(event: TranscriptEvent): ToolCall | null {
  if (event.type !== 'assistant') return null;
  const toolUse = event.message.content.find((c): c is ToolUseContent => c.type === 'tool_use');
  if (!toolUse) return null;
  return {
    name: toolUse.name,
    input: toolUse.input,
    timestamp: event.timestamp,
    outputTokens: event.message.usage.output_tokens,
  };
}

export function aggregateUsage(events: TranscriptEvent[]): AggregateUsage {
  const total: AggregateUsage = {
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    inputTokens: 0,
  };
  for (const event of events) {
    if (event.type !== 'assistant') continue;
    const u = event.message.usage;
    total.outputTokens += u.output_tokens;
    total.cacheReadTokens += u.cache_read_input_tokens;
    total.cacheCreationTokens += u.cache_creation_input_tokens;
    total.inputTokens += u.input_tokens;
  }
  return total;
}

/**
 * Format a tool call as a single short line for the live stream.  Mirrors the
 * bash watch-ticket.sh / run-ticket.sh formatting for parity.
 */
export function formatToolCall(call: ToolCall): string {
  const time = call.timestamp.replace(/^.*T/, '').replace(/\..*Z$/, '');
  const tokenLabel = formatTokens(call.outputTokens);
  const inputSummary = summarizeInput(call.name, call.input);
  return `${time}  [${call.name}][${tokenLabel}] ${inputSummary}`;
}

function formatTokens(n: number): string {
  if (n === 0) return '0 tok';
  if (n >= 10000) return `${Math.floor(n / 1000)}k tok`;
  if (n >= 1000) return `${(Math.floor((n * 10) / 1000) / 10).toString()}k tok`;
  return `${n} tok`;
}

function summarizeInput(toolName: string, input: Record<string, unknown>): string {
  switch (toolName) {
    case 'Read':
    case 'Edit':
    case 'Write':
      return String(input.file_path ?? '?');
    case 'Bash':
      return String(input.command ?? '')
        .replace(/\n/g, ' ⏎ ')
        .slice(0, 140);
    case 'Glob':
      return `${String(input.pattern ?? '?')}  in  ${String(input.path ?? '.')}`;
    case 'Grep':
      return `/${String(input.pattern ?? '?')}/  in  ${String(input.path ?? '.')}`;
    default:
      return JSON.stringify(input).slice(0, 120);
  }
}
```

- [ ] **Step 6: Add `transcripts/index.ts`**

```ts
export * from './types';
export * from './parser';
```

- [ ] **Step 7: Run the test**

```bash
cd packages/cli && npm run test:run -- transcripts
```

Expected: PASS, 7 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/lib/transcripts/ packages/cli/test/fixtures/transcript-sample.jsonl
git commit -m "feat(CREW-3): transcripts/ — typed JSONL parser + tool-call helpers"
```

---

## Task 6: config/ — TOML loader + zod schema + auto-discovery

**Files:**

- Create: `packages/cli/src/lib/config/schema.ts`
- Create: `packages/cli/src/lib/config/loader.ts`
- Create: `packages/cli/src/lib/config/loader.test.ts`
- Create: `packages/cli/src/lib/config/index.ts`
- Create: `packages/cli/test/fixtures/project-config-sample.toml`

- [ ] **Step 1: Write the test fixture**

`packages/cli/test/fixtures/project-config-sample.toml`:

```toml
name = "recipes-app"
repo_path = "/home/x/Repos/Recipes-App"
default_branch = "main"

[jira]
project_key = "KAN"
site = "https://safturento.atlassian.net"

[github]
repo = "Safturento/Recipes"

[docker]
canonical_worktree = "Recipes-App"
http_port_base = 8000
https_port_base = 8400
postgres_port_base = 15400
```

- [ ] **Step 2: Write the failing test**

`packages/cli/src/lib/config/loader.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { parseProjectConfig } from './';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(__dirname, '../../../test/fixtures/project-config-sample.toml');

describe('parseProjectConfig', () => {
  it('parses a valid TOML config', () => {
    const raw = readFileSync(FIXTURE, 'utf8');
    const config = parseProjectConfig(raw);

    expect(config.name).toBe('recipes-app');
    expect(config.jira.project_key).toBe('KAN');
    expect(config.jira.site).toBe('https://safturento.atlassian.net');
    expect(config.github.repo).toBe('Safturento/Recipes');
    expect(config.docker?.canonical_worktree).toBe('Recipes-App');
    expect(config.default_branch).toBe('main');
  });

  it('defaults default_branch to "main" when omitted', () => {
    const raw = `
name = "minimal"
repo_path = "/x"

[jira]
project_key = "MIN"
site = "https://x.atlassian.net"

[github]
repo = "u/r"
`;
    const config = parseProjectConfig(raw);
    expect(config.default_branch).toBe('main');
  });

  it('throws a useful error on invalid TOML', () => {
    expect(() => parseProjectConfig('not = valid = toml')).toThrow();
  });

  it('throws when jira.site is not a URL', () => {
    const raw = `
name = "x"
repo_path = "/x"

[jira]
project_key = "X"
site = "not a url"

[github]
repo = "u/r"
`;
    expect(() => parseProjectConfig(raw)).toThrow();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd packages/cli && npm run test:run -- config
```

Expected: FAIL.

- [ ] **Step 4: Implement `schema.ts`**

`packages/cli/src/lib/config/schema.ts`:

```ts
import { z } from 'zod';

export const projectConfigSchema = z.object({
  name: z.string(),
  repo_path: z.string(),
  default_branch: z.string().default('main'),
  jira: z.object({
    project_key: z.string(),
    site: z.string().url(),
  }),
  github: z.object({
    repo: z.string(),
  }),
  docker: z
    .object({
      canonical_worktree: z.string(),
      http_port_base: z.number().default(8000),
      https_port_base: z.number().default(8400),
      postgres_port_base: z.number().default(15400),
    })
    .optional(),
  sandbox: z
    .object({
      allowed_domains: z.array(z.string()),
    })
    .optional(),
});

export type ProjectConfig = z.infer<typeof projectConfigSchema>;
```

- [ ] **Step 5: Implement `loader.ts`**

`packages/cli/src/lib/config/loader.ts`:

```ts
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseToml } from 'smol-toml';
import { execa } from 'execa';
import { projectConfigSchema, type ProjectConfig } from './schema';

const CONFIG_DIR = join(homedir(), '.config', 'crew', 'projects');

/**
 * Parse a TOML config string and validate against the project-config schema.
 * Throws on invalid TOML or schema violations.
 */
export function parseProjectConfig(raw: string): ProjectConfig {
  const parsed = parseToml(raw);
  return projectConfigSchema.parse(parsed);
}

/**
 * Load a named project config from ~/.config/crew/projects/<name>.toml.
 */
export function loadProjectConfigByName(name: string): ProjectConfig {
  const path = join(CONFIG_DIR, `${name}.toml`);
  if (!existsSync(path)) {
    throw new Error(\`no project config at \${path}\`);
  }
  return parseProjectConfig(readFileSync(path, 'utf8'));
}

/**
 * Auto-discover the project config that matches the current cwd.  Walks up to
 * find a .git directory, reads the origin URL, and returns the first config
 * in ~/.config/crew/projects/*.toml whose github.repo matches.  Returns null
 * if no match.
 */
export async function discoverProjectConfig(cwd: string): Promise<ProjectConfig | null> {
  let { stdout: remoteUrl } = await execa('git', ['-C', cwd, 'remote', 'get-url', 'origin']).catch(
    () => ({ stdout: '' }),
  );
  remoteUrl = remoteUrl.trim();
  if (!remoteUrl) return null;

  const repoSlug = parseGithubSlug(remoteUrl);
  if (!repoSlug) return null;

  if (!existsSync(CONFIG_DIR)) return null;
  for (const file of readdirSync(CONFIG_DIR)) {
    if (!file.endsWith('.toml')) continue;
    try {
      const config = parseProjectConfig(readFileSync(join(CONFIG_DIR, file), 'utf8'));
      if (config.github.repo === repoSlug) return config;
    } catch {
      // skip files that don't parse
    }
  }
  return null;
}

function parseGithubSlug(remoteUrl: string): string | null {
  // git@github.com:owner/repo.git → owner/repo
  // https://github.com/owner/repo.git → owner/repo
  const match = remoteUrl.match(/github\.com[:/]([^/]+\/[^/.]+)(\.git)?$/);
  return match?.[1] ?? null;
}
```

- [ ] **Step 6: Add `config/index.ts`**

```ts
export * from './schema';
export * from './loader';
```

- [ ] **Step 7: Run the test**

```bash
cd packages/cli && npm run test:run -- config
```

Expected: PASS, 4 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/cli/src/lib/config/ packages/cli/test/fixtures/project-config-sample.toml
git commit -m "feat(CREW-3): config/ — TOML loader + zod schema + project auto-discovery"
```

---

## Task 7: jira/ — minimal REST client

Three functions. Uses Node's built-in `fetch`. Auth via Basic from `JIRA_EMAIL` + `JIRA_TOKEN` env vars (or pass-through to a future per-user secrets file).

**Files:**

- Create: `packages/cli/src/lib/jira/client.ts`
- Create: `packages/cli/src/lib/jira/client.test.ts`
- Create: `packages/cli/src/lib/jira/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/cli/src/lib/jira/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JiraClient } from './';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

const client = new JiraClient({
  site: 'https://safturento.atlassian.net',
  email: 'me@example.com',
  token: 'xxx',
});

beforeEach(() => fetchMock.mockReset());

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}
function status(code: number) {
  return { ok: false, status: code, json: async () => ({}), text: async () => '' };
}

describe('JiraClient.getIssue', () => {
  it('GETs the issue endpoint with Basic auth', async () => {
    fetchMock.mockResolvedValueOnce(ok({ key: 'KAN-1', fields: { status: { name: 'Done' } } }));

    const issue = await client.getIssue('KAN-1');

    expect(issue.key).toBe('KAN-1');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://safturento.atlassian.net/rest/api/3/issue/KAN-1');
    expect(init.headers.Authorization).toMatch(/^Basic /);
  });

  it('throws a useful error on non-2xx', async () => {
    fetchMock.mockResolvedValueOnce(status(404));
    await expect(client.getIssue('NOPE-1')).rejects.toThrow(/404/);
  });
});

describe('JiraClient.getTransitions', () => {
  it('returns the transitions array', async () => {
    fetchMock.mockResolvedValueOnce(
      ok({ transitions: [{ id: '11', name: 'Done', to: { name: 'Done' } }] }),
    );

    const transitions = await client.getTransitions('KAN-1');

    expect(transitions).toHaveLength(1);
    expect(transitions[0]?.name).toBe('Done');
  });
});

describe('JiraClient.transition', () => {
  it('POSTs the transition body', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => ({}),
      text: async () => '',
    });

    await client.transition('KAN-1', '11');

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://safturento.atlassian.net/rest/api/3/issue/KAN-1/transitions');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ transition: { id: '11' } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/cli && npm run test:run -- jira
```

Expected: FAIL.

- [ ] **Step 3: Implement `client.ts`**

`packages/cli/src/lib/jira/client.ts`:

```ts
export interface JiraClientOptions {
  site: string; // e.g. "https://safturento.atlassian.net"
  email: string;
  token: string;
}

export interface JiraIssue {
  key: string;
  fields: {
    status: { name: string };
    issuetype?: { name: string };
    parent?: { key: string };
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export interface JiraTransition {
  id: string;
  name: string;
  to: { name: string };
}

export class JiraClient {
  private readonly authHeader: string;

  constructor(private readonly opts: JiraClientOptions) {
    this.authHeader = `Basic ${Buffer.from(\`\${opts.email}:\${opts.token}\`).toString('base64')}`;
  }

  async getIssue(key: string): Promise<JiraIssue> {
    return this.request<JiraIssue>(\`/rest/api/3/issue/\${key}\`);
  }

  async getTransitions(key: string): Promise<JiraTransition[]> {
    const body = await this.request<{ transitions: JiraTransition[] }>(
      \`/rest/api/3/issue/\${key}/transitions\`,
    );
    return body.transitions;
  }

  async transition(key: string, transitionId: string): Promise<void> {
    await this.request(\`/rest/api/3/issue/\${key}/transitions\`, {
      method: 'POST',
      body: JSON.stringify({ transition: { id: transitionId } }),
    });
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(\`\${this.opts.site}\${path}\`, {
      ...init,
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    if (!res.ok) {
      throw new Error(\`Jira \${init?.method ?? 'GET'} \${path} failed: \${res.status}\`);
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }
}
```

- [ ] **Step 4: Add `jira/index.ts`**

```ts
export * from './client';
```

- [ ] **Step 5: Run the test**

```bash
cd packages/cli && npm run test:run -- jira
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/jira/
git commit -m "feat(CREW-3): jira/ — minimal REST client (getIssue, getTransitions, transition)"
```

---

## Task 8: github/ — gh CLI wrapper

Three functions wrapping `gh` via execa. No direct REST — relies on the user's `gh auth` for token handling.

**Files:**

- Create: `packages/cli/src/lib/github/client.ts`
- Create: `packages/cli/src/lib/github/client.test.ts`
- Create: `packages/cli/src/lib/github/index.ts`

- [ ] **Step 1: Write the failing test**

`packages/cli/src/lib/github/client.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPrForBranch, getReviewComments, mergeStatus } from './';

vi.mock('execa', () => ({ execa: vi.fn() }));

import { execa } from 'execa';

const mockedExeca = vi.mocked(execa);

beforeEach(() => mockedExeca.mockReset());

describe('getPrForBranch', () => {
  it('returns the matching PR or null', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify([{ number: 42, state: 'OPEN', url: 'https://...' }]),
    } as never);

    const pr = await getPrForBranch('KAN-1');
    expect(pr).toEqual({ number: 42, state: 'OPEN', url: 'https://...' });
  });

  it('returns null when gh reports no PRs', async () => {
    mockedExeca.mockResolvedValueOnce({ stdout: '[]' } as never);
    expect(await getPrForBranch('KAN-1')).toBeNull();
  });
});

describe('mergeStatus', () => {
  it('returns the PR state', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify({ state: 'MERGED', mergedAt: '2026-04-26T00:00:00Z' }),
    } as never);

    const status = await mergeStatus(42);
    expect(status.state).toBe('MERGED');
  });
});

describe('getReviewComments', () => {
  it('returns unresolved review-thread comments via GraphQL', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: JSON.stringify({
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [
                  {
                    isResolved: false,
                    comments: {
                      nodes: [
                        {
                          author: { login: 'reviewer' },
                          path: 'src/foo.ts',
                          line: 10,
                          body: 'use let',
                        },
                      ],
                    },
                  },
                  {
                    isResolved: true,
                    comments: {
                      nodes: [{ author: { login: 'x' }, path: 'y', line: 1, body: 'old' }],
                    },
                  },
                ],
              },
            },
          },
        },
      }),
    } as never);

    const comments = await getReviewComments('Safturento', 'crew', 1);
    expect(comments).toHaveLength(1);
    expect(comments[0]?.body).toBe('use let');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd packages/cli && npm run test:run -- github
```

Expected: FAIL.

- [ ] **Step 3: Implement `client.ts`**

`packages/cli/src/lib/github/client.ts`:

```ts
import { execa } from 'execa';

export interface PrSummary {
  number: number;
  state: string;
  url: string;
}

export interface ReviewComment {
  author: string;
  path: string;
  line: number | null;
  body: string;
}

export async function getPrForBranch(branch: string): Promise<PrSummary | null> {
  const { stdout } = await execa('gh', [
    'pr',
    'list',
    '--head',
    branch,
    '--state',
    'all',
    '--json',
    'number,state,url',
  ]);
  const list = JSON.parse(stdout) as PrSummary[];
  return list[0] ?? null;
}

export async function mergeStatus(prNumber: number): Promise<{ state: string }> {
  const { stdout } = await execa('gh', ['pr', 'view', String(prNumber), '--json', 'state,mergedAt']);
  return JSON.parse(stdout) as { state: string };
}

export async function getReviewComments(
  owner: string,
  repo: string,
  prNumber: number,
): Promise<ReviewComment[]> {
  const query = \`
    query(\$owner:String!, \$repo:String!, \$num:Int!) {
      repository(owner:\$owner, name:\$repo) {
        pullRequest(number:\$num) {
          reviewThreads(first:100) {
            nodes {
              isResolved
              comments(first:50) {
                nodes {
                  author { login }
                  path
                  line
                  originalLine
                  body
                }
              }
            }
          }
        }
      }
    }
  \`;
  const { stdout } = await execa('gh', [
    'api',
    'graphql',
    '-f',
    \`query=\${query}\`,
    '-F',
    \`owner=\${owner}\`,
    '-F',
    \`repo=\${repo}\`,
    '-F',
    \`num=\${prNumber}\`,
  ]);

  type GraphQLResponse = {
    data: {
      repository: {
        pullRequest: {
          reviewThreads: {
            nodes: Array<{
              isResolved: boolean;
              comments: {
                nodes: Array<{
                  author: { login: string };
                  path: string;
                  line: number | null;
                  originalLine: number | null;
                  body: string;
                }>;
              };
            }>;
          };
        };
      };
    };
  };

  const data = JSON.parse(stdout) as GraphQLResponse;
  const out: ReviewComment[] = [];
  for (const thread of data.data.repository.pullRequest.reviewThreads.nodes) {
    if (thread.isResolved) continue;
    for (const c of thread.comments.nodes) {
      out.push({
        author: c.author.login,
        path: c.path,
        line: c.line ?? c.originalLine,
        body: c.body,
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: Add `github/index.ts`**

```ts
export * from './client';
```

- [ ] **Step 5: Run the test**

```bash
cd packages/cli && npm run test:run -- github
```

Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/cli/src/lib/github/
git commit -m "feat(CREW-3): github/ — gh CLI wrapper (getPrForBranch, mergeStatus, getReviewComments)"
```

---

## Task 9: Verification gate

Final acceptance check. Invoke `superpowers:verification-before-completion` here.

- [ ] **Step 1: typecheck**

```bash
cd ~/Repos/crew && npm run typecheck
```

Expected: zero errors.

- [ ] **Step 2: lint**

```bash
npm run lint
```

Expected: zero warnings.

- [ ] **Step 3: format check**

```bash
npm run format:check
```

Expected: clean. If diffs, run `npm run format` once and re-check.

- [ ] **Step 4: full test run**

```bash
npm run test:run
```

Expected: all tests pass. Roughly: docker (~7), prompts (~6), transcripts (~7), config (~4), jira (~4), github (~4) = ~32 tests total.

- [ ] **Step 5: confirm clean working tree**

```bash
git status
```

Expected: nothing to commit.

---

## Self-review

**Spec coverage:**

- ✅ config/ (TOML + zod + auto-discover) — Task 6
- ✅ docker/ (port-hash + compose helpers) — Tasks 2, 3
- ✅ transcripts/ (parser + helpers) — Task 5
- ✅ prompts/ (typed builders) — Task 4
- ✅ jira/ (REST client) — Task 7
- ✅ github/ (gh wrapper) — Task 8
- ✅ All ship under `packages/cli/src/lib/` per architecture doc Phase 1 decision (extracted to `packages/shared/` later in Phase 1.5)

**Placeholder scan:** No "TBD" / "implement later". Every test has full code; every implementation has full code; every command has expected output.

**Type consistency:**

- `ProjectConfig` from `config/schema.ts` is the source of truth — used by every consumer.
- `TranscriptEvent` discriminated union from `transcripts/types.ts` is consistent across `parseTranscript`, `parseToolCall`, `aggregateUsage`.
- `JiraClient` constructor options match the schema fields (`email`, `token`, `site`).
- `getReviewComments` GraphQL query shape matches the test fixture and the bash equivalent in fix-pr.sh.

**Skills hooks:**

- `superpowers:test-driven-development` — fires on every module task (Tasks 2-8). The plan's TDD pattern (write failing test → run → implement → verify) is explicit per task.
- `superpowers:verification-before-completion` — fires at Task 9 explicitly.
- `superpowers:systematic-debugging` — fires if any task's expected output deviates. Don't guess.
- `superpowers:requesting-code-review` — runs at Self-review per the agent's `ticket-prompt.md` Step 9 (after the plan is complete, before pushing).
