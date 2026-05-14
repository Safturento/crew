# Bruno API smoke-test integration — design

> **Purpose of this document.** A spec for adding Bruno-driven HTTP smoke-test capability to crew-dispatched agents. Captures the decisions reached during brainstorming so the implementation plan can be written against a settled design. Implementation breakdown is laid out below as an Epic + child tickets, but actual ticket creation in Jira happens in the next phase.
>
> Read [`docs/plans/architecture.md`](../../plans/architecture.md) first for system context. This spec assumes familiarity with crew's existing run-ticket flow, per-project TOML config, per-worktree docker bringup, and prompt template. The shape of this design is identical to [`2026-04-28-visual-testing-via-playwright-mcp-design.md`](./2026-04-28-visual-testing-via-playwright-mcp-design.md): TOML opt-in → per-worktree generated artefact → docker lifecycle keeps the stack running → conditional prompt fragments. Where the two diverge, the spec calls it out explicitly.

## 1. Goal & scope

When `crew run <KEY>` (or `crew fix-pr <KEY>`) dispatches an agent on a backend ticket, the agent should be able to exercise the project's HTTP API against the running app — running a committed [Bruno](https://www.usebruno.com/) collection as a smoke check, and authoring/updating `.bru` files when endpoints change — without bespoke per-project setup outside what crew's per-project TOML already covers.

**In scope:**

