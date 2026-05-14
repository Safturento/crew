# crew resume — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `crew resume`, `crew restart`, `crew reset` commands plus a shared `-m "<msg>"` flag across all agent-spawning commands. Replace `crew fix-pr --from-stdin` with `-m`. Eliminates the manual `git worktree remove` cleanup dance after an interrupted `crew run`.

**Architecture:** Three new command shells (`resume`, `restart`, `reset`) over existing primitives. `crew restart` is composed: `reset` (sessions) + `resume` (which falls through to fresh-claude when no session exists). `crew restart --hard` is `reset --hard` + `run`. The `-m` flag adds `userMessage` content to each command's prompt — slotted via a shared `userMessageBlock` partial for `run`/`resume`, and as a new `message` feedback mode in fix-pr's existing `loadFeedback` plumbing. Foundation comes from CREW-62's `prepareAgentEnvironment({mode: 'resume'})`.

**Tech Stack:** TypeScript, commander, vitest, execa, npm workspaces. Existing CLI conventions in `packages/cli/src/commands/`.

**Source spec:** [`docs/superpowers/specs/2026-04-30-crew-resume-design.md`](../specs/2026-04-30-crew-resume-design.md). Read it before starting.

**Ticket carve-up** (single child ticket under epic CREW-56):

| Ticket          | Tasks      | Notes                                                                                                            |
| --------------- | ---------- | ---------------------------------------------------------------------------------------------------------------- |
| **CREW-resume** | Tasks 1–13 | One coherent body of work; ~12 commits. Manual gate (Task 13) is the closing step rather than a separate ticket. |

The work is small enough that splitting buys nothing. If a reviewer prefers two PRs, a clean split is Tasks 1–6 (foundation + extending existing commands with `-m`) vs. Tasks 7–13 (new commands + manual gate) — but one PR is the default.

**Naming convention.** Throughout: `userMessage` (TS option name), `userMessageBlock` (template placeholder + render var), `user-message` (template/partial filename), `-m` / `--message` (CLI flag). `--from-stdin` is removed wholesale.

---

## Task 1: `renderUserMessageBlock` helper + `user-message.md` partial

**Goal:** introduce the shared partial that wraps user-supplied `-m` content with a header. Used by `buildTicketPrompt` (Task 2) and `buildResumePrompt` (Task 9).

**Files:**

- Create: `packages/cli/src/lib/prompts/user-message.ts`
- Create: `packages/cli/src/lib/prompts/user-message.test.ts`
- Create: `packages/cli/src/lib/prompts/templates/user-message.md`

- [ ] **Step 1a: Write failing tests**

Create `packages/cli/src/lib/prompts/user-message.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderUserMessageBlock } from './user-message.js';

describe('renderUserMessageBlock', () => {
  it('returns empty string when message is undefined', () => {
    expect(renderUserMessageBlock(undefined)).toBe('');
  });

  it('returns empty string when message is empty', () => {
    expect(renderUserMessageBlock('')).toBe('');
  });

  it('returns empty string when message is whitespace only', () => {
    expect(renderUserMessageBlock('   \n  ')).toBe('');
  });

  it('renders the partial with the message slotted in', () => {
    const result = renderUserMessageBlock('focus on the recipe-list view');
    expect(result).toContain('Additional context from the user');
    expect(result).toContain('focus on the recipe-list view');
  });

  it('preserves multi-line message content verbatim', () => {
    const msg = 'line one\nline two\nline three';
    const result = renderUserMessageBlock(msg);
    expect(result).toContain(msg);
  });
});
```

- [ ] **Step 1b: Run to confirm fail**

Run: `npm run test --workspace=crew-cli -- --run user-message`
Expected: FAIL — `Cannot find module './user-message.js'`.

- [ ] **Step 1c: Create the partial template**

Create `packages/cli/src/lib/prompts/templates/user-message.md`:

```markdown
## Additional context from the user

{{message}}
```

(Trailing newline is intentional — keeps the slot from running into whatever follows it in the parent template.)

- [ ] **Step 1d: Implement the helper**

Create `packages/cli/src/lib/prompts/user-message.ts`:

```ts
import { render } from './render.js';

/**
 * Render the shared `user-message` partial with `message` slotted in.
 * Returns the empty string when `message` is undefined, empty, or
 * whitespace-only — so callers can unconditionally slot the result
 * into a `{{userMessageBlock}}` placeholder without branching.
 */
export function renderUserMessageBlock(message: string | undefined): string {
  if (!message || message.trim().length === 0) return '';
  return render('user-message', { message });
}
```

- [ ] **Step 1e: Run tests to confirm pass**

Run: `npm run test --workspace=crew-cli -- --run user-message`
Expected: PASS — all 5 tests green.

- [ ] **Step 1f: Run lint + format + typecheck**

Run: `npm run lint && npm run format:check && npm run typecheck`
Expected: PASS. If `format:check` fails on the new files, run `npm run format` and re-stage.

- [ ] **Step 1g: Commit**

```bash
git add packages/cli/src/lib/prompts/user-message.ts \
        packages/cli/src/lib/prompts/user-message.test.ts \
        packages/cli/src/lib/prompts/templates/user-message.md

git commit -m "feat(CREW-resume): renderUserMessageBlock helper + user-message partial

Shared rendering surface for the new -m '<message>' flag. Returns ''
when the message is undefined / empty / whitespace, so callers can slot
the result into a {{userMessageBlock}} placeholder without branching."
```

---

## Task 2: Extend `buildTicketPrompt` to accept `userMessage`

**Goal:** plumb a new `userMessage` option through the ticket prompt builder; slot the rendered block into `ticket.md` between the opening line and the `## Skills` header.

**Files:**

- Modify: `packages/cli/src/lib/prompts/ticket.ts`
- Modify: `packages/cli/src/lib/prompts/builders.test.ts`
- Modify: `packages/cli/src/lib/prompts/render.test.ts` (the placeholder list test)
- Modify: `packages/cli/src/lib/prompts/templates/ticket.md`

- [ ] **Step 2a: Write failing tests**

Add to `packages/cli/src/lib/prompts/builders.test.ts` (find the `describe('buildTicketPrompt', ...)` block and add inside):

```ts
it('includes the user-message block when userMessage is provided', () => {
  const prompt = buildTicketPrompt({
    key: 'KAN-23',
    githubRepo: 'Safturento/Recipes',
    jiraSite: 'https://safturento.atlassian.net',
    userMessage: 'start by looking at lib/recipe-list/',
  });
  expect(prompt).toContain('Additional context from the user');
  expect(prompt).toContain('start by looking at lib/recipe-list/');
});

it('omits the user-message block when userMessage is undefined', () => {
  const prompt = buildTicketPrompt({
    key: 'KAN-23',
    githubRepo: 'Safturento/Recipes',
    jiraSite: 'https://safturento.atlassian.net',
  });
  expect(prompt).not.toContain('Additional context from the user');
});

it('renders identically when userMessage is undefined as when omitted', () => {
  const a = buildTicketPrompt({
    key: 'KAN-23',
    githubRepo: 'Safturento/Recipes',
    jiraSite: 'https://safturento.atlassian.net',
  });
  const b = buildTicketPrompt({
    key: 'KAN-23',
    githubRepo: 'Safturento/Recipes',
    jiraSite: 'https://safturento.atlassian.net',
    userMessage: undefined,
  });
  expect(a).toBe(b);
});
```

- [ ] **Step 2b: Run to confirm fail**

Run: `npm run test --workspace=crew-cli -- --run builders`
Expected: FAIL — `userMessage` not in `BuildTicketPromptOptions`.

- [ ] **Step 2c: Add the slot to `ticket.md`**

Edit `packages/cli/src/lib/prompts/templates/ticket.md`. Replace the first two lines:

```markdown
You are running unattended on a fresh git worktree to implement Jira ticket {{key}} end-to-end. The repo's `CLAUDE.md` is your authoritative project guide; read it before doing anything else.

## Skills
```

with:

```markdown
You are running unattended on a fresh git worktree to implement Jira ticket {{key}} end-to-end. The repo's `CLAUDE.md` is your authoritative project guide; read it before doing anything else.

{{userMessageBlock}}

## Skills
```

When `userMessageBlock` is empty, the resulting prompt has one extra blank line where the slot was — visually neutral.

- [ ] **Step 2d: Extend the builder**

Edit `packages/cli/src/lib/prompts/ticket.ts`. Add the `renderUserMessageBlock` import alongside the existing imports:

```ts
import { renderUserMessageBlock } from './user-message.js';
```

Add `userMessage?: string;` to `BuildTicketPromptOptions`:

```ts
export interface BuildTicketPromptOptions {
  key: string;
  githubRepo: string;
  jiraSite: string;
  visualTesting?: VisualTestingPromptOptions; // existing
  playwright?: PlaywrightPromptOptions; // existing
  brunoSmoke?: BrunoSmokePromptOptions; // existing
  discoveredSkillsBlock?: string; // existing
  userMessage?: string; // NEW
}
```

(Field name above mirrors the existing shape — preserve the actual existing fields verbatim; this snippet shows where the new one goes.)

In the `render('ticket', { ... })` call, add the new placeholder var:

```ts
return render('ticket', {
  key: opts.key,
  githubRepo: opts.githubRepo,
  jiraSite: opts.jiraSite,
  // ...existing placeholders...
  userMessageBlock: renderUserMessageBlock(opts.userMessage), // NEW
});
```

- [ ] **Step 2e: Update render.ts placeholder enforcement (if applicable)**

Run `grep -n "userMessageBlock\|playwrightBlock\|brunoSmokeBlock" packages/cli/src/lib/prompts/render.test.ts packages/cli/src/lib/prompts/render.ts` to find any registry of expected placeholders. If `render.ts` validates each template's vars against an allowlist, add `userMessageBlock`. If `render.ts` is the simple regex-based version (no allowlist) — confirmed at spec-write time — there's nothing to change here.

