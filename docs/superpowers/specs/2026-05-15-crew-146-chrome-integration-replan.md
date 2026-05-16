# CREW-146 re-plan — superpowers-chrome integration on the new skill architecture

## Context

CREW-146 ("Wire chrome MCP + browsing skill + live-DOM Step 5") was specced and branched on
2026-05-13 against the skill subsystem as it existed then. Between branch and now, the
skill-storage consolidation epic (CREW-169) landed and rearchitected that subsystem out from
under the PR:

- **#221** relocated crew-owned skills from `packages/cli/src/lib/skills/` to committed
  `<repo>/.claude/skills/<name>/`.
- **#222** removed the conditional skill-injection subsystem entirely — `SKILL_APPLICABILITY`,
  `skillsApplicableTo`, `discoverSkills`, `renderDiscoveredSkillsBlock`, and the
  prompt-inlining of discovered skills are all gone. Injection is now **unconditional**: a flat
  `CREW_OWNED_SKILLS` list is copied into every dispatched worktree, and each skill self-gates
  via its own `description`.
- **#223** de-referenced personal/user-level skills in crew's docs — crew's stance is now
  "self-contained, in-repo skills."

The original CREW-146 PR (#196) is `CONFLICTING`/`DIRTY` as a result: it vendors a skill into
the deleted `packages/cli/src/lib/skills/` directory and registers it in the deleted
`SKILL_APPLICABILITY` table. The integration *mechanism* it implements no longer exists. A
rebase would be a conflict-resolution slog that still left the design wrong.

This document re-plans the agent-side work. It **supersedes Changes B2.1–B2.4** of
`docs/superpowers/specs/2026-05-13-superpowers-chrome-agent-integration.md`. **B2.5** of that
spec (wire `[visual_fidelity]` into crew's own project) already shipped as CREW-147 / PR #195
and is unaffected.

The **goals and non-goals are unchanged** from the original spec — chrome MCP available to
`[visual_fidelity]` dispatches, the `browsing` skill present in the worktree, Step 5 rewritten
as live-DOM inspection, graceful degradation when `superpowers-chrome` is not installed. Only
the integration mechanism is redesigned. Read the original spec for the full motivation
(runtime-only bug classes the static Steps 3–4 cannot catch).

## What the re-plan changes vs. the original

| Original spec (B2.x) | Re-plan |
| --- | --- |
| Vendor `browsing` into `packages/cli/src/lib/skills/browsing/` (25+ committed files) | **Not vendored.** Resolved from the installed `superpowers-chrome` plugin cache and copied into the worktree at dispatch time. |
| Register `browsing` in `SKILL_APPLICABILITY`, gated on `config.visual_fidelity` | `SKILL_APPLICABILITY` no longer exists. `browsing` is injected by a dedicated branch in `runSkillInjection`, gated on `[visual_fidelity]` **and** plugin presence. |
| `resolveChromeMcpPath` resolves only the MCP server entrypoint | `resolveSuperpowersChrome` resolves the MCP server **and** the `browsing` skill dir from the same plugin version dir — one resolver, one source of truth. |
| Skill edits land in `packages/cli/src/lib/skills/visual-fidelity-check/` | Same edits, new path: `<repo>/.claude/skills/visual-fidelity-check/`. |
| Out-of-scope followup: auto-refresh of the vendored `browsing` skill | **Moot** — nothing is vendored, so there is nothing to drift or refresh. |

The net effect: no upstream code is committed into crew, the drift problem disappears, and the
entire CLI surface becomes autonomous-dispatchable (see Execution split).

## Design

### Change 1 — `resolveSuperpowersChrome`: single plugin-cache resolver

> **Project-specific:** new file `packages/cli/src/lib/mcp-config/resolve-superpowers-chrome.ts`
> (the `mcp-config/` directory is the renamed `playwright/` — see Change 6).

The `superpowers-chrome` plugin ships both the MCP server and the `browsing` skill under one
versioned directory in the user's plugin cache:

```
~/.claude/plugins/cache/superpowers-marketplace/superpowers-chrome/<version>/
  mcp/dist/index.js        # the chrome MCP server entrypoint
  skills/browsing/         # the browsing skill source (SKILL.md, lib/, EXAMPLES.md, ...)
```

`resolveSuperpowersChrome(homeDir?)` returns `{ mcpServerPath, skillsRoot } | null`:

1. Look in `~/.claude/plugins/cache/superpowers-marketplace/superpowers-chrome/`.
2. If absent, return `null`.
3. List immediate children, parse each as semver, pick the highest valid one. None → `null`.
4. Resolve `mcpServerPath = <version>/mcp/dist/index.js` and
   `skillsRoot = <version>/skills` (the directory *containing* `browsing/`, so it can be
   passed straight to `copySkillIntoWorktree` as a `sourceRoot`).
5. Return the pair **only if `mcpServerPath` exists on disk**. The `browsing` skill is useless
   without the MCP server it drives; if the server entrypoint is missing (plugin installed but
   not built), treat the whole plugin as unavailable and return `null`.

One resolver, consumed by both Change 3 (MCP wiring) and Change 5 (skill injection), so the
"is `superpowers-chrome` available?" decision is made in exactly one place.

### Change 2 — `buildMcpConfig`: emit a `chrome` server

> **Project-specific:** `packages/cli/src/lib/mcp-config/build-mcp-config.ts`.

`buildMcpConfig` takes an options object with optional `playwright` and `chrome` sub-objects
and emits one `mcpServers` entry per requested server. The `chrome` entry:

```json
{
  "chrome": {
    "command": "node",
    "args": ["<resolved mcpServerPath>"]
  }
}
```

The server key `chrome` determines the agent-facing tool name: `mcp__chrome__use_browser`.
Both servers coexist in one `.mcp.json` with no interaction.

### Change 3 — `writeMcpFile`: chrome wiring + single warning site

> **Project-specific:** `packages/cli/src/lib/mcp-config/write-mcp-file.ts`.

`writeMcpFile`'s options move from a flat `{ appUrl, resolverCwd }` shape to nested
`{ playwright?, chrome? }` sub-objects, so a chrome-only configuration (no playwright wiring)
reads cleanly.

When `chrome` is requested, `writeMcpFile` calls `resolveSuperpowersChrome()`:

- Non-null → include the `chrome` server entry.
- `null` → emit a single `pc.yellow` warning
  (`superpowers-chrome plugin not found — chrome MCP not wired; visual-fidelity Step 5 will
  degrade to verification-gap`) and emit the config without the `chrome` entry.

This is the **only** warning site for plugin-absent. Skill injection (Change 5) stays silent on
the same condition to avoid a double-warning.

### Change 4 — `.mcp.json` write gate in the dispatch commands

> **Project-specific:** `packages/cli/src/commands/run.ts` and `resume.ts`. `fix-pr.ts`
> does not write `.mcp.json` today and is not changed by this re-plan beyond the Change 6
> import-path rename.

Today `.mcp.json` is written only when `[playwright]` is enabled and smoke is on. Extend the
gate so the file is also written when `[visual_fidelity]` is configured — chrome-only is a
valid configuration. Shape:

```ts
const wantsMcp =
  (playwrightEnabled(config) && smokeEnabled(config)) || Boolean(config.visual_fidelity);
if (wantsMcp) {
  await writeMcpFile(worktree, {
    playwright:
      playwrightEnabled(config) && smokeEnabled(config)
        ? { appUrl, resolverCwd: config.repo_path }
        : undefined,
    chrome: Boolean(config.visual_fidelity),
  });
}
```

`resume.ts` already refreshes `.mcp.json` on every resume (so a resume picks up config-shape
changes shipped by newer crew code); it gets the same extended gate, so chrome survives a
feedback-driven resume of a `[visual_fidelity]` project. Ordering relative to
`prepareAgentEnvironment` is unchanged — the MCP write still
happens after the environment is prepared (see `.agents/dispatch.md` step 8 and the CREW-70
note on Chromium-path resolution timing).

### Change 5 — `runSkillInjection`: copy `browsing` from the plugin cache

> **Project-specific:** `packages/cli/src/lib/run/skill-injection-step.ts`.

`runSkillInjection` currently copies each name in `crewOwnedSkills()` from crew's own
`.claude/skills/` (resolved by `skillsSourceRoot()` in `run.ts`) into the worktree's
`.claude/skills/<name>/`. `copySkillIntoWorktree(worktree, name, sourceRoot)` already takes an
arbitrary `sourceRoot`.

Add a second, distinct injection branch for `browsing`:

1. After the crew-owned skills are copied, if `[visual_fidelity]` is configured **and**
   `resolveSuperpowersChrome()` returns non-null, call
   `copySkillIntoWorktree(worktree, 'browsing', <skillsRoot>)` where `skillsRoot` is the
   resolver's returned `skills/` directory.
2. If `[visual_fidelity]` is set but the resolver returns `null`, skip silently — `writeMcpFile`
   (Change 3) has already warned about the same condition.
3. Per-skill failure stays non-fatal, consistent with the existing crew-owned-skill contract:
   a failed `browsing` copy degrades Step 5 to a verification gap rather than aborting dispatch.

`browsing` is deliberately **not** added to the `CREW_OWNED_SKILLS` array. That array is the
list of skills crew owns and ships from its own repo; `browsing` is an upstream,
plugin-sourced skill with a different source root and a presence gate. Keeping it a separate
branch keeps the two concerns — "skills crew owns" vs. "skills crew borrows when available" —
honest.

`runSkillInjection` will need the project config (or at least the `visual_fidelity` flag) and
the resolver result threaded into its options; today it receives only `{ worktree, sourceRoot,
log, warn }`. Extend `SkillInjectionOptions` accordingly.

### Change 6 — rename `lib/playwright/` → `lib/mcp-config/`

> **Project-specific:** directory rename. `lib/playwright/` is not re-exported from
> `packages/cli/src/lib/index.ts`; importers reference `../lib/playwright/index.js` (and a
> couple of deep files) directly. The importers are: `lib/prompts/ticket.ts`,
> `lib/preflight/{run-preflight,probe-app-urls,types}.ts`,
> `lib/run/{app-lifecycle,agent-options,agent-environment}.ts`, and
> `commands/{run,resume,fix-pr}.ts` (plus `commands/run.test.ts`).

Once chrome resolution lives alongside playwright config, the `playwright/` directory name
lies. Rename the directory to `mcp-config/` and update every importer's path. This is a
contained one-pass edit and is in scope for the autonomous PR — the name should not mislead
the next reader.

### Change 7 — rewrite `visual-fidelity-check` Step 5 as live-DOM inspection

> **Project-specific:** `<repo>/.claude/skills/visual-fidelity-check/workflow.md` (Step 5
> section) and `<repo>/.claude/skills/visual-fidelity-check/SKILL.md`.

The content of the Step 5 rewrite is **unchanged from the original spec's Change B2.3 and
B2.4** — five sub-steps (5.1 open, 5.2 navigate, 5.3 computed-style color check, 5.4 rendered
icon check, 5.5 screenshot cross-reference), Step 5 becoming required (not optional) when
`dashboardUrl` is set and chrome is wired, degrading to a verification gap otherwise. See the
original spec sections B2.3/B2.4 for the full sub-step text; it transfers verbatim with two
adjustments:

- The skill files live at `.claude/skills/visual-fidelity-check/`, not the old
  `packages/cli/src/lib/skills/` path.
- All browser actions reference the MCP tool `mcp__chrome__use_browser` (the tool name implied
  by the `chrome` server key from Change 2).

`SKILL.md`'s workflow-overview line for Step 5 and its Related-skills section gain `browsing`
as a peer, as in the original B2.4.

### Change 8 — update `.agents/dispatch.md`

> **Project-specific:** `<repo>/.agents/dispatch.md`.

`dispatch.md`'s "MCP file write" (step 8) and "Skills" sections describe pre-CREW-146
behavior. Update them to cover chrome wiring and the `browsing` injection branch, and add
`packages/cli/src/lib/mcp-config/**` to the doc's `covers:` frontmatter glob (the directory is
new). The `agents-doc-parity-check` skill will flag this doc against the autonomous PR's
changes — folding the update into that PR keeps doc parity intact.

## Execution split

The work divides by one hard constraint: **the `crew run` dispatch sandbox masks crew's own
`.claude/skills/` directory read-only.** Any change that creates or edits files under
`<crew-repo>/.claude/skills/` cannot be an autonomous dispatch — it must be authored in an
interactive session. This is the same constraint that forced CREW-167 to split into an
interactive PR (#221, skill-file relocation) and an autonomous PR (#222, code).

CREW-146 stays a **single Jira ticket** with a split execution and two PRs:

| PR | Scope | Where it runs |
| --- | --- | --- |
| **Interactive** | Change 7 only — the `visual-fidelity-check` Step 5 + `SKILL.md` rewrite. Edits `<repo>/.claude/skills/`. | Authored in an interactive session. **Not** a `crew run`. |
| **Autonomous** | Changes 1–6 and 8 — all CLI code, the directory rename, unit tests, and the `dispatch.md` update. Touches nothing under `<repo>/.claude/skills/`. | `crew run CREW-146`. |

**Recommended order:** the interactive PR lands first. It is small and doc-only, and landing
it first means the feature is coherent the moment the autonomous PR merges (Step 5's workflow
text already references `mcp__chrome__use_browser` by the time the wiring exists). The two are
only loosely coupled — the CLI wiring functions regardless of `workflow.md` content, and the
`workflow.md` rewrite is inert until the wiring exists — so strict ordering is not required,
but interactive-first is cleanest.

## Acceptance criteria

### Autonomous PR (Changes 1–6, 8)

- [ ] `crew run` on a project with `[visual_fidelity]` set writes a worktree `.mcp.json`
      containing a `chrome` server entry pointing at the resolved
      `superpowers-chrome` plugin's `mcp/dist/index.js`.
- [ ] When `[playwright]` is also enabled with smoke on, both `playwright` and `chrome` server
      entries appear in the same `.mcp.json` and do not conflict.
- [ ] When `superpowers-chrome` is not installed (or unbuilt), `crew run` logs exactly one
      `pc.yellow` warning, omits the `chrome` entry, omits the `browsing` skill, and the
      dispatch continues.
- [ ] The worktree's `.claude/skills/` contains `browsing/` when `[visual_fidelity]` is set
      and the plugin resolves; it is absent when the plugin does not resolve.
- [ ] `browsing` is **not** present in `CREW_OWNED_SKILLS`.
- [ ] `packages/cli/src/lib/playwright/` is renamed to `packages/cli/src/lib/mcp-config/` with
      every importer's path updated; typecheck and lint are clean.
- [ ] `.agents/dispatch.md` reflects chrome wiring and the `browsing` injection branch, and its
      `covers:` glob includes `packages/cli/src/lib/mcp-config/**`.
- [ ] Unit tests:
  - `resolveSuperpowersChrome` — returns the pair for an installed+built plugin, picks the
    highest semver across multiple version dirs, returns `null` for missing dir / no valid
    semver / missing `mcp/dist/index.js`.
  - `buildMcpConfig` — emits playwright-only, chrome-only, and both-servers shapes given the
    matching opts.
  - `writeMcpFile` — emits the warning when chrome resolution fails; succeeds and includes the
    `chrome` entry when it resolves.
  - `skill-injection` — `browsing` is injected when `[visual_fidelity]` is set and the plugin
    resolves; not injected when either condition is false.
- [ ] No regression in playwright-only projects: `crew run` on a `[playwright]`-only project
      still emits the playwright-only config with no chrome warning.

### Interactive PR (Change 7)

- [ ] `.claude/skills/visual-fidelity-check/workflow.md` Step 5 is rewritten with sub-steps
      5.1–5.5 per the original spec's B2.3. The old "optional screenshot diff" content is
      removed. Browser actions reference `mcp__chrome__use_browser`.
- [ ] `.claude/skills/visual-fidelity-check/SKILL.md` workflow-overview Step 5 line and
      Related-skills section are updated, with `browsing` listed as a peer.
- [ ] The rewrite specifies the required/skipped/verification-gap behavior: required when
      `dashboardUrl` is set and chrome is wired; verification gap when `dashboardUrl` is set but
      chrome is not wired; skipped when `dashboardUrl` is unset.

## Verification

Per the original spec, crew dogfoods its own gate. CREW-147 already wired `[visual_fidelity]`
into crew's local config, so once both PRs land:

1. A fresh `crew run` against a small CREW-* ticket exercises Steps 1–5 end-to-end, with
   `.mcp.json` carrying the `chrome` entry and `browsing/` present in the worktree.
2. Calibration: in a throwaway worktree, re-introduce a known runtime regression (a
   CREW-135-style color mismatch on a dashboard component) and confirm Step 5.3 catches it via
   a computed-style read where the static Step 3 would not. Record the run under
   `docs/superpowers/skill-fixtures/visual-fidelity-check/crew-self/runs/<date>.md`.

## Non-goals

Unchanged from the original spec: no removal of playwright-mcp (chrome is additive), no
vendoring of the chrome MCP binary, no new `[chrome_browsing]` TOML block (chrome travels with
`[visual_fidelity]`), no live-DOM inspection outside `componentDir`, no auto-install of
`superpowers-chrome` when it is absent.

Additionally out of scope for this re-plan:

- **Vendoring or auto-refresh of the `browsing` skill.** The original spec filed an
  auto-refresh followup against the vendored copy; the runtime-copy design removes the vendored
  copy entirely, so that followup is moot and is not carried forward.
- **Data-attribute conventions for selector reliability.** Step 5.3's CSS selectors remain
  fragile in projects without `data-component` / `data-variant` attributes. Still worth a
  project-level followup if the implementing PR finds the selectors too brittle — carried
  forward from the original spec unchanged.
