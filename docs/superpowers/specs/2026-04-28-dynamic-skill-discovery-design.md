# Dynamic skill discovery for crew prompts

## Background

Crew launches Claude Code agents to work Jira tickets via `crew run <KEY>` and `crew fix-pr <KEY>`. The prompts these agents run with are built from templates at `packages/cli/src/lib/prompts/templates/ticket.md` and `.../fix-pr.md`. Both templates contain a hand-curated `## Skills` section listing the `superpowers:*` workflow skills the agent must invoke.

Diagnosis from the CREW-24 transcript at `~/.claude/projects/-home-safturento-Repos-crew-CREW-24/df18d18c-d492-48b7-999e-7c9c9dde57d0.jsonl`:

- The user-level skill `reaching-for-frontend-libraries` was registered for the session (it appears in the session's `skill_listing` system reminder).
- The agent wrote frontend code squarely in scope — `packages/dashboard/src/App.tsx`, `ErrorFallback.tsx`, `MockDaemonClient.ts` — and never invoked the skill.
- The only `Skill` tool calls in the transcript were `using-superpowers` (session start) and `superpowers:executing-plans` (entering execution mode).

The root cause is the prompt's framing: *"You are required to use **these** Superpowers skills as appropriate"*. The enumerated list reads as a closed allowlist, overriding the more general "invoke any skill whose description matches" rule from the system prompt. User-level skills under `~/.claude/skills/` and project-level skills under `<repo>/.claude/skills/` are silently excluded.

## Goal

Inject user-level and project-level skills into the rendered ticket and fix-pr prompts at command-invocation time, so any skill the user authors after-the-fact is automatically picked up by the next `crew run` or `crew fix-pr` without editing templates.

## Non-goals

- Discovering plugin skills under `~/.claude/plugins/cache/`. The curated `superpowers:*` block already references the ones crew needs; bulk-importing plugin skills would pollute the prompt with situational entries (`keybindings-help`, `update-config`, etc.).
- Distinct rendering for `Skill` or MCP tool calls in the live `crew run` tail. Deferred to a later refactor once the dashboard surfaces session activity directly.
- Caching the discovered list. Discovery runs once per command invocation, so there is no staleness to manage.

## Architecture

A new module at `packages/cli/src/lib/prompts/skills.ts` owns discovery and rendering. Both functions are pure with respect to filesystem inputs:

```ts
interface DiscoveredSkill {
  name: string;          // e.g. "reaching-for-frontend-libraries"
  description: string;   // from SKILL.md frontmatter
  source: 'user' | 'project';
}

export function discoverSkills(opts: { repoPath: string; home?: string }): DiscoveredSkill[];
export function renderDiscoveredSkillsBlock(skills: DiscoveredSkill[]): string;
```

`discoverSkills` reads from two sources:

- `~/.claude/skills/*/SKILL.md` (user-level) — `home` defaults to `os.homedir()` and is parameterised for tests.
- `<repoPath>/.claude/skills/*/SKILL.md` (project-level) — `repoPath` comes from the `ProjectConfig` that `discoverProjectConfig` already loads in `run.ts` and `fix-pr.ts`. Project-level skills are checked into git, so the worktree and main checkout see the same content; using `repoPath` keeps discovery independent of whether the worktree exists yet at prompt-build time.

`renderDiscoveredSkillsBlock` returns a markdown fragment ready to interpolate as `{{discoveredSkillsBlock}}`. Returns the empty string when no skills are discovered, so the placeholder collapses cleanly the same way `{{visualTestingBlock}}` does.

`buildTicketPrompt` and `buildFixPrPrompt` each gain an optional `discoveredSkillsBlock?: string` field on their input. The two callers — `runTicket` in `packages/cli/src/commands/run.ts` and `fixPr` in `packages/cli/src/commands/fix-pr.ts` — call `discoverSkills` + `renderDiscoveredSkillsBlock` and pass the result through.

This stays in the CLI package rather than `shared/`. Skill discovery exists to construct CLI prompts; it has no consumer in `daemon/` or `dashboard/`. Per the architecture rule "shared/ has no CLI / daemon / dashboard imports", the inverse holds: don't put CLI-only code in shared just because it touches the filesystem.

## Rendered output

Both templates change to add `{{discoveredSkillsBlock}}` directly under their existing curated `## Skills` list. When discovery returns two user-level skills, the rendered Skills section reads:

```markdown
## Skills

You are required to use these Superpowers skills as appropriate. Invoke each via the `Skill` tool when its trigger condition fires:

- **`superpowers:executing-plans`** — fires when a plan document exists at `docs/plans/{key}-*.md`, `docs/superpowers/plans/{key}-*.md`, or similar. ...
- **`superpowers:test-driven-development`** — ...
- **`superpowers:verification-before-completion`** — ...
- **`superpowers:systematic-debugging`** — ...
- **`superpowers:requesting-code-review`** — ...

The following user-level skills are equally required when their description matches what you're about to do — invoke them via the `Skill` tool the same way:

- **`reaching-for-backend-patterns`** — Use when implementing Node backend code that handles HTTP requests, validates input, queries a database, separates business logic from routing, handles errors, or wires service dependencies — before writing custom validation, embedding queries in route handlers, wrapping every handler in try/catch, or instantiating services via `new` inside route files.
- **`reaching-for-frontend-libraries`** — Use when implementing frontend features that touch server state (fetch + loading/error/refetch), forms with validation, error handling for async failures, or reusable component variants — before writing custom code with useState/useEffect/try-catch/className-branches.
```

When project-level skills also exist, a second sub-paragraph appears below:

```markdown
The following project-level skills are equally required when their description matches what you're about to do — invoke them via the `Skill` tool the same way:

- **`<project-skill-name>`** — <description from frontmatter>
```

Three deliberate wording choices:

1. **"equally required"** — counters the closed-allowlist failure mode that surfaced in CREW-24. The discovered skills carry the same weight as the curated `superpowers:*` block, not "additional/optional".
2. **No new section header for the discovered groups** — both groups live under the same `## Skills` heading so they read as a single requirement.
3. **Source distinction is via separate sub-paragraphs**, not inline tags. The split keeps the wording in each paragraph parallel and makes the source visible in the transcript without adding decorations the agent could rationalize past.

Each sub-paragraph is conditional: if a source contributes zero skills, its paragraph is skipped entirely. If both sources contribute zero, `{{discoveredSkillsBlock}}` collapses to the empty string and the prompt is byte-identical to today.

Within each source, bullets are sorted alphabetically by skill name for deterministic snapshots across machines.

`DiscoveredSkill.source` is internal metadata fed to the renderer; the agent infers source from which paragraph it sits in.

## Frontmatter parsing

SKILL.md files use YAML frontmatter — `---\nname: …\ndescription: …\n---` at the top of the file. Crew has no YAML dependency today; `smol-toml` is for project config and uses a different format.

Add `gray-matter` to `packages/cli/package.json`. Reasons over a hand-rolled regex parser:

- The `description` field can legitimately use YAML's folded (`>`) or literal (`|`) scalar forms; a regex parser silently mishandles them.
- SKILL.md is user-authored content we don't control; tolerance for the full frontmatter spec means we don't break when the user writes a multi-line description, escapes quotes, or includes comments.
- `gray-matter` is the canonical Node frontmatter parser (~6M weekly downloads, ~30KB) and is well-maintained.

Discovery is best-effort. A SKILL.md with missing or unparseable frontmatter, or a frontmatter block missing `description`, is skipped with a warning logged to stderr — a malformed user-authored skill must not break ticket execution.

## Testing

**Unit tests for `discoverSkills`** (`packages/cli/src/lib/prompts/skills.test.ts`):

- Discovers user-level skills only when `home` points at a fixture with `.claude/skills/foo/SKILL.md`.
- Discovers project-level skills only when `repoPath` fixture has `.claude/skills/`.
- Combines both sources when both exist; alphabetizes within each source.
- Skips directories under `.claude/skills/` that don't contain `SKILL.md`.
- Skips `SKILL.md` files with unparseable frontmatter (asserts a warning is logged).
- Skips frontmatter without a `description` field.
- Returns `[]` when neither source exists.

**Unit tests for `renderDiscoveredSkillsBlock`:**

- Empty input returns the empty string.
- User-only input renders just the user paragraph.
- Project-only input renders just the project paragraph.
- Both sources render both paragraphs in user-then-project order.
- Bullets within each source are alphabetized by name.

**Snapshot tests for `buildTicketPrompt` and `buildFixPrPrompt`** (extending `packages/cli/src/lib/prompts/builders.test.ts`):

- Existing snapshots stay green when no `discoveredSkillsBlock` is passed — regression guard for empty-state collapse.
- New snapshots cover the rendered prompt with a synthetic two-skill discovered block, asserting the `## Skills` section contains both the curated and discovered groups in the right order.

**Integration tests** in `packages/cli/src/commands/run.test.ts` and `fix-pr.test.ts` (light touch): assert the command calls `discoverSkills` with the right paths and forwards the rendered block into the prompt builder.

**Fixture skills** under `packages/cli/test/fixtures/skills/` — small synthetic SKILL.md files (not symlinks to the real `~/.claude/skills/` content, since those will change). Two user-level, one project-level, one malformed.

## Out of scope

- Migrating discovery into `shared/`. No second consumer exists today.
- A skills manifest with per-template workflow notes (option C from the brainstorm). Curated `superpowers:*` wording stays in the templates because the per-template variation is small and editing two `.md` files is cheaper than maintaining a manifest.
- Disabling specific discovered skills from the prompt. The user owns the contents of `~/.claude/skills/` and `<repo>/.claude/skills/`; opt-out is "delete or move the SKILL.md".