- [ ] **Step 2f: Run tests to confirm pass**

Run: `npm run test --workspace=crew-cli -- --run builders`
Expected: PASS — all three new tests green; existing snapshot tests should ALSO pass since `userMessageBlock` defaults to `''`.

If existing snapshots fail because the new blank line shifted them, re-run with `-u` to update: `npm run test --workspace=crew-cli -- --run builders -u`. Confirm the diff shows ONLY a blank line added between the opening sentence and `## Skills` — no other content moved.

- [ ] **Step 2g: Run lint + format + typecheck**

Run: `npm run lint && npm run format:check && npm run typecheck`
Expected: PASS.

- [ ] **Step 2h: Commit**

```bash
git add packages/cli/src/lib/prompts/ticket.ts \
        packages/cli/src/lib/prompts/builders.test.ts \
        packages/cli/src/lib/prompts/templates/ticket.md \
        packages/cli/src/lib/prompts/__snapshots__/

git commit -m "feat(CREW-resume): buildTicketPrompt accepts userMessage option

New optional userMessage option threads through to a {{userMessageBlock}}
placeholder slotted between ticket.md's opening line and ## Skills.
Rendered via the shared renderUserMessageBlock helper so the slot is
empty when the option is absent."
```

---

## Task 3: Add `-m "<message>"` flag to `crew run` + improve worktree-exists error

**Goal:** wire the new flag into the `crew run` command shell. Pass the value through to `buildTicketPrompt`. Improve the error message that `requireWorktreeAvailable` produces so users discover the new commands (`crew resume`, `crew restart --hard`).

**Files:**

- Modify: `packages/cli/src/commands/run.ts`
- Modify: `packages/cli/src/commands/run.test.ts`
- Modify: `packages/cli/src/lib/run/preconditions.ts`
- Modify: `packages/cli/src/lib/run/preconditions.test.ts`

- [ ] **Step 3a: Write failing test for the improved error**

Find the test in `packages/cli/src/lib/run/preconditions.test.ts` that covers `requireWorktreeAvailable` rejecting on existing path, and replace its assertion with the new message. Example:

```ts
it('throws a helpful error when the worktree already exists, naming the new commands', () => {
  expect(() => requireWorktreeAvailable(existingPath)).toThrow(/worktree already exists at .+/);
  expect(() => requireWorktreeAvailable(existingPath)).toThrow(/crew resume/);
  expect(() => requireWorktreeAvailable(existingPath)).toThrow(/crew restart --hard/);
});
```

- [ ] **Step 3b: Write failing test for `crew run -m`**

Add to `packages/cli/src/commands/run.test.ts` (or wherever `runCommand` is unit-tested — probably builders.test or the prompt-assembly seam). The test should confirm that when `crew run` is invoked with `-m "msg"`, the ticket prompt that gets built contains the message. Use the unit-level seam if direct CLI invocation is awkward; e.g. test that the prompt-build inputs include `userMessage: '<msg>'`.

If the existing test surface for `run.ts` doesn't expose a clean seam, add an assertion to the integration-style test that snapshots the spawned-claude prompt.

- [ ] **Step 3c: Run to confirm fail**

Run: `npm run test --workspace=crew-cli -- --run run preconditions`
Expected: FAIL — error message doesn't include the new commands; `-m` flag isn't recognized.

- [ ] **Step 3d: Update the error message**

Edit `packages/cli/src/lib/run/preconditions.ts`. Replace the body of `requireWorktreeAvailable`:

```ts
export function requireWorktreeAvailable(path: string): void {
  if (existsSync(path)) {
    throw new Error(
      `worktree already exists at ${path}\n` +
        `   • To continue an interrupted run:    crew resume <KEY>\n` +
        `   • To wipe state and start fresh:    crew restart <KEY> --hard\n` +
        `     (or, manually:                    crew reset <KEY> --hard && crew run <KEY>)`,
    );
  }
}
```

(Preserve the surrounding imports / function signature exactly; only the throw message changes.)

- [ ] **Step 3e: Add the `-m` flag to `crew run`**

Edit `packages/cli/src/commands/run.ts`. In the `Command('run')` builder, add `.option('-m, --message <message>', '...')`:

```ts
export const runCommand = new Command('run')
  // ...existing description, args, options...
  .option('--skip-docker', 'skip the per-worktree docker bringup')
  .option(
    '-m, --message <message>',
    'additional context to include in the ticket prompt (e.g. -m "focus on lib/x")',
  )
  .action(async (key: string, opts: RunOptions) => {
    // ...existing body...
  });
```

Extend the `RunOptions` interface (search for it in the file; add `message?: string;`):

```ts
interface RunOptions {
  skipDocker?: boolean;
  message?: string; // NEW
}
```

In the `buildTicketPrompt({ ... })` call, pass through:

```ts
const prompt = buildTicketPrompt({
  key,
  githubRepo: config.github.repo,
  jiraSite: config.jira.site,
  // ...existing fields...
  userMessage: opts.message, // NEW
});
```

- [ ] **Step 3f: Run tests to confirm pass**

Run: `npm run test --workspace=crew-cli -- --run run preconditions`
Expected: PASS — both new tests green; existing run/preconditions tests still pass.

- [ ] **Step 3g: Run lint + format + typecheck**

Run: `npm run lint && npm run format:check && npm run typecheck`
Expected: PASS.

- [ ] **Step 3h: Commit**

```bash
git add packages/cli/src/commands/run.ts \
        packages/cli/src/commands/run.test.ts \
        packages/cli/src/lib/run/preconditions.ts \
        packages/cli/src/lib/run/preconditions.test.ts

git commit -m "feat(CREW-resume): crew run -m flag + improved worktree-exists error

- crew run now accepts -m '<msg>' / --message '<msg>'; the message is
  passed to buildTicketPrompt as userMessage and rendered into ticket.md
  via the shared user-message partial.
- requireWorktreeAvailable's error now points users at crew resume and
  crew restart --hard rather than telling them to git worktree remove
  manually."
```

---

## Task 4: Add `message` mode to `loadFeedback`; drop `stdin`

**Goal:** extend fix-pr's feedback-source abstraction with a fourth mode (`message`) that returns the user-supplied string verbatim. Drop the `stdin` mode and its `readStreamToString` helper. The fix-pr.md template is unchanged — feedback content still flows through `{{feedback}}`.

**Files:**

- Modify: `packages/cli/src/commands/fix-pr.ts`
- Modify: `packages/cli/src/commands/fix-pr.test.ts`

- [ ] **Step 4a: Write failing tests**

In `packages/cli/src/commands/fix-pr.test.ts`, add to whatever `describe('loadFeedback', ...)` block exists (or create one):

```ts
import { loadFeedback } from './fix-pr.js';

describe('loadFeedback — message mode', () => {
  it('returns the message as feedback verbatim', async () => {
    const result = await loadFeedback({
      key: 'KAN-1',
      mode: { kind: 'message', message: 'hello world' },
    });
    expect(result.feedback).toBe('hello world');
    expect(result.source).toBe('inline message');
  });

  it('preserves multi-line content', async () => {
    const msg = 'line one\nline two\n  - bullet';
    const result = await loadFeedback({
      key: 'KAN-1',
      mode: { kind: 'message', message: msg },
    });
    expect(result.feedback).toBe(msg);
  });

  it('throws on empty message', async () => {
    await expect(
      loadFeedback({ key: 'KAN-1', mode: { kind: 'message', message: '' } }),
    ).rejects.toThrow(/empty/i);
  });
});

describe('loadFeedback — stdin mode removed', () => {
  it('does not have a stdin kind in FeedbackMode', () => {
    // Compile-time guard via type narrowing; this test passes when the
    // 'stdin' literal is no longer assignable to FeedbackMode['kind'].
    type Kind = FeedbackMode['kind'];
    const valid: Kind[] = ['pr', 'file', 'message'];
    expect(valid).toContain('message');
    expect(valid as string[]).not.toContain('stdin');
  });
});
```

(`FeedbackMode` is exported from `fix-pr.ts`; import it at the top of the test file.)

- [ ] **Step 4b: Run to confirm fail**

Run: `npm run test --workspace=crew-cli -- --run fix-pr`
Expected: FAIL — `'message'` not in FeedbackMode.

- [ ] **Step 4c: Update `FeedbackMode` and `loadFeedback`**

Edit `packages/cli/src/commands/fix-pr.ts`:

Replace `FeedbackMode`:

```ts
export type FeedbackMode =
  | { kind: 'pr' }
  | { kind: 'file'; path: string }
  | { kind: 'message'; message: string };
```

In `loadFeedback`, drop the `'stdin'` branch and the `Readable`/`stdin` plumbing. Add the `'message'` branch:

```ts
export async function loadFeedback(opts: LoadFeedbackOptions): Promise<LoadedFeedback> {
  if (opts.mode.kind === 'file') {
    const path = opts.mode.path;
    if (!existsSync(path)) {
      throw new Error(`feedback file not found: ${path}`);
    }
    return { feedback: readFileSync(path, 'utf8'), source: `file: ${path}` };
  }

  if (opts.mode.kind === 'message') {
    const msg = opts.mode.message;
    if (msg.trim().length === 0) {
      throw new Error('empty message provided to -m');
    }
    return { feedback: msg, source: 'inline message' };
  }

  // 'pr' kind — existing logic unchanged
  const branch = opts.branch ?? opts.key;
  const pr = await getPrForBranch(branch, 'open');
  if (!pr) {
    throw new Error(
      `no open PR found on branch ${branch}. Open one first or use --from-file or -m '<msg>'.`,
    );
  }
  // ...rest unchanged...
}
```

Drop `LoadFeedbackDeps`, `readStreamToString`, and the `stdin` import. Drop the `Readable` import.

Update `FixPrFlags`:

```ts
interface FixPrFlags {
  fromPr?: boolean;
  fromFile?: string;
  message?: string; // replaces fromStdin
}
```

Update `selectMode`:

```ts
function selectMode(flags: FixPrFlags): FeedbackMode {
  const explicit = [
    flags.fromPr ? 'pr' : null,
    flags.fromFile !== undefined ? 'file' : null,
    flags.message !== undefined ? 'message' : null,
  ].filter(Boolean);
  if (explicit.length > 1) {
    throw new Error('--from-pr, --from-file, and -m are mutually exclusive');
  }
  if (flags.fromFile !== undefined) return { kind: 'file', path: flags.fromFile };
  if (flags.message !== undefined) return { kind: 'message', message: flags.message };
  return { kind: 'pr' };
}
```

Update the `fixPrCommand` builder:

```ts
export const fixPrCommand = new Command('fix-pr')
  .description("Resume the worktree's Claude Code session with review feedback")
  .argument('<key>', 'Jira ticket key (e.g. KAN-23)', (v) => v.toUpperCase())
  .option('--from-pr', 'Auto-pull feedback from the open PR for the branch (default)')
  .option('--from-file <path>', 'Read feedback from a file at <path>')
  .option(
    '-m, --message <message>',
    'inline feedback message (e.g. -m "the test on line 42 is failing")',
  )
  .action(async (key: string, flags: FixPrFlags) => {
    await runFixPr(key, flags);
  });
```

- [ ] **Step 4d: Run tests to confirm pass**

Run: `npm run test --workspace=crew-cli -- --run fix-pr`
Expected: PASS — new tests green; existing tests for pr/file modes still pass; tests that referenced `--from-stdin` / `fromStdin` / `'stdin'` are deleted or migrated.

If old `--from-stdin` tests still exist, delete them (they test removed functionality).

- [ ] **Step 4e: Run lint + format + typecheck**

Run: `npm run lint && npm run format:check && npm run typecheck`
Expected: PASS.

- [ ] **Step 4f: Commit**

```bash
git add packages/cli/src/commands/fix-pr.ts \
        packages/cli/src/commands/fix-pr.test.ts

git commit -m "feat(CREW-resume): fix-pr -m flag, drop --from-stdin

- New 'message' mode in FeedbackMode + loadFeedback. Returns the user's
  -m '<msg>' string verbatim with source 'inline message'.
- Drops the 'stdin' mode, --from-stdin flag, readStreamToString helper,
  and Readable/stdin plumbing. fix-pr.md is unchanged — message content
  flows through the existing {{feedback}} slot.
- selectMode and the no-PR error message updated to reference -m."
```

---

## Task 5: `deleteSessionsForWorktree` helper

**Goal:** introduce a small helper that deletes `.jsonl` transcript files under `~/.claude/projects/<encoded-worktree>/`. Used by `crew reset` (default mode) and indirectly by `crew restart`.

**Files:**

- Create: `packages/cli/src/lib/sessions/cleanup.ts`
- Create: `packages/cli/src/lib/sessions/cleanup.test.ts`
- Modify: `packages/cli/src/lib/sessions/index.ts` (re-export)

- [ ] **Step 5a: Write failing tests**

Create `packages/cli/src/lib/sessions/cleanup.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { encodeWorktreeProjectPath } from './index.js';
import { deleteSessionsForWorktree } from './cleanup.js';

describe('deleteSessionsForWorktree', () => {
  let projectsRoot: string;
  let worktree: string;

  beforeEach(() => {
    projectsRoot = join(tmpdir(), `crew-cleanup-test-${process.pid}-${Date.now()}`);
    worktree = '/some/worktree';
    mkdirSync(projectsRoot, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(projectsRoot)) rmSync(projectsRoot, { recursive: true, force: true });
  });

  function projectDir(): string {
    return join(projectsRoot, encodeWorktreeProjectPath(worktree));
  }

  it('returns 0 and does not error when the project dir does not exist', () => {
    const result = deleteSessionsForWorktree({ worktree, projectsRoot });
    expect(result.deletedCount).toBe(0);
    expect(result.dirExisted).toBe(false);
  });

  it('returns 0 when the project dir exists but has no .jsonl files', () => {
    mkdirSync(projectDir(), { recursive: true });
    writeFileSync(join(projectDir(), 'README.txt'), 'not a transcript');
    const result = deleteSessionsForWorktree({ worktree, projectsRoot });
    expect(result.deletedCount).toBe(0);
    expect(result.dirExisted).toBe(true);
    expect(existsSync(join(projectDir(), 'README.txt'))).toBe(true); // non-jsonl preserved
  });

  it('deletes every .jsonl file and returns the count', () => {
    mkdirSync(projectDir(), { recursive: true });
    writeFileSync(join(projectDir(), 'aaa.jsonl'), '{}');
    writeFileSync(join(projectDir(), 'bbb.jsonl'), '{}');
    writeFileSync(join(projectDir(), 'ccc.jsonl'), '{}');
    writeFileSync(join(projectDir(), 'README.txt'), 'keep me');

    const result = deleteSessionsForWorktree({ worktree, projectsRoot });
    expect(result.deletedCount).toBe(3);
    expect(result.dirExisted).toBe(true);
    expect(readdirSync(projectDir())).toEqual(['README.txt']);
  });
});
```

- [ ] **Step 5b: Run to confirm fail**

Run: `npm run test --workspace=crew-cli -- --run cleanup`
Expected: FAIL — `Cannot find module './cleanup.js'`.

- [ ] **Step 5c: Implement the helper**

Create `packages/cli/src/lib/sessions/cleanup.ts`:

```ts
import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { encodeWorktreeProjectPath } from './index.js';

const DEFAULT_PROJECTS_ROOT = join(homedir(), '.claude', 'projects');

export interface DeleteSessionsOptions {
  worktree: string;
  /** Override `~/.claude/projects/` for testing. */
  projectsRoot?: string;
}

export interface DeleteSessionsResult {
  /** Number of `.jsonl` files removed. 0 if dir didn't exist. */
  deletedCount: number;
  /** Whether the project dir existed before deletion. */
  dirExisted: boolean;
}

/**
 * Delete every `.jsonl` transcript under
 * `~/.claude/projects/<encoded-worktree>/`. Non-`.jsonl` files (e.g. a
 * `README` an operator dropped in) are preserved. Idempotent — returns
 * dirExisted: false when there's nothing to do.
 */
export function deleteSessionsForWorktree(opts: DeleteSessionsOptions): DeleteSessionsResult {
  const root = opts.projectsRoot ?? DEFAULT_PROJECTS_ROOT;
  const dir = join(root, encodeWorktreeProjectPath(opts.worktree));

  if (!existsSync(dir)) {
    return { deletedCount: 0, dirExisted: false };
  }

  let deletedCount = 0;
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.jsonl')) continue;
    unlinkSync(join(dir, entry));
    deletedCount += 1;
  }
  return { deletedCount, dirExisted: true };
}
```

- [ ] **Step 5d: Re-export from `lib/sessions/index.ts`**

Edit `packages/cli/src/lib/sessions/index.ts`. Add at the top with other re-exports:

```ts
export * from './cleanup.js';
```

- [ ] **Step 5e: Run tests to confirm pass**

Run: `npm run test --workspace=crew-cli -- --run cleanup`
Expected: PASS — all 3 tests green.

- [ ] **Step 5f: Run lint + format + typecheck**

Run: `npm run lint && npm run format:check && npm run typecheck`
Expected: PASS.

- [ ] **Step 5g: Commit**

```bash
git add packages/cli/src/lib/sessions/cleanup.ts \
        packages/cli/src/lib/sessions/cleanup.test.ts \
        packages/cli/src/lib/sessions/index.ts

git commit -m "feat(CREW-resume): deleteSessionsForWorktree helper

Removes every *.jsonl transcript under
~/.claude/projects/<encoded-worktree>/. Non-jsonl files preserved.
Idempotent; returns { deletedCount, dirExisted }."
```

---

## Task 6: `removeWorktreeAndBranch` helper

**Goal:** introduce the helper used by `crew reset --hard` to remove a worktree directory + branch. Both operations are idempotent — missing artifacts log as "(already removed)" without erroring.

**Files:**

- Create: `packages/cli/src/lib/run/cleanup-worktree.ts`
- Create: `packages/cli/src/lib/run/cleanup-worktree.test.ts`
- Modify: `packages/cli/src/lib/run/index.ts` (re-export, if such a barrel exists; otherwise skip)

- [ ] **Step 6a: Write failing tests**