- A `[bruno_smoke]` opt-in section in the per-project TOML config.
- A per-worktree generated Bruno environment file (`<worktree>/<collection_dir>/environments/<envName>.bru`) so the agent's smoke run hits the worktree's own ports and uses a project-supplied test user.
- An exported `CREW_BRUNO_ENV` env var the project's `npm run bruno:smoke` script consumes.
- Lifecycle changes so docker-backed apps stay running for the agent (today they're stopped after bringup unless `[visual_testing]` already keeps them up).
- Conditional prompt fragments in the ticket prompt and the fix-pr prompt instructing the agent to run smoke as part of verification, and to add/update `.bru` files when endpoints change.
- README documentation for users opting a project in.
- A small cross-project guidance skill (`~/.claude/skills/bruno-collection-maintenance/SKILL.md`) so the "update `.bru` when touching endpoints" rule reaches the agent regardless of which project it runs in.

**Out of scope (explicit non-goals):**

- A `crew bruno init` / `crew bruno run` subcommand. The prompt-fragment + per-project npm-script pattern from visual-testing is sufficient and avoids growing the CLI surface.
- Bootstrap bash scripts in any consuming project. Crew generates the env file; the smoke runner is a one-line npm script (`bru run --env "$CREW_BRUNO_ENV" ...`).
- Crew installing `@usebruno/cli` or any Bruno tooling into target repos. Repos own their `package.json`; crew validates the contract and fails fast at runtime when the script is missing.
- Crew shipping the project's `bruno/` collection directory itself. The collection (login flow, smoke flow, endpoint folders) lives in the target repo and is committed there.
- CI integration — running smoke as a GitHub Action — is a future epic. This spec covers agent-runtime smoke only.
- A unified abstraction over visual-testing and bruno-smoke (a single `[verification]` block, etc). Both stay independent; their lifecycle gates are composed at the call site, not unified in schema.

## 2. Decisions reached during brainstorming

| #   | Question                                                                  | Decision                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Which projects get bruno smoke?                                           | Per-project opt-in via TOML `[bruno_smoke]` section.                                                                                                                                                                       |
| 2   | Tied to `[visual_testing]`?                                               | No. Independent opt-in, independent `base_url` (no fallback to `visual_testing.app_url` — explicit is cleaner).                                                                                                            |
| 3   | Where does the per-worktree env file live?                                | Inside the project's own `bruno/` collection dir, under `environments/<envName>.bru`. The collection's own `.gitignore` excludes `environments/` — no `.git/info/exclude` mechanism needed.                                |
| 4   | How does the project's smoke runner pick up the right env?                | Crew exports `CREW_BRUNO_ENV=<envName>` in the agent's spawn env. The project's `npm run bruno:smoke` reads it (e.g. `bru run --env "$CREW_BRUNO_ENV" ...`).                                                               |
| 5   | What is `<envName>`?                                                      | Lowercased worktree basename — same string `writeDockerEnv` produces as `composeProjectName` (e.g. `recipes-app-kan-99` for the KAN-99 worktree, `recipes-app` for the canonical worktree). One stable name per worktree.  |
| 6   | Docker lifecycle?                                                         | Refactor today's `stopAfterBringup = !visualTestingEnabled` into a single `agentNeedsAppRunning(config)` predicate composed from `visual_testing` OR `bruno_smoke`.                                                        |
| 7   | One prompt fragment or two?                                               | Two — `ticket-bruno-smoke.md` (for `crew run`) and `fix-pr-bruno-smoke.md` (for `crew fix-pr`). Each instructs the agent to run smoke and to author/update `.bru` files when endpoints change.                             |
| 8   | Where does the "update `.bru` when touching endpoints" rule live durably? | A small `bruno-collection-maintenance` skill at `~/.claude/skills/`, picked up by `discoverSkills()`. The skill triggers on HTTP-route authorship in any project that has a `bruno/` directory.                            |
| 9   | Module location?                                                          | `packages/cli/src/lib/bruno-smoke/` — parallels `packages/cli/src/lib/visual-testing/`. When `crew-shared` gets bootstrapped (Phase 1.5), this module relocates with no API change — same as the visual-testing precedent. |
| 10  | DRY with visual-testing's `resolveAppUrl`?                                | Reuse. `bruno-smoke` imports `resolveAppUrl` from `../visual-testing/index.js`. Generalising into a shared `url-substitution` helper is YAGNI until a third caller emerges.                                                |

## 3. Architecture

```
~/.config/crew/projects/<name>.toml
        │
        │  [bruno_smoke] section (optional)
        ▼
┌─────────────────────────────────────────┐
│ crew run <KEY> / crew fix-pr <KEY>      │
├─────────────────────────────────────────┤
│ 1. Load + validate project config       │
│ 2. If bruno_smoke.enabled:              │
│    a. Compute baseUrl                   │
│       (resolveAppUrl from               │
│        visual-testing — DRY)            │
│    b. Compute envName                   │
│       (lowercased worktree basename)    │
│    c. Write                             │
│       <worktree>/<collection_dir>/      │
│         environments/<envName>.bru      │
│       containing vars { baseUrl,        │
│         testUser.email/...password }    │
│ 3. agentNeedsAppRunning(config)         │
│    composes [visual_testing] +          │
│    [bruno_smoke]; docker bringup        │
│    skips `stop` when either is on       │
│ 4. Build prompt with conditional        │
│    bruno-smoke fragment(s)              │
│ 5. Spawn claude with                    │
│    CREW_BRUNO_ENV=<envName>             │
│    in spawn env                         │
└─────────────────────────────────────────┘
        │
        ▼
┌─────────────────────────────────────────┐
│ claude agent (in worktree)              │
├─────────────────────────────────────────┤
│ • Reads CREW_BRUNO_ENV from env         │
│ • Runs `npm run bruno:smoke` as part    │
│   of verification before claiming      │
│   "Verify" complete                     │
│ • When adding/modifying HTTP routes,    │
│   updates matching                      │
│     bruno/endpoints/<group>/*.bru       │
│     bruno/flows/<flow>.bru              │
│   in the same PR                        │
│ • Failure (non-zero exit) means         │
│   verification is not complete          │
└─────────────────────────────────────────┘
```

**Boundaries** (matching crew's existing rules from `CLAUDE.md`):

- `bruno-smoke` lives under `packages/cli/src/lib/bruno-smoke/` for now (parallels `visual-testing/`). When `crew-shared` lands, it relocates with no API change.
- The generated env file is a worktree-local artefact. The project's `bruno/.gitignore` excludes `environments/` — no `.git/info/exclude` games needed (the path is owned by the project).
- The base ticket and fix-pr templates each gain one `{{brunoSmokeBlock}}` placeholder; ticket-β and fix-pr-γ each ship the corresponding fragment file.
- No target-repo mutations beyond writing the env file inside the (already-gitignored) `environments/` directory.

## 4. TOML schema additions

> **Project-specific:** lives in `~/.config/crew/projects/<name>.toml` and is loaded by `packages/shared/src/config/loader.ts`. Schema is in `packages/shared/src/config/schema.ts`. Validation is Zod.

```toml
# Optional. When this section is absent, crew behaves exactly as today.
[bruno_smoke]
enabled = true                                          # required when section present

# URL the project's API runs at. Supports {httpPort}, {httpsPort},
# {postgresPort} substitution from the per-worktree docker .env when the
# [docker] section is configured. Used as-is otherwise.
base_url = "https://localhost:{httpsPort}"

# Optional. Sub-directory of the worktree where the Bruno collection lives.
# Defaults to "bruno". The generator writes
# <worktree>/<collection_dir>/environments/<envName>.bru.
collection_dir = "bruno"

# Optional sub-table — supplies test-user credentials for the smoke run's
# login flow. When absent, the env file is written without a testUser block
# (suitable for projects with no auth, or where the runner injects its own).
[bruno_smoke.smoke_user]
email    = "smoke@example.com"
username = "smoke"
password = "hunter2"
```

**Validation rules** (Zod refines):

- `[bruno_smoke]` is optional at the top level. When present, both `enabled = true` and `base_url` are required.
- `base_url` placeholders that reference docker-derived ports (`{httpPort}`, `{httpsPort}`, `{postgresPort}`) require the `[docker]` block to be present (matches the visual-testing rule, same `PORT_PLACEHOLDERS` constant).
- `collection_dir` defaults to `"bruno"`. Must be a non-empty relative path string.
- `[bruno_smoke.smoke_user]`, when present, requires all three of `email`, `username`, `password` (each non-empty). All-or-nothing keeps the env-file render path simple; per-project schemas with email-only or username-only login are a future extension.
- **Independent of `[visual_testing]`:** if a project enables both, both fire; if it enables only one, only that one fires. There is no fallback from `bruno_smoke.base_url` to `visual_testing.app_url` (or vice versa).

## 5. Per-worktree env file generator

> **Project-specific:** lives in a new module `packages/cli/src/lib/bruno-smoke/`, called from `runTicket()` in `packages/cli/src/commands/run.ts` and `runFixPr()` in `packages/cli/src/commands/fix-pr.ts` after the docker `.env` write and before the agent spawn.

**File location:** `<worktree>/<collection_dir>/environments/<envName>.bru` (default `<worktree>/bruno/environments/<envName>.bru`). The generator creates the `environments/` directory if it doesn't exist; if the project hasn't shipped a `bruno/` directory at all, the write fails fast with a clear "did you forget to add the collection?" error.

**Env name resolution:**

```ts
// packages/cli/src/lib/bruno-smoke/resolve-env-name.ts
import { basename } from 'node:path';

export function resolveBrunoEnvName(worktreePath: string): string {
  return basename(worktreePath.replace(/\/+$/, '')).toLowerCase();
}
```

For a worktree at `/home/me/Repos/Recipes-App-KAN-99`, `envName = "recipes-app-kan-99"`. For the canonical worktree `/home/me/Repos/Recipes-App`, `envName = "recipes-app"`. This is the same string `writeDockerEnv` already produces as `composeProjectName`, but we recompute it independently so bruno-smoke does not depend on the docker block being configured.

**Env file contents:**

```bru
vars {
  baseUrl: https://localhost:18443
  testUser.email: smoke@example.com
  testUser.username: smoke
  testUser.password: hunter2
}
```

When `[bruno_smoke.smoke_user]` is absent, the `testUser.*` lines are omitted and only `baseUrl` is written. When `base_url` had no port placeholders, it's used as-is.

**Public interface** (in `packages/cli/src/lib/bruno-smoke/`):

```ts
export interface BrunoSmokeUser {
  email: string;
  username: string;
  password: string;
}

export function buildEnvFileContent(opts: { baseUrl: string; smokeUser?: BrunoSmokeUser }): string;

export function writeEnvFile(
  worktreePath: string,
  opts: {
    collectionDir: string;
    envName: string;
    baseUrl: string;
    smokeUser?: BrunoSmokeUser;
  },
): { envFilePath: string; existed: boolean };

export function resolveBrunoEnvName(worktreePath: string): string;
```

`writeEnvFile` ensures `<worktree>/<collectionDir>/environments/` exists before writing. It overwrites a pre-existing env file with a yellow warning (same convention as visual-testing's `.mcp.json` overwrite). It does **not** mutate `.gitignore` — that's the consuming project's responsibility (the README documents the one-line addition required during bootstrap).

## 6. App lifecycle changes

The current `runTicket` computes:

```ts
const stopAfterBringup = !config.visual_testing?.enabled;
```

This becomes:

```ts
const stopAfterBringup = !agentNeedsAppRunning(config);
```

with a new helper in `packages/cli/src/lib/run/app-lifecycle.ts`:

```ts
export function agentNeedsAppRunning(config: ProjectConfig): boolean {
  return Boolean(config.visual_testing?.enabled) || Boolean(config.bruno_smoke?.enabled);
}
```

Both modules call into the same predicate, so the docker bringup script does the right thing whether the project opts into one, the other, or both. The `buildDockerBringupScript` signature and behaviour are unchanged.

`fix-pr` does **not** run docker bringup today and we do not add it. The `fix-pr` flow assumes the worktree's stack is already up from the original `crew run`. If it isn't, the agent's first `npm run bruno:smoke` call will fail with a connection error — a clear signal documented in the prompt fragment.

## 7. Prompt template additions

The current renderer (`packages/cli/src/lib/prompts/render.ts`) is plain `{{var}}` substitution. We keep it that way and add fragment files composed by the builders.

> **Project-specific:**
>
> ```
> packages/cli/src/lib/prompts/templates/
> ├── ticket.md                     (existing base; +1 line: {{brunoSmokeBlock}})
> ├── ticket-bruno-smoke.md         (new in CREW-bruno-β)
> ├── fix-pr.md                     (existing base; +1 line: {{brunoSmokeBlock}})
> └── fix-pr-bruno-smoke.md         (new in CREW-bruno-γ)
> ```

`buildTicketPrompt` and `buildFixPrPrompt` each gain an optional `brunoSmoke` field on their options:

```ts
export interface BrunoSmokePromptOptions {
  baseUrl: string; // resolved (placeholders substituted)
  envName: string; // exported as CREW_BRUNO_ENV
  hasSmokeUser: boolean;
}
```

The block renders to an empty string when `brunoSmoke` is `undefined`, preserving today's prompt byte-for-byte for projects that don't opt in.

**Where the block sits in `ticket.md`:** immediately after `{{visualTestingBlock}}` (between step 7 "Execute" and step 8 "Verify"), so both verification fragments cluster together when both are enabled.

**Where the block sits in `fix-pr.md`:** immediately after the curated Skills list and before the "Apply the fixes" section. (`fix-pr.md` has no numbered workflow; the placement reads as additional context the agent must honour during the fix.)

**Smoke fragment for `crew run` (`ticket-bruno-smoke.md`):**

```markdown
## API smoke verification (Bruno)

This project has a Bruno collection at `{{collectionDir}}/`. The worktree's API runs at **{{baseUrl}}**, and crew has generated `{{collectionDir}}/environments/{{envName}}.bru` with `baseUrl`{{testUserClause}} for you. The environment is exported as `CREW_BRUNO_ENV={{envName}}` in your spawn env.

Two non-negotiable rules whenever this project's API is involved:

1. **Run the smoke flow as part of verification.** Before claiming "Verify" complete, run `npm run bruno:smoke` (the project's script reads `CREW_BRUNO_ENV` automatically). A non-zero exit means smoke failed — verification is **not** complete; loop back to step 7 (Execute).
2. **Update `.bru` files when endpoints change.** If you add, remove, or modify any HTTP endpoint, the same PR must add or update the matching `{{collectionDir}}/endpoints/<route-group>/<verb>-<name>[-<case>].bru` and `{{collectionDir}}/flows/<flow>.bru` files. Coverage drifts the moment a route changes without its `.bru`.

The `bruno-collection-maintenance` skill (auto-discovered) covers naming conventions, the `vars:post-response` patterns, and the conventions for `flows/` vs `endpoints/`.
```

`{{testUserClause}}` resolves to `" and a test user"` when `hasSmokeUser` is true, or to the empty string otherwise.

**Fix-pr fragment (`fix-pr-bruno-smoke.md`):**

```markdown
## API smoke verification (Bruno)

This project has a Bruno collection at `{{collectionDir}}/`. Crew already generated `{{collectionDir}}/environments/{{envName}}.bru` (pointing at **{{baseUrl}}**) for the original run. `CREW_BRUNO_ENV={{envName}}` is set in your env.

While applying feedback:

- If your fix touches any HTTP endpoint behaviour, update the matching `{{collectionDir}}/endpoints/...` and (where relevant) `{{collectionDir}}/flows/...` files in the same set of commits.
- Before pushing, run `npm run bruno:smoke`. Smoke must pass. A connection error usually means the worktree's stack isn't up — bring it up the same way the original `crew run` did, then re-run smoke.

Treat smoke failure the same as test failure: do not push.
```

## 8. Cross-project guidance skill

A small skill ships at `~/.claude/skills/bruno-collection-maintenance/SKILL.md` (off-repo, lives in the user's home). The crew project does not own this file — but the implementation plan ships a ticket that creates it so the deliverable is tracked.

**Frontmatter:**

```yaml
---
name: bruno-collection-maintenance
description: Use when authoring or modifying HTTP routes (Fastify route registration, controller files, OpenAPI schemas, or anything that adds/changes a request/response shape) in a project with a `bruno/` directory. Even if the change is small, even if a quick `npm run bruno:smoke` looks green, the matching `bruno/endpoints/<group>/<verb>-<name>.bru` must be added or updated in the same commit. Skip only when the change is in a project without `bruno/` at all.
---
```

The description follows the "positive trigger + loophole-closer" shape from `feedback_skill_description_triggers.md` — it names the file shape that triggers it, and explicitly closes the "but smoke passed" loophole.

**Body covers:**

- Naming conventions: `endpoints/<route-group>/<verb>-<name>[-<case>].bru` for individual endpoints; `flows/<flow>.bru` for multi-step user journeys.
- The `vars:post-response { token: res.body.token }` pattern for chaining auth tokens between requests in a flow.
- The `auth { bearer: { token: {{token}} } }` pattern for authenticated endpoints.
- The "update `.bru` when touching endpoints" rule, restated with the rationale (smoke coverage drifts silently otherwise).
- An explicit non-trigger: read-only changes that don't alter request/response shape (renaming an internal helper, reordering imports, etc).

**Discoverability:** crew's existing `discoverSkills()` reads `~/.claude/skills/*/SKILL.md` already; no crew code change is needed for the skill to surface in agent prompts. The discoveredSkillsBlock placement in both `ticket.md` and `fix-pr.md` already exists.

## 9. Failure modes & error handling

**At config load** (CREW-bruno-α):

- Schema-validation failures fail fast with the path to the bad config and the offending field (consistent with visual-testing).
- Cross-validation: `{httpsPort}` etc. in `base_url` without `[docker]` → explicit "port placeholder used without [docker]" message.
- Partial `[bruno_smoke.smoke_user]` (e.g. only `email` set) → Zod's standard "missing field" error.

**At worktree setup** (CREW-bruno-α):

- Pre-existing env file at the target path → overwrite with a yellow warning. Fresh worktrees from `origin/main` shouldn't have one (the path is gitignored), but we don't fail.
- `<worktree>/<collection_dir>/` does not exist → fail hard. The collection dir is the project's responsibility; we surface "you opted into bruno_smoke but the project hasn't shipped a `<collection_dir>/` collection. Add one or remove `[bruno_smoke]` from the project config."
- Failed `environments/` directory creation → fail hard.
- Malformed substituted URL → not validated. Agent will see the bad URL and the smoke run will fail with a connection error.

**At agent runtime** (CREW-bruno-β/γ via prompt fragments):

- `npm run bruno:smoke` script missing in the project's `package.json` → npm errors with a clear "missing script" message. Agent surfaces in PR description per the prompt's instructions; **working as designed** (target-repo prerequisite gap we explicitly chose not to auto-fix).
- App unreachable when running smoke → bruno's connection error is descriptive; the prompt's fix-pr fragment specifically calls out "bring the stack up" for this case.
- Login flow fails (e.g. seed user changed) → smoke exits non-zero; agent must investigate as it would any failing test.

**At fix-pr** (CREW-bruno-γ):

- `fix-pr` does not run docker bringup. If the worktree's stack is down, smoke fails immediately. Documented in the fix-pr fragment.
- `fix-pr` must load the project config (it currently does not). The implementation plumbs `discoverProjectConfig(repoPath)` from the existing `repoPathFromWorktree` helper.

## 10. Testing strategy

**CREW-bruno-α (foundation):**

- Schema cases in `packages/shared/src/config/loader.test.ts`: `[bruno_smoke]` absent, enabled minimal, missing `base_url`, port placeholder without `[docker]`, smoke_user complete, smoke_user missing one field, smoke_user missing two fields.
- New `bruno-smoke/resolve-env-name.test.ts`: trailing-slash trimming, mixed-case input, canonical-worktree case.
- New `bruno-smoke/build-env-file.test.ts`: with and without smokeUser, snapshot of both shapes.
- New `bruno-smoke/write-env-file.test.ts`: creates `environments/` dir, writes file, returns `existed` flag, fails when `<collection_dir>/` missing.
- New `run/app-lifecycle.test.ts`: `agentNeedsAppRunning` truth table — `[visual_testing]` only, `[bruno_smoke]` only, both, neither.
- `runTicket` integration: extend the existing mocked-execa test to assert the env file is written iff `bruno_smoke.enabled`, and `CREW_BRUNO_ENV` ends up in the spawned process env. The `buildTicketPrompt` baseline snapshot must be unchanged when neither verification block is on.

**CREW-bruno-β (ticket prompt):**

- Three `buildTicketPrompt` snapshots: bruno-only, bruno + visual_testing, neither (matches α baseline byte-for-byte).
- The fragment must include `{{baseUrl}}`, `{{envName}}`, the `npm run bruno:smoke` instruction, and the "update `.bru`" rule.
- A test asserting `hasSmokeUser: true` renders the testUser clause and `false` omits it.

**CREW-bruno-γ (fix-pr prompt):**

- Two `buildFixPrPrompt` snapshots: bruno on, bruno off (matches today's baseline byte-for-byte).
- A test asserting `runFixPr` plumbs the project config through (mock `discoverProjectConfig`).

**CREW-bruno-skill (off-repo):**

- The skill file is hand-authored; verification is that frontmatter parses and `discoverSkills()` lists it. We can run a smoke check (`tsx -e "console.log(discoverSkills({ repoPath: '...' }))"`) once the file is in place. Not part of crew's CI.

**Cross-cutting:**

- No live Bruno run in crew's CI. The env file content + `CREW_BRUNO_ENV` plumbing is the contract; what `bru run` does with it is not crew's test surface.
- One manual smoke per ticket as part of acceptance criteria: α → eyeball generated env file in a real worktree; β → watch a real agent run call `npm run bruno:smoke` on a backend ticket; γ → run `crew fix-pr` with feedback that touches an endpoint and watch the agent update the matching `.bru`.

## 11. Documentation deliverables

A new "Bruno smoke tests (per project)" subsection under "Setup" in the crew README, mirroring the visual-testing subsection's structure. Distributed across the three crew tickets:

- **CREW-bruno-α** lands the foundational paragraphs: opt-in via TOML, the `[bruno_smoke]` schema, what crew generates per-worktree, and the bootstrap steps for a new project's collection (the `bruno/.gitignore` line, the `bruno/login.bru` flow shape, the `npm run bruno:smoke` script).
- **CREW-bruno-β** appends a paragraph describing what the smoke step does at agent runtime so users understand why their dispatched agents now run `npm run bruno:smoke`.
- **CREW-bruno-γ** appends one short paragraph noting `crew fix-pr` enforces the same smoke-and-update-`.bru` rules.

## 12. Implementation breakdown — Epic + child tickets

> **Project-specific:** these will become Jira tickets in the **CREW** project under one new Epic, named to match the brainstorm-side keys (`CREW-bruno-α/β/γ/skill`). The "(prereq)" tickets land in their own project keys and live outside this epic.

**Epic: Bruno API smoke-test integration** — covers the three crew implementation tickets and the off-repo skill ticket. Target-repo prerequisite tickets (per-project Bruno collection authorship + `npm run bruno:smoke` script) are linked but live outside this epic since they're consumable independently.

| Ticket               | Title                                                                                                                                 | Blocks/blocked-by                                                            |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **CREW-bruno-α**     | TOML schema + Zod refines + per-worktree env-file generator + docker-lifecycle refactor + `CREW_BRUNO_ENV` export + README foundation | Blocks β, γ                                                                  |
| **CREW-bruno-β**     | `ticket-bruno-smoke.md` fragment + `buildTicketPrompt` branch + snapshot tests + README append                                        | After α; parallel with γ                                                     |
| **CREW-bruno-γ**     | `fix-pr-bruno-smoke.md` fragment + `buildFixPrPrompt` branch + `fix-pr` config plumbing + snapshot tests + README append              | After α; parallel with β                                                     |
| **CREW-bruno-skill** | `~/.claude/skills/bruno-collection-maintenance/SKILL.md` (off-repo deliverable; commit lives in user's dotfiles)                      | Independent — can run any time; off-repo                                     |
| (CREW-prereq)        | Bruno collection for crew's own daemon API                                                                                            | After α; daemon-bootstrap-spec must merge first so the API surface is stable |
| (KAN-prereq)         | Bruno collection for Recipes API + `CLAUDE.md` update                                                                                 | After α; can run parallel with crew-prereq                                   |

**Parallelism plan** (to be confirmed in the next phase before any implementation begins):

1. CREW-bruno-α first, alone.
2. CREW-bruno-β, CREW-bruno-γ, and CREW-bruno-skill in parallel after α merges. (γ touches `fix-pr.ts` and `fix-pr.md`; β touches `run.ts` and `ticket.md`; the skill is off-repo. No file overlap.)
3. The two prerequisite collection tickets (Recipes + crew daemon) can run any time after α — they only gate the _value_ of β/γ in their respective repos, not β/γ's own merge.

## 13. Open questions / things to revisit

- The skill's frontmatter description is the single trigger surface. If agents underuse it, tighten the wording per the existing `feedback_skill_description_triggers` pattern (positive file-shape trigger, loophole-closer).
- `smoke_user` is all-or-nothing today. A future schema relaxation could allow email-only or username-only login (boolean flag per field, or a discriminated union). Defer until a real project needs it.
- The `bruno-smoke` module imports `resolveAppUrl` from `visual-testing`. If a third caller emerges (e.g. a future smoke-test mechanism), promote the helper into a `lib/url-substitution/` module shared by all three.
- `crew fix-pr` gains a config-load dependency in CREW-bruno-γ. If that becomes a friction point (long-running fix-pr loops re-reading config), introduce a `--config-cached` flag or a session cache keyed on worktree path.
- `bruno/.gitignore` shape is the project's responsibility. If projects keep getting it wrong (committing `environments/<envName>.bru` accidentally), revisit by having crew write a `.gitignore` template alongside the env file on first run. Low priority — the bootstrap doc covers it.