Create `packages/cli/src/lib/run/cleanup-worktree.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

vi.mock('execa', () => ({ execa: vi.fn() }));
import { execa } from 'execa';
import { removeWorktreeAndBranch } from './cleanup-worktree.js';

const execaMock = vi.mocked(execa);

describe('removeWorktreeAndBranch', () => {
  let worktree: string;
  const key = 'KAN-1';

  beforeEach(() => {
    worktree = join(tmpdir(), `crew-cleanup-wt-${process.pid}-${Date.now()}`);
    execaMock.mockReset();
  });

  afterEach(() => {
    if (existsSync(worktree)) rmSync(worktree, { recursive: true, force: true });
  });

  function fakeOk(stdout = ''): unknown {
    return Promise.resolve({ exitCode: 0, stdout, stderr: '' });
  }

  function fakeFail(stderr: string): unknown {
    return Promise.resolve({ exitCode: 128, stdout: '', stderr });
  }

  it('reports already-removed when worktree path does not exist', async () => {
    execaMock.mockReturnValueOnce(fakeOk() as ReturnType<typeof execa>); // git branch -D
    const result = await removeWorktreeAndBranch({ worktree, key });
    expect(result.worktreeRemoved).toBe(false);
    expect(execaMock).not.toHaveBeenCalledWith(
      'git',
      expect.arrayContaining(['worktree', 'remove']),
      expect.any(Object),
    );
  });

  it('runs git worktree remove when the path exists', async () => {
    mkdirSync(worktree, { recursive: true });
    writeFileSync(join(worktree, 'sentinel'), '');
    execaMock
      .mockReturnValueOnce(fakeOk() as ReturnType<typeof execa>) // worktree remove
      .mockReturnValueOnce(fakeOk() as ReturnType<typeof execa>); // branch -D

    const result = await removeWorktreeAndBranch({ worktree, key });
    expect(result.worktreeRemoved).toBe(true);
    expect(result.branchRemoved).toBe(true);
    expect(execaMock).toHaveBeenCalledWith(
      'git',
      ['worktree', 'remove', worktree, '--force'],
      expect.any(Object),
    );
    expect(execaMock).toHaveBeenCalledWith('git', ['branch', '-D', key], expect.any(Object));
  });

  it('treats a missing branch as already-removed (rc=128)', async () => {
    mkdirSync(worktree, { recursive: true });
    execaMock
      .mockReturnValueOnce(fakeOk() as ReturnType<typeof execa>)
      .mockReturnValueOnce(
        fakeFail("error: branch 'KAN-1' not found.") as ReturnType<typeof execa>,
      );

    const result = await removeWorktreeAndBranch({ worktree, key });
    expect(result.worktreeRemoved).toBe(true);
    expect(result.branchRemoved).toBe(false);
  });

  it('treats a worktree-remove failure (rc=128) as already-removed', async () => {
    mkdirSync(worktree, { recursive: true });
    execaMock
      .mockReturnValueOnce(fakeFail('fatal: ... is not a working tree') as ReturnType<typeof execa>)
      .mockReturnValueOnce(fakeOk() as ReturnType<typeof execa>);

    const result = await removeWorktreeAndBranch({ worktree, key });
    expect(result.worktreeRemoved).toBe(false);
    expect(result.branchRemoved).toBe(true);
  });
});
```

- [ ] **Step 6b: Run to confirm fail**

Run: `npm run test --workspace=crew-cli -- --run cleanup-worktree`
Expected: FAIL — `Cannot find module './cleanup-worktree.js'`.

- [ ] **Step 6c: Implement the helper**

Create `packages/cli/src/lib/run/cleanup-worktree.ts`:

```ts
import { execa } from 'execa';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';

export interface RemoveWorktreeOptions {
  worktree: string;
  key: string;
}

export interface RemoveWorktreeResult {
  /** True if `git worktree remove` ran and succeeded. False if path didn't exist or removal returned non-zero. */
  worktreeRemoved: boolean;
  /** True if `git branch -D` ran and succeeded. False if branch didn't exist. */
  branchRemoved: boolean;
}

/**
 * Idempotent `git worktree remove` + `git branch -D`. Treats either
 * artifact's absence as "already removed" rather than an error — so
 * `crew reset --hard` can run after a partial manual cleanup without
 * blowing up.
 *
 * git is invoked from the *parent* of the worktree path. `dirname`
 * returns a directory that should always be inside the source repo
 * (worktree paths from `worktreePathFor` are siblings of the source).
 */
export async function removeWorktreeAndBranch(
  opts: RemoveWorktreeOptions,
): Promise<RemoveWorktreeResult> {
  const cwd = dirname(opts.worktree);

  let worktreeRemoved = false;
  if (existsSync(opts.worktree)) {
    const result = await execa('git', ['worktree', 'remove', opts.worktree, '--force'], {
      cwd,
      reject: false,
    });
    worktreeRemoved = result.exitCode === 0;
  }

  // Try branch deletion regardless of worktree state — branch can outlive the worktree dir.
  const branchResult = await execa('git', ['branch', '-D', opts.key], {
    cwd,
    reject: false,
  });
  const branchRemoved = branchResult.exitCode === 0;

  return { worktreeRemoved, branchRemoved };
}
```

- [ ] **Step 6d: Run tests to confirm pass**

Run: `npm run test --workspace=crew-cli -- --run cleanup-worktree`
Expected: PASS — all 4 tests green.

- [ ] **Step 6e: Run lint + format + typecheck**

Run: `npm run lint && npm run format:check && npm run typecheck`
Expected: PASS.

- [ ] **Step 6f: Commit**

```bash
git add packages/cli/src/lib/run/cleanup-worktree.ts \
        packages/cli/src/lib/run/cleanup-worktree.test.ts

git commit -m "feat(CREW-resume): removeWorktreeAndBranch helper

Idempotent 'git worktree remove --force' + 'git branch -D'. Either
artifact's absence is treated as already-removed (no error) so
crew reset --hard works after partial manual cleanup. Returns
{ worktreeRemoved, branchRemoved } so callers can report what
actually happened."
```

---

## Task 7: `buildResumePrompt` builder + `resume.md` template

**Goal:** introduce the new builder and template used by `crew resume` when a session exists. Reuses `fix-pr-playwright.md` and `fix-pr-bruno-smoke.md` fragments — their "stack up, browsers installed" framing fits the resume case.

**Files:**

- Create: `packages/cli/src/lib/prompts/resume.ts`
- Create: `packages/cli/src/lib/prompts/resume.test.ts` (or extend `builders.test.ts`)
- Create: `packages/cli/src/lib/prompts/templates/resume.md`

- [ ] **Step 7a: Write failing tests**

Create `packages/cli/src/lib/prompts/resume.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildResumePrompt } from './resume.js';

describe('buildResumePrompt', () => {
  it('renders the baseline resume frame', () => {
    const prompt = buildResumePrompt({
      key: 'KAN-23',
      branch: 'KAN-23',
      commitsAhead: 2,
      uncommittedCount: 1,
    });
    expect(prompt).toContain("You're being resumed on KAN-23");
    expect(prompt).toContain('Branch: KAN-23');
    expect(prompt).toContain('2 commits ahead');
    expect(prompt).toContain('1 uncommitted files');
  });

  it('omits the user-message block when userMessage is undefined', () => {
    const prompt = buildResumePrompt({
      key: 'KAN-23',
      branch: 'KAN-23',
      commitsAhead: 0,
      uncommittedCount: 0,
    });
    expect(prompt).not.toContain('Additional context from the user');
  });

  it('includes the user-message block when userMessage is provided', () => {
    const prompt = buildResumePrompt({
      key: 'KAN-23',
      branch: 'KAN-23',
      commitsAhead: 0,
      uncommittedCount: 0,
      userMessage: 'stop trying X, do Y instead',
    });
    expect(prompt).toContain('Additional context from the user');
    expect(prompt).toContain('stop trying X, do Y instead');
  });

  it('renders the playwright fragment when playwright is provided', () => {
    const prompt = buildResumePrompt({
      key: 'KAN-23',
      branch: 'KAN-23',
      commitsAhead: 0,
      uncommittedCount: 0,
      playwright: { appUrl: 'https://localhost:18443' },
    });
    expect(prompt).toContain('https://localhost:18443');
    // Reuses fix-pr-playwright.md content
    expect(prompt).toContain('Do not run `npm run docker:up`');
  });

  it('renders the bruno-smoke fragment when brunoSmoke is provided', () => {
    const prompt = buildResumePrompt({
      key: 'KAN-23',
      branch: 'KAN-23',
      commitsAhead: 0,
      uncommittedCount: 0,
      brunoSmoke: {
        baseUrl: 'http://localhost:7773',
        envName: 'recipes-kan-23',
        collectionDir: 'bruno',
      },
    });
    expect(prompt).toContain('recipes-kan-23');
  });
});
```

- [ ] **Step 7b: Run to confirm fail**

Run: `npm run test --workspace=crew-cli -- --run resume`
Expected: FAIL — `Cannot find module './resume.js'`.

- [ ] **Step 7c: Create the resume.md template**

Create `packages/cli/src/lib/prompts/templates/resume.md`:

```markdown
You're being resumed on {{key}} after an interruption.

{{userMessageBlock}}

## Worktree state

- Branch: {{branch}}
- {{commitsAhead}} commits ahead of origin/main
- {{uncommittedCount}} uncommitted files (preserved as-is from before the interruption)

{{playwrightBlock}}{{brunoSmokeBlock}}

## What to do

Reassess where you left off — check your last actions in this conversation, the worktree's git state, and any uncommitted changes. Then continue toward closing the ticket. If the user-supplied context above changes your direction, factor it in before resuming.
{{discoveredSkillsBlock}}
```

- [ ] **Step 7d: Implement the builder**

Create `packages/cli/src/lib/prompts/resume.ts`:

```ts
import { render } from './render.js';
import { renderUserMessageBlock } from './user-message.js';
import type { PlaywrightFixPrOptions } from './fix-pr.js';
import type { BrunoSmokePromptOptions } from './ticket.js';

export interface BuildResumePromptOptions {
  key: string;
  branch: string;
  commitsAhead: number;
  uncommittedCount: number;
  userMessage?: string;
  playwright?: PlaywrightFixPrOptions;
  brunoSmoke?: BrunoSmokePromptOptions;
  discoveredSkillsBlock?: string;
}

export function buildResumePrompt(opts: BuildResumePromptOptions): string {
  return render('resume', {
    key: opts.key,
    branch: opts.branch,
    commitsAhead: String(opts.commitsAhead),
    uncommittedCount: String(opts.uncommittedCount),
    userMessageBlock: renderUserMessageBlock(opts.userMessage),
    playwrightBlock: buildPlaywrightBlock(opts.playwright),
    brunoSmokeBlock: buildBrunoSmokeBlock(opts.brunoSmoke),
    discoveredSkillsBlock: opts.discoveredSkillsBlock ?? '',
  });
}

function buildPlaywrightBlock(pw: PlaywrightFixPrOptions | undefined): string {
  if (!pw) return '';
  const authoredClause = pw.authored
    ? `\n- This project authors Playwright tests under **${pw.authored.testsDir}/** runnable via \`${pw.authored.testCommand}\`. If your fix touches a user-facing flow with regression value, ensure the relevant tests pass before pushing.`
    : '';
  return render('fix-pr-playwright', {
    appUrl: pw.appUrl,
    authoredClause,
  });
}

function buildBrunoSmokeBlock(bs: BrunoSmokePromptOptions | undefined): string {
  if (!bs) return '';
  return render('fix-pr-bruno-smoke', {
    baseUrl: bs.baseUrl,
    envName: bs.envName,
    collectionDir: bs.collectionDir,
  });
}
```

(`PlaywrightFixPrOptions` is already exported from `fix-pr.ts`; `BrunoSmokePromptOptions` from `ticket.ts`. Reuse them rather than redefining.)

- [ ] **Step 7e: Re-export from prompts barrel (if applicable)**

If `packages/cli/src/lib/prompts/index.ts` re-exports the existing builders, add:

```ts
export { buildResumePrompt, type BuildResumePromptOptions } from './resume.js';
```

- [ ] **Step 7f: Run tests to confirm pass**

Run: `npm run test --workspace=crew-cli -- --run resume`
Expected: PASS — all 5 tests green.

- [ ] **Step 7g: Run lint + format + typecheck**

Run: `npm run lint && npm run format:check && npm run typecheck`
Expected: PASS.

- [ ] **Step 7h: Commit**

```bash
git add packages/cli/src/lib/prompts/resume.ts \
        packages/cli/src/lib/prompts/resume.test.ts \
        packages/cli/src/lib/prompts/templates/resume.md \
        packages/cli/src/lib/prompts/index.ts

git commit -m "feat(CREW-resume): buildResumePrompt + resume.md template

Reuses fix-pr-playwright.md and fix-pr-bruno-smoke.md fragments — their
'stack up, browsers installed, do not duplicate' framing fits resume
verbatim. New template slots in worktree-state context (branch, commits
ahead, uncommitted file count) plus the shared {{userMessageBlock}}."
```

---

## Task 8: Worktree state-discovery helper

**Goal:** small helper that reads `branch`, `commitsAhead`, `uncommittedCount` from a worktree path. Used by `crew resume` to feed the `buildResumePrompt` worktree-state block. Also feeds the on-screen status print before the agent spawns.

**Files:**

- Create: `packages/cli/src/lib/run/worktree-state.ts`
- Create: `packages/cli/src/lib/run/worktree-state.test.ts`

- [ ] **Step 8a: Write failing tests**

Create `packages/cli/src/lib/run/worktree-state.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('execa', () => ({ execa: vi.fn() }));
import { execa } from 'execa';
import { readWorktreeState } from './worktree-state.js';

const execaMock = vi.mocked(execa);

describe('readWorktreeState', () => {
  beforeEach(() => execaMock.mockReset());
  afterEach(() => vi.restoreAllMocks());

  function ok(stdout: string): unknown {
    return Promise.resolve({ exitCode: 0, stdout, stderr: '' });
  }

  it('returns branch, commitsAhead, uncommittedCount from git output', async () => {
    execaMock
      .mockReturnValueOnce(ok('KAN-23\n') as ReturnType<typeof execa>) // branch
      .mockReturnValueOnce(ok('3\n') as ReturnType<typeof execa>) // rev-list count
      .mockReturnValueOnce(ok(' M file.ts\n?? new.ts\n M other.ts\n') as ReturnType<typeof execa>); // status --porcelain

    const state = await readWorktreeState('/worktree');
    expect(state.branch).toBe('KAN-23');
    expect(state.commitsAhead).toBe(3);
    expect(state.uncommittedCount).toBe(3);
  });

  it('treats blank rev-list output as 0 (branch matches origin/main)', async () => {
    execaMock
      .mockReturnValueOnce(ok('KAN-23\n') as ReturnType<typeof execa>)
      .mockReturnValueOnce(ok('0\n') as ReturnType<typeof execa>)
      .mockReturnValueOnce(ok('') as ReturnType<typeof execa>);

    const state = await readWorktreeState('/worktree');
    expect(state.commitsAhead).toBe(0);
    expect(state.uncommittedCount).toBe(0);
  });
});
```

- [ ] **Step 8b: Run to confirm fail**

Run: `npm run test --workspace=crew-cli -- --run worktree-state`
Expected: FAIL — `Cannot find module './worktree-state.js'`.

- [ ] **Step 8c: Implement the helper**

Create `packages/cli/src/lib/run/worktree-state.ts`:

```ts
import { execa } from 'execa';

export interface WorktreeState {
  branch: string;
  commitsAhead: number;
  uncommittedCount: number;
}

/**
 * Read git state from a worktree: current branch, commits ahead of
 * origin/main, count of uncommitted files (modified + untracked).
 *
 * Assumes `git fetch origin` has already run — the caller is
 * responsible for refreshing refs before this is meaningful. Each
 * subprocess uses `reject: false` so a missing remote ref resolves to
 * 0 rather than throwing.
 */
export async function readWorktreeState(worktree: string): Promise<WorktreeState> {
  const branchResult = await execa('git', ['branch', '--show-current'], {
    cwd: worktree,
    reject: false,
  });
  const branch = branchResult.stdout.trim();

  const aheadResult = await execa('git', ['rev-list', '--count', 'origin/main..HEAD'], {
    cwd: worktree,
    reject: false,
  });
  const commitsAhead = Number.parseInt(aheadResult.stdout.trim() || '0', 10);

  const statusResult = await execa('git', ['status', '--porcelain'], {
    cwd: worktree,
    reject: false,
  });
  const uncommittedCount = statusResult.stdout.split('\n').filter((line) => line.length > 0).length;

  return {
    branch,
    commitsAhead: Number.isFinite(commitsAhead) ? commitsAhead : 0,
    uncommittedCount,
  };
}
```

- [ ] **Step 8d: Run tests to confirm pass**

Run: `npm run test --workspace=crew-cli -- --run worktree-state`
Expected: PASS.

- [ ] **Step 8e: Lint + typecheck + commit**

Run: `npm run lint && npm run format:check && npm run typecheck`
Expected: PASS.

```bash
git add packages/cli/src/lib/run/worktree-state.ts \
        packages/cli/src/lib/run/worktree-state.test.ts

git commit -m "feat(CREW-resume): readWorktreeState helper

Returns { branch, commitsAhead, uncommittedCount } for a worktree.
Uses 'git branch --show-current', 'git rev-list --count
origin/main..HEAD', and 'git status --porcelain'. Each subprocess uses
reject: false so a missing remote ref resolves to 0 rather than
throwing. Caller is responsible for 'git fetch origin' beforehand."
```

---

## Task 9: `crew reset` command

**Goal:** implement `crew reset KAN-X` (sessions only) and `crew reset KAN-X --hard` (sessions + worktree + branch). No agent spawn.

**Files:**

- Create: `packages/cli/src/commands/reset.ts`
- Create: `packages/cli/src/commands/reset.test.ts`
- Modify: `packages/cli/src/index.ts` (register the command)

- [ ] **Step 9a: Write failing tests**

Create `packages/cli/src/commands/reset.test.ts` — a unit test of `runReset` (the function the Command's `.action` calls). Mock the helpers:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/sessions/cleanup.js', () => ({
  deleteSessionsForWorktree: vi.fn(),
}));
vi.mock('../lib/run/cleanup-worktree.js', () => ({
  removeWorktreeAndBranch: vi.fn(),
}));
vi.mock('crew-shared', async () => {
  const actual = await vi.importActual<typeof import('crew-shared')>('crew-shared');
  return {
    ...actual,
    discoverProjectConfig: vi.fn(async () => ({
      name: 'test',
      repo_path: '/repo',
      // ...minimal fields the runReset needs (none beyond repo_path)
    })),
  };
});

import { deleteSessionsForWorktree } from '../lib/sessions/cleanup.js';
import { removeWorktreeAndBranch } from '../lib/run/cleanup-worktree.js';
import { runReset } from './reset.js';

const sessionsMock = vi.mocked(deleteSessionsForWorktree);
const worktreeMock = vi.mocked(removeWorktreeAndBranch);

describe('runReset', () => {
  let logs: string[];
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logs = [];
    logSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      logs.push(String(chunk));
      return true;
    });
    sessionsMock.mockReset();
    worktreeMock.mockReset();
  });

  afterEach(() => logSpy.mockRestore());

  it('default: deletes sessions only and reports the count', async () => {
    sessionsMock.mockReturnValue({ deletedCount: 3, dirExisted: true });

    await runReset('KAN-1', { hard: false });

    expect(sessionsMock).toHaveBeenCalledTimes(1);
    expect(worktreeMock).not.toHaveBeenCalled();
    expect(logs.join('')).toMatch(/3 session/);
  });

  it('default: handles "no sessions" gracefully', async () => {
    sessionsMock.mockReturnValue({ deletedCount: 0, dirExisted: false });
    await runReset('KAN-1', { hard: false });
    expect(logs.join('')).toMatch(/no sessions to delete/);
  });

  it('--hard: deletes sessions, worktree, and branch', async () => {
    sessionsMock.mockReturnValue({ deletedCount: 2, dirExisted: true });
    worktreeMock.mockResolvedValue({ worktreeRemoved: true, branchRemoved: true });

    await runReset('KAN-1', { hard: true });

    expect(sessionsMock).toHaveBeenCalledTimes(1);
    expect(worktreeMock).toHaveBeenCalledTimes(1);
    const out = logs.join('');
    expect(out).toMatch(/2 session/);
    expect(out).toMatch(/worktree removed/);
    expect(out).toMatch(/branch removed/);
  });

  it('--hard: reports already-removed for missing worktree', async () => {
    sessionsMock.mockReturnValue({ deletedCount: 0, dirExisted: false });
    worktreeMock.mockResolvedValue({ worktreeRemoved: false, branchRemoved: false });

    await runReset('KAN-1', { hard: true });

    const out = logs.join('');
    expect(out).toMatch(/already removed/);
  });
});
```

- [ ] **Step 9b: Run to confirm fail**

Run: `npm run test --workspace=crew-cli -- --run reset`
Expected: FAIL — `Cannot find module './reset.js'`.

- [ ] **Step 9c: Implement the command**

Create `packages/cli/src/commands/reset.ts`:

```ts
import { Command } from 'commander';
import pc from 'picocolors';
import { discoverProjectConfig } from 'crew-shared';
import { worktreePathFor } from '../lib/run/paths.js';
import { deleteSessionsForWorktree } from '../lib/sessions/cleanup.js';
import { removeWorktreeAndBranch } from '../lib/run/cleanup-worktree.js';

interface ResetOptions {
  hard?: boolean;
}

export async function runReset(key: string, opts: ResetOptions): Promise<void> {
  const config = await discoverProjectConfig(process.cwd());
  if (!config) {
    process.stderr.write(pc.red(`error: no crew project config found from ${process.cwd()}\n`));
    process.exit(1);
  }
  const worktree = worktreePathFor(config.repo_path, key);

  // Always: delete sessions.
  const sessions = deleteSessionsForWorktree({ worktree });
  if (!sessions.dirExisted) {
    process.stderr.write(pc.dim(`→ no sessions to delete (no project dir)\n`));
  } else {
    process.stderr.write(pc.dim(`→ deleted ${sessions.deletedCount} session file(s)\n`));
  }

  if (!opts.hard) return;

  // --hard: also remove worktree + branch.
  const { worktreeRemoved, branchRemoved } = await removeWorktreeAndBranch({
    worktree,
    key,
  });
  process.stderr.write(
    pc.dim(
      worktreeRemoved
        ? `→ worktree removed: ${worktree}\n`
        : `→ worktree already removed: ${worktree}\n`,
    ),
  );
  process.stderr.write(
    pc.dim(branchRemoved ? `→ branch removed: ${key}\n` : `→ branch already removed: ${key}\n`),
  );
}

export const resetCommand = new Command('reset')
  .description("Wipe state for a ticket's worktree (sessions only by default)")
  .argument('<key>', 'Jira ticket key (e.g. KAN-23)', (v) => v.toUpperCase())
  .option('--hard', 'also remove the worktree directory and the local branch')
  .action(async (key: string, opts: ResetOptions) => {
    await runReset(key, opts);
  });
```

- [ ] **Step 9d: Register the command**

Edit `packages/cli/src/index.ts`. Add the import and registration:

```ts
import { resetCommand } from './commands/reset.js';
// ...
program.addCommand(resetCommand);
```

(Place the line near the other `addCommand` calls.)

- [ ] **Step 9e: Run tests to confirm pass**

Run: `npm run test --workspace=crew-cli -- --run reset`
Expected: PASS — all 4 tests green.

- [ ] **Step 9f: Manual smoke (optional)**

```bash
npm run build --workspace=crew-cli
node packages/cli/dist/index.js reset KAN-99       # should report "no sessions to delete"
node packages/cli/dist/index.js reset KAN-99 --hard  # should report worktree + branch already removed
```

- [ ] **Step 9g: Lint + typecheck + commit**

Run: `npm run lint && npm run format:check && npm run typecheck`
Expected: PASS.

```bash
git add packages/cli/src/commands/reset.ts \
        packages/cli/src/commands/reset.test.ts \
        packages/cli/src/index.ts

git commit -m "feat(CREW-resume): crew reset command

Default: delete .jsonl sessions under ~/.claude/projects/<encoded>/.
Worktree, branch, and code state untouched.

--hard: also git worktree remove + git branch -D, idempotently. Used
by crew restart --hard internally and standalone for ticket abandonment."
```

---

## Task 10: `crew resume` command

**Goal:** the headline command. Resolves worktree, fetches origin, prepares the agent environment (idempotent docker bringup + Chromium install via `prepareAgentEnvironment({mode: 'resume'})`), then dispatches:

- Session exists → `claude --resume <id>` with `buildResumePrompt`.
- No session → fresh `claude` with `buildTicketPrompt` (announces "starting fresh in existing worktree").

**Files:**

- Create: `packages/cli/src/commands/resume.ts`
- Create: `packages/cli/src/commands/resume.test.ts`
- Modify: `packages/cli/src/index.ts` (register)

- [ ] **Step 10a: Write failing tests**

Create `packages/cli/src/commands/resume.test.ts`. Use the same mocking style as `reset.test.ts`. Cover:

```ts
// pseudocode of what to assert:

describe('runResume', () => {
  it('errors when worktree does not exist', async () => {
    // existsSync mock returns false → expect throw with /no worktree at .+; did you mean 'crew run/
  });

  it('happy path with session: spawns claude --resume with resume prompt', async () => {
    // existsSync true, findLatestSession returns {sessionId, transcriptPath},
    // prepareAgentEnvironment resolves with {resolvedAppUrl: ...},
    // expect spawnClaudeResume called with sessionId + buildResumePrompt content;
    // expect log line containing "Resuming KAN-X"
  });

  it('happy path with no session: spawns fresh claude with ticket prompt', async () => {
    // findLatestSession returns null,
    // expect spawnClaudeFresh (or whatever the fresh-spawn API is — see Task 10c) called,
    // expect log line containing "no prior session found; starting fresh in existing worktree"
  });

  it('passes -m message to the resume prompt builder', async () => {
    // userMessage flows through to buildResumePrompt's userMessage option
  });

  it('passes -m message to the ticket prompt builder when no session', async () => {
    // findLatestSession null + -m → buildTicketPrompt called with userMessage
  });
});
```

Write each test concretely with the mock setup style from `reset.test.ts`. The mocks needed:

- `node:fs` `existsSync` (via `vi.mock`)
- `crew-shared` `discoverProjectConfig`, `findLatestSession`
- `../lib/run/agent-environment.js` `prepareAgentEnvironment`
- `../lib/run/worktree-state.js` `readWorktreeState`
- `../lib/claude/spawn.js` `spawnClaudeResume` (and whatever fresh-spawn helper Task 10c introduces)
- `execa` for the `git fetch origin` call

- [ ] **Step 10b: Run to confirm fail**

Run: `npm run test --workspace=crew-cli -- --run resume`
Expected: FAIL — `Cannot find module './resume.js'`.

- [ ] **Step 10c: Decide the fresh-spawn seam**

`spawnClaudeResume` always passes `--resume <id>`. The no-session branch needs to spawn `claude` _without_ `--resume`. Two acceptable options — pick one and stick with it:

1. **Add `spawnClaudeFresh` to `lib/claude/spawn.ts`.** Signature mirrors `spawnClaudeResume` but without `sessionId`. Cleanest separation; both functions in the same module.
2. **Make `sessionId` optional on `spawnClaudeResume`.** When undefined, omit `--resume`. Smaller diff but the function name becomes a lie.

**Decision:** option 1. Add `spawnClaudeFresh`. The two functions share the same env / log / cwd / PATH plumbing — extract a private `buildBaseExecaOptions` helper if the duplication is non-trivial, but if the shared code is just 5 lines, copy-paste is fine.

- [ ] **Step 10d: Implement `spawnClaudeFresh`**

Edit `packages/cli/src/lib/claude/spawn.ts`. Add alongside `spawnClaudeResume`:

```ts
export interface SpawnClaudeFreshOptions {
  prompt: string;
  logFile: string;
  cwd: string;
  env?: NodeJS.ProcessEnv;
}

export function spawnClaudeFresh(opts: SpawnClaudeFreshOptions): ResultPromise {
  const sub = execa('claude', ['--dangerously-skip-permissions', '-p', opts.prompt], {
    cwd: opts.cwd,
    env: {
      ...process.env,
      ...(opts.env ?? {}),
      PATH: ensureLocalBinOnPath(process.env.PATH),
    },
  });
  const log = createWriteStream(opts.logFile);
  sub.stdout?.pipe(log);
  sub.stderr?.pipe(log);
  return sub;
}
```

(`ensureLocalBinOnPath` is already in this file from CREW-58.)

Also add a unit test in `spawn.test.ts` for `spawnClaudeFresh` mirroring the existing `spawnClaudeResume` env-passthrough test.

- [ ] **Step 10e: Implement `crew resume`**

Create `packages/cli/src/commands/resume.ts`:

```ts
import { Command } from 'commander';
import { execa } from 'execa';
import { existsSync } from 'node:fs';
import pc from 'picocolors';
import { discoverProjectConfig, findLatestSession } from 'crew-shared';
import { worktreePathFor } from '../lib/run/paths.js';
import { prepareAgentEnvironment } from '../lib/run/agent-environment.js';
import { readWorktreeState } from '../lib/run/worktree-state.js';
import { spawnClaudeResume, spawnClaudeFresh } from '../lib/claude/spawn.js';
import { buildResumePrompt } from '../lib/prompts/resume.js';
import { buildTicketPrompt } from '../lib/prompts/index.js';
import { discoverSkills, renderDiscoveredSkillsBlock } from '../lib/prompts/skills.js';
// Plus: imports for the playwright/bruno option-mapper helpers used in run.ts;
// reuse the same shape so resume's prompt has consistent fragment content.
// (Search run.ts for how `playwright` and `brunoSmoke` options are derived
// from projectConfig + dockerPorts; mirror that structure here.)

interface ResumeOptions {
  message?: string;
  skipDocker?: boolean;
}

export async function runResume(key: string, opts: ResumeOptions): Promise<void> {
  const config = await discoverProjectConfig(process.cwd());
  if (!config) {
    process.stderr.write(pc.red(`error: no crew project config found from ${process.cwd()}\n`));
    process.exit(1);
  }
  const worktree = worktreePathFor(config.repo_path, key);

  if (!existsSync(worktree)) {
    process.stderr.write(
      pc.red(`error: no worktree at ${worktree}; did you mean 'crew run ${key}'?\n`),
    );
    process.exit(1);
  }

  process.stderr.write(pc.dim(`→ git fetch origin (refresh refs)\n`));
  await execa('git', ['fetch', 'origin'], { cwd: worktree, reject: false });

  const state = await readWorktreeState(worktree);
  process.stderr.write(
    pc.dim(
      `→ worktree state: ${state.branch} (${state.commitsAhead} commits ahead, ${state.uncommittedCount} uncommitted)\n`,
    ),
  );

  // dockerPorts source mirrors fix-pr.ts (read-only from existing .env);
  // reuse readDockerPortsFromEnvFile from fix-pr.ts (export it from there
  // first if it isn't already, OR lift it into lib/docker/env.ts as a
  // sibling of writeDockerEnv — implementer's call).
  const dockerPorts = needsDockerPorts(config) ? readDockerPortsFromEnvFile(worktree) : undefined;

  const env = await prepareAgentEnvironment({
    config,
    worktree,
    key,
    env: process.env,
    dockerPorts,
    mode: 'resume',
    skipDocker: opts.skipDocker,
  });

  const session = findLatestSession({ worktree });
  const discoveredSkillsBlock = renderDiscoveredSkillsBlock(
    discoverSkills({ repoPath: config.repo_path }),
  );

  if (session) {
    const prompt = buildResumePrompt({
      key,
      branch: state.branch,
      commitsAhead: state.commitsAhead,
      uncommittedCount: state.uncommittedCount,
      userMessage: opts.message,
      playwright: playwrightOptsFor(config, env.resolvedAppUrl),
      brunoSmoke: brunoOptsFor(config, worktree, dockerPorts),
      discoveredSkillsBlock,
    });
    const logFile = `/tmp/crew-resume-${key}.log`;
    process.stderr.write(
      `→ Resuming session for ${key}\n  worktree: ${worktree}\n  session:  ${session.sessionId}\n  log:      ${logFile}\n\n`,
    );
    const sub = spawnClaudeResume({
      sessionId: session.sessionId,
      prompt,
      logFile,
      cwd: worktree,
      env: env.resolvedAppUrl ? { CREW_APP_URL: env.resolvedAppUrl } : undefined,
    });
    await wireSignalsAndWait(sub);
    return;
  }

  process.stderr.write(pc.dim('→ no prior session found; starting fresh in existing worktree\n'));
  const prompt = buildTicketPrompt({
    key,
    githubRepo: config.github.repo,
    jiraSite: config.jira.site,
    userMessage: opts.message,
    playwright: playwrightOptsFor(config, env.resolvedAppUrl),
    brunoSmoke: brunoOptsFor(config, worktree, dockerPorts),
    discoveredSkillsBlock,
  });
  const logFile = `/tmp/crew-resume-${key}.log`;
  process.stderr.write(
    `→ Spawning fresh agent for ${key}\n  worktree: ${worktree}\n  log:      ${logFile}\n\n`,
  );
  const sub = spawnClaudeFresh({
    prompt,
    logFile,
    cwd: worktree,
    env: env.resolvedAppUrl ? { CREW_APP_URL: env.resolvedAppUrl } : undefined,
  });
  await wireSignalsAndWait(sub);
}

// `wireSignalsAndWait`: factor out the SIGINT/SIGTERM handling currently
// in run.ts (search for `onSignal` / `process.on('SIGINT', ...)`). Lift
// it into a small helper so resume + run + restart all share one
// implementation. If lifting is too much for this task, inline a copy
// of the existing run.ts pattern; the followup commit can DRY them up.

// Helpers (playwrightOptsFor, brunoOptsFor, needsDockerPorts,
// readDockerPortsFromEnvFile): see run.ts and fix-pr.ts for the shape.
// These two commands already do the same option-derivation. Lift them
// into lib/run/agent-options.ts as part of this task — single source of
// truth so resume can reuse, and run/fix-pr can be migrated to it later.
export const resumeCommand = new Command('resume')
  .description('Continue an interrupted crew run on an existing worktree')
  .argument('<key>', 'Jira ticket key (e.g. KAN-23)', (v) => v.toUpperCase())
  .option(
    '-m, --message <message>',
    "additional context to give the agent on resume (e.g. -m 'focus on lib/x')",
  )
  .option('--skip-docker', 'skip the docker stack ensure step')
  .action(async (key: string, opts: ResumeOptions) => {
    await runResume(key, opts);
  });
```

**Helpers — `lib/run/agent-options.ts` is required, not optional.** Resume needs the same `playwright`/`bruno`/`dockerPorts` option-mapping that `run.ts` and `fix-pr.ts` already inline. Without lifting, we'd have three copies. Required scope of this task:

1. Create `lib/run/agent-options.ts` and move four functions out of `run.ts` and `fix-pr.ts`:
   - `playwrightOptsFor(config, resolvedAppUrl)` — current shape lives near `run.ts:210` (the `playwright` block of the `buildTicketPrompt` call) and `fix-pr.ts:286` (same shape for `buildFixPrPrompt`). Lift to `playwrightOptsFor(config, resolvedAppUrl): PlaywrightFixPrOptions | undefined`.
   - `brunoOptsFor(config, worktree, dockerPorts)` — current shape is `brunoSmokeOptionsFor` in `fix-pr.ts:140`. Move it; rename to `brunoOptsFor` for symmetry. (`run.ts` builds the bruno options inline today; migrate it to use the lifted helper.)
   - `needsDockerPorts(config)` — the boolean check `(playwrightEnabled(config) || bruno_smoke?.enabled) && URL has a port placeholder`. Currently inline in both files.
   - `readDockerPortsFromEnvFile(worktree)` — currently a private function in `fix-pr.ts:162`. Move it; export it.
2. Update `run.ts` and `fix-pr.ts` to import from the new module rather than inline the logic. Both should still pass their existing tests after the refactor.
3. `resume.ts` imports the same helpers.

Total LOC moved is small (~80 lines combined). The win is one source of truth across three commands.

- [ ] **Step 10f: Register the command**

Edit `packages/cli/src/index.ts`:

```ts
import { resumeCommand } from './commands/resume.js';
// ...
program.addCommand(resumeCommand);
```

- [ ] **Step 10g: Run tests to confirm pass**

Run: `npm run test --workspace=crew-cli -- --run resume`
Expected: PASS — all 5 tests green.

- [ ] **Step 10h: Lint + typecheck**

Run: `npm run lint && npm run format:check && npm run typecheck`
Expected: PASS.

- [ ] **Step 10i: Commit**

```bash
git add packages/cli/src/commands/resume.ts \
        packages/cli/src/commands/resume.test.ts \
        packages/cli/src/lib/claude/spawn.ts \
        packages/cli/src/lib/claude/spawn.test.ts \
        packages/cli/src/lib/run/agent-options.ts \
        packages/cli/src/index.ts

git commit -m "feat(CREW-resume): crew resume command + spawnClaudeFresh

- runResume: error if worktree missing; fetch origin; readWorktreeState;
  prepareAgentEnvironment(mode:'resume'); branch on findLatestSession.
  Session exists → claude --resume + resume.md. No session → fresh
  claude + ticket.md, with explicit '→ no prior session found' log.
- spawnClaudeFresh: sibling of spawnClaudeResume without --resume.
- agent-options.ts: lifts playwright/bruno option-mapper duplication
  out of run.ts and fix-pr.ts so resume can consume the same shape."
```

---

## Task 11: `crew restart` command

**Goal:** composed command. Without `--hard`: invoke `runReset({hard: false})` then `runResume({...})` — falls through to no-session branch since reset just deleted the session. With `--hard`: invoke `runReset({hard: true})` then the existing `crew run` body.

**Files:**

- Create: `packages/cli/src/commands/restart.ts`
- Create: `packages/cli/src/commands/restart.test.ts`
- Modify: `packages/cli/src/index.ts` (register)
- Modify: `packages/cli/src/commands/run.ts` (export `runRun` for restart's --hard path; if `runRun` doesn't exist, extract it from the inline `.action` — small but real refactor)

- [ ] **Step 11a: Extract `runRun` from `run.ts`'s `.action` body (if needed)**

If `run.ts`'s command-shell uses an inline async function in `.action(...)` rather than calling a named `runRun`, refactor:

```ts
// before:
.action(async (key, opts) => {
  // 200 lines of body
})

// after:
.action(async (key, opts) => {
  await runRun(key, opts);
});

export async function runRun(key: string, opts: RunOptions): Promise<void> {
  // 200 lines moved verbatim
}
```

This makes `runRun` callable from `crew restart --hard`.

- [ ] **Step 11b: Write failing tests**

Create `packages/cli/src/commands/restart.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('./reset.js', () => ({ runReset: vi.fn() }));
vi.mock('./resume.js', () => ({ runResume: vi.fn() }));
vi.mock('./run.js', () => ({ runRun: vi.fn() }));

import { runReset } from './reset.js';
import { runResume } from './resume.js';
import { runRun } from './run.js';
import { runRestart } from './restart.js';

describe('runRestart', () => {
  it('default: calls reset (hard=false) then resume', async () => {
    await runRestart('KAN-1', { hard: false });
    expect(runReset).toHaveBeenCalledWith('KAN-1', { hard: false });
    expect(runResume).toHaveBeenCalledWith('KAN-1', expect.objectContaining({}));
    expect(runRun).not.toHaveBeenCalled();
  });

  it('--hard: calls reset (hard=true) then run', async () => {
    await runRestart('KAN-1', { hard: true });
    expect(runReset).toHaveBeenCalledWith('KAN-1', { hard: true });
    expect(runRun).toHaveBeenCalledWith('KAN-1', expect.objectContaining({}));
    expect(runResume).not.toHaveBeenCalled();
  });

  it('passes -m through to the underlying command (default mode → resume)', async () => {
    await runRestart('KAN-1', { hard: false, message: 'try Y' });
    expect(runResume).toHaveBeenCalledWith('KAN-1', expect.objectContaining({ message: 'try Y' }));
  });

  it('passes -m through to the underlying command (--hard → run)', async () => {
    await runRestart('KAN-1', { hard: true, message: 'try Y' });
    expect(runRun).toHaveBeenCalledWith('KAN-1', expect.objectContaining({ message: 'try Y' }));
  });
});
```

- [ ] **Step 11c: Run to confirm fail**

Run: `npm run test --workspace=crew-cli -- --run restart`
Expected: FAIL.

- [ ] **Step 11d: Implement the command**

Create `packages/cli/src/commands/restart.ts`:

```ts
import { Command } from 'commander';
import { runReset } from './reset.js';
import { runResume } from './resume.js';
import { runRun } from './run.js';

interface RestartOptions {
  hard?: boolean;
  message?: string;
  skipDocker?: boolean;
}

export async function runRestart(key: string, opts: RestartOptions): Promise<void> {
  await runReset(key, { hard: Boolean(opts.hard) });

  if (opts.hard) {
    await runRun(key, { skipDocker: opts.skipDocker, message: opts.message });
    return;
  }

  await runResume(key, { message: opts.message, skipDocker: opts.skipDocker });
}

export const restartCommand = new Command('restart')
  .description("Wipe state and re-run the agent on a ticket's worktree")
  .argument('<key>', 'Jira ticket key (e.g. KAN-23)', (v) => v.toUpperCase())
  .option('--hard', 'also remove worktree + branch (full clean slate via crew run)')
  .option('-m, --message <message>', 'additional context to pass through to the underlying command')
  .option('--skip-docker', 'skip the docker stack step')
  .action(async (key: string, opts: RestartOptions) => {
    await runRestart(key, opts);
  });
```

- [ ] **Step 11e: Register the command**

Edit `packages/cli/src/index.ts`:

```ts
import { restartCommand } from './commands/restart.js';
// ...
program.addCommand(restartCommand);
```

- [ ] **Step 11f: Run tests + lint + typecheck**

Run: `npm run test --workspace=crew-cli -- --run restart`
Expected: PASS.

Run: `npm run lint && npm run format:check && npm run typecheck`
Expected: PASS.

- [ ] **Step 11g: Commit**

```bash
git add packages/cli/src/commands/restart.ts \
        packages/cli/src/commands/restart.test.ts \
        packages/cli/src/commands/run.ts \
        packages/cli/src/index.ts

git commit -m "feat(CREW-resume): crew restart command (composed)

- Default: runReset(hard=false) + runResume — falls through resume's
  no-session branch (since reset deleted it) → fresh claude + ticket
  prompt in existing worktree.
- --hard: runReset(hard=true) + runRun — full clean slate, equivalent
  to manual cleanup + crew run.
- -m '<msg>' passes through to the underlying command in both modes.
- run.ts exports runRun so restart --hard can compose it (was inline
  in .action before)."
```

---

## Task 12: Whole-suite verification

**Goal:** run the full test/lint/typecheck/format suite at the workspace root before manual gating. Catch any cross-package regressions.

- [ ] **Step 12a: Whole-suite tests**

Run: `npm run test:run`
Expected: PASS across all workspaces. If a snapshot drifted because `userMessageBlock` changed an outer prompt's spacing, re-run with `-u` and confirm the diff is only the slot-related blank line.

- [ ] **Step 12b: Lint + typecheck + format**

Run: `npm run lint && npm run typecheck && npm run format:check`
Expected: PASS.

- [ ] **Step 12c: Self-review prompt**

Invoke `superpowers:requesting-code-review` (per the user's standard workflow) before pushing. Address any blocking findings.

---

## Task 13: Manual gate on a Recipes ticket

**Goal:** validate the full surface end-to-end on a real Recipes ticket. This is the only manual gate; everything else is automated.

**Prerequisites:** all of Tasks 1–12 merged into the work branch. A Recipes worktree available (or a fresh ticket key picked from Jira).

- [ ] **Step 13a: Pick (or create) a ticket**

Pick any low-stakes Recipes ticket, or create a placeholder ticket explicitly for this gate (e.g. "[gate] crew resume manual verification — no implementation").

- [ ] **Step 13b: `crew run` with `-m`**

```bash
crew run KAN-<n> -m "this is a manual-gate test; no real implementation expected"
```

Verify in the agent's prompt log (`/tmp/crew-run-KAN-<n>.log`) that the user-message block appears between the opening line and `## Skills` in `ticket.md`. Confirm the agent acknowledges the message in its first turn.

Let it run for ~30 seconds, then `Ctrl-C`. The worktree + a prior session should now exist.

- [ ] **Step 13c: `crew resume` (session-exists path)**

```bash
crew resume KAN-<n>
```

Verify on stderr: `→ git fetch origin`, `→ worktree state: ...`, `→ Resuming session for KAN-<n>`. Verify the agent picks up where it left off (the `claude --resume` reload of conversation history).

`Ctrl-C` again.

- [ ] **Step 13d: `crew resume` with `-m`**

```bash
crew resume KAN-<n> -m "stop. just print 'manual gate ack' and exit."
```

Verify: same setup output as 13c, plus the resume prompt's `{{userMessageBlock}}` includes the message. The agent should respect the directive (or at least mention it) in its first turn.

`Ctrl-C`.

- [ ] **Step 13e: `crew restart` (default mode — sessions wiped, fresh agent in worktree)**

```bash
crew restart KAN-<n>
```

Verify on stderr: `→ deleted N session file(s)`, `→ no prior session found; starting fresh in existing worktree`. The agent's prompt should be the ticket prompt (re-fetched from Jira), not a resume prompt.

`Ctrl-C`.

- [ ] **Step 13f: `crew reset` (sessions only)**

```bash
crew reset KAN-<n>
```

Verify: `→ deleted N session file(s)`, no worktree changes, no agent spawn. `ls ~/.claude/projects/<encoded>/` should show no `.jsonl` files.

- [ ] **Step 13g: `crew restart --hard` (full clean slate)**

```bash
crew restart KAN-<n> --hard
```

Verify: `→ no sessions to delete`, `→ worktree removed: <path>`, `→ branch removed: KAN-<n>`, then the full `crew run` flow runs (worktree re-created, docker bringup, etc.).

`Ctrl-C` once you're satisfied the run is going through.

- [ ] **Step 13h: `crew reset --hard` (idempotent on missing artifacts)**

```bash
crew reset KAN-<n> --hard
crew reset KAN-<n> --hard       # second invocation: should "already removed"
```

The second call should print `already removed` for both the worktree and branch — no errors, exit 0.

- [ ] **Step 13i: `crew run` worktree-exists error**

Recreate the worktree by running `crew run KAN-<n>` once, `Ctrl-C` after worktree creation, then re-run the same command:

```bash
crew run KAN-<n>
```

Verify the new error message names `crew resume` and `crew restart --hard`.

- [ ] **Step 13j: `crew fix-pr -m` (replaces stdin)**

If a Recipes PR is available with at least one CI check that the agent could plausibly fix:

```bash
crew fix-pr <pr-key> -m "the test on line 42 of foo.spec.ts is failing because of X"
```

Verify the fix-pr prompt log shows the message in the `{{feedback}}` slot and `Source: inline message` near the top.

If `--from-stdin` is invoked, the CLI should emit a usage error pointing at `-m` / `--file`:

```bash
echo "test" | crew fix-pr <pr-key> --from-stdin
# expected: unknown option '--from-stdin'  (commander's default behavior after removal)
```

- [ ] **Step 13k: Capture findings**

If any step fails or produces unexpected output, capture stderr + stdout in `docs/tickets/CREW-resume.md` and stop. Otherwise note "manual gate passed on KAN-<n> at <date>" and proceed to push + PR.

- [ ] **Step 13l: Push and open PR**

```bash
git push -u origin <branch>
gh pr create --base main --head <branch> \
  --title "feat(CREW-resume): crew resume / restart / reset + shared -m flag" \
  --body "$(cat <<'EOF'
## Summary

Adds three new commands and a shared `-m "<msg>"` flag across all
agent-spawning commands. Closes the manual-cleanup dance after an
interrupted `crew run`.

- `crew resume <KEY>` — continue an interrupted run; resumes the
  latest session if one exists, else spawns fresh in the existing
  worktree.
- `crew restart <KEY>` — `reset` + `resume` (no-session branch).
- `crew restart <KEY> --hard` — `reset --hard` + `run`. Full slate.
- `crew reset <KEY>` — wipe sessions only. No agent spawn.
- `crew reset <KEY> --hard` — full nuke (worktree + branch + sessions).
- New `-m, --message <msg>` flag on `run`, `resume`, `restart`, `fix-pr`.
- **Removed** `crew fix-pr --from-stdin` in favor of `-m`.

## Test plan

- [x] `npm run test:run` (full workspace suite passes)
- [x] `npm run lint && npm run typecheck && npm run format:check`
- [x] Manual gate on KAN-<n>: run -m, resume, resume -m, restart, reset,
      restart --hard, reset --hard idempotency, run-error-on-existing-worktree,
      fix-pr -m, --from-stdin removal

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review checklist

Before any subagent dispatches, verify:

- [ ] Spec coverage: every section in `2026-04-30-crew-resume-design.md` (§1–§8) maps to a task here. §1–§3 are background; §4 (architecture) → Tasks 9–11; §5 (implementation/files) → Tasks 1–11; §6 (prompts) → Tasks 1, 2, 7; §7 (acceptance criteria) → Task 13; §8 (out-of-scope) is intentionally not implemented.
- [ ] No placeholders (TBD / TODO / "implement later" / etc.). Task 10e's `agent-options.ts` lift is required-scope, not deferred.
- [ ] Type / function names consistent: `userMessage` (option), `userMessageBlock` (placeholder), `renderUserMessageBlock` (helper), `buildResumePrompt`, `buildResumePromptOptions`, `runReset` / `runResume` / `runRestart` / `runRun`, `deleteSessionsForWorktree`, `removeWorktreeAndBranch`, `readWorktreeState`, `spawnClaudeFresh`, `FeedbackMode['kind'] = 'pr' | 'file' | 'message'`. Match these everywhere.
- [ ] Commit messages all carry `feat(CREW-resume):` or `docs(CREW-resume):` scope.
- [ ] Manual gate (Task 13) covers each command + flag combination at least once.
