# Agent visual verification

**Date:** 2026-05-12
**Status:** Spec — pending implementation plan
**Related context:** CREW-135 (T1 Pill primitives) shipped a PR with outline/icon/padding visual regressions that the agent's self-graded "looks fine" smoke pass missed. This spec addresses that class of failure.

## Context

The Crew dispatch agent already has a working screenshot tool (Playwright MCP in its sandboxed env). What it lacks is:

- A **source-of-truth reference** to compare its rendered output against
- A **structured workflow** that forces a real comparison instead of self-graded eyeballing

CREW-135 illustrates the gap. The agent ran `npm run build`, used Playwright MCP to navigate to the dashboard, screenshotted the agent drawer, and reported in the PR description: *"Visual smoke via Playwright MCP at http://localhost:23655 — agents list, agent drawer, and projects list all render correctly. Buttons + badges show the right colors per state."* User review revealed outline missing, wrong icons, off padding — visual regressions the agent had no way to detect because it had nothing to compare against.

Code Connect `.figma.tsx` files already encode `Component → Figma URL + node ID`. That mapping was authored for human-facing documentation, but it's also exactly the manifest an agent needs to fetch a per-component source-of-truth reference. This spec turns that incidental mapping into operational metadata for an agent self-verification loop.

The work spans **three pieces** that compose into one autonomous verification pass:

1. A **Figma snapshot generator** that exports the relevant Figma file's contents to disk before dispatch (screenshots + structured data + variable definitions).
2. A user-scoped **`visual-fidelity-check` skill** that the agent invokes as a mandatory pre-completion gate, using the snapshot as its source of truth.
3. A **skill validation harness** with known-bad regression fixtures so the skill's accuracy can be calibrated against real failures (starting with CREW-135's current state).

## Scope

In scope:

- New `crew figma-snapshot` CLI subcommand that exports a Figma file to `<worktree>/.crew/figma-snapshot/`.
- Automatic invocation of the snapshot generator as part of `crew run` before agent dispatch.
- New user-scoped skill at `~/.claude/skills/visual-fidelity-check/SKILL.md` that defines the pre-completion verification workflow.
- Project-config surface at `<repo>/.crew/visual-fidelity.json` so the skill can find the dashboard URL + snapshot path + project-specific knobs for any consumer project.
- Skill validation harness at `<repo>/docs/superpowers/skill-fixtures/visual-fidelity-check/` with at least one known-bad fixture (CREW-135's current state).
- Dispatch-prompt update so the agent is told to invoke the skill before claiming a UI-touching task complete.

Out of scope (filed as **near-term followups**):

- Fixing the Playwright e2e test runner's missing chromium binary cache issue — orthogonal to visual smoke (Playwright MCP already works in the sandbox).
- Evaluating superpowers-chrome (CDP) as a replacement for Playwright MCP — current tool works; defer until we have concrete reasons to swap.
- Promoting the skill to plugin-level distribution once a second project uses it (e.g., Recipes).
- The followup-tracking system rethink (priority tier + Jira backlog sync) — separate brainstorm, see `docs/followups.md`.

Explicitly **not** addressing:

- Pixel-perfect automated visual diff (e.g., perceptual hash, BackstopJS). The skill uses structural comparison + agent-driven eyeball comparison against the snapshot reference. Real automated visual diff is a future evolution.

## Architecture

Three components, sequential dependency:

```
crew run <TICKET>
    │
    ├─► [host, pre-dispatch] crew figma-snapshot  ──► writes <worktree>/.crew/figma-snapshot/
    │
    └─► [sandbox, dispatched agent]
            │
            ├─► implementation (edits, tests, build) — normal flow
            │
            └─► [pre-completion gate]  invokes visual-fidelity-check skill
                    │
                    ├─► reads <repo>/.crew/visual-fidelity.json for project config
                    ├─► finds .figma.tsx files for touched components
                    ├─► reads <worktree>/.crew/figma-snapshot/<node>.{png,json}
                    ├─► renders dashboard via Playwright MCP, screenshots same components
                    ├─► structural diff (resolved tokens vs computed CSS classes)
                    └─► visual diff (agent compares Figma snapshot to rendered screenshot)
                    │
                    └─► report → agent iterates if findings, or proceeds to PR
```

Each component has a clear, narrow interface — the snapshot generator only knows how to export Figma data; the skill only knows how to read snapshot data + render the dashboard + compare; the project config only knows project-specific bindings. None of the three depends on internals of the others.

## Piece 1: Figma snapshot generator

### Trigger and output location

`crew figma-snapshot [--out <path>]` is a CLI subcommand in `packages/cli/`. When invoked:

- Reads the calling worktree's `.crew/visual-fidelity.json` to find the Figma file key and which pages to snapshot
- Calls Figma Plugin API (via `mcp__plugin_figma_figma__use_figma` or equivalent) to traverse + export
- Writes output to `<worktree>/.crew/figma-snapshot/` by default

`crew run <TICKET>` calls `crew figma-snapshot` automatically before dispatching the agent. The snapshot is regenerated on every run — keeps it fresh, avoids cache-invalidation logic. ~10s overhead per dispatch.

If the worktree has no `.crew/visual-fidelity.json` (or the project opts out by setting `skipSnapshot: true`), `crew figma-snapshot` is a no-op and `crew run` proceeds without it. Projects with no visual surface (CLI-only, daemon-only) are unaffected.

### Output structure

```
<worktree>/.crew/figma-snapshot/
├── index.json                # manifest: every nodeId → {name, page, screenshot, metadata}
├── variables.json            # ALL Figma variable collections + resolved values per mode
├── composites/
│   ├── 272-120.png           # Pill set overview screenshot
│   ├── 272-120.json          # structural data (see below)
│   └── ...
└── screens/
    ├── 1-756.png
    ├── 1-756.json
    └── ...
```

### Per-component JSON shape

```json
{
  "id": "272:120",
  "name": "Pill",
  "type": "COMPONENT_SET",
  "page": "Composites",
  "screenshotPath": "composites/272-120.png",
  "componentPropertyDefinitions": {
    "Label#272:0": { "type": "TEXT", "defaultValue": "Label" },
    "Has Icon#272:1": { "type": "BOOLEAN", "defaultValue": false },
    "Icon#272:2": { "type": "INSTANCE_SWAP", "defaultValue": "..." }
  },
  "variants": [
    {
      "name": "type=button-sm, color=running, intensity=mid",
      "resolvedStyles": {
        "fills": [
          { "type": "SOLID", "tokenAlias": "tw/colors/slate/1050", "hex": "#0F172A1A" }
        ],
        "strokes": [
          { "tokenAlias": "tw/colors/slate/500", "hex": "#64748B", "weight": 1 }
        ],
        "textColor": { "tokenAlias": "tw/colors/slate/400", "hex": "#94A3B8" }
      },
      "geometry": {
        "height": 32, "paddingTop": 6, "paddingRight": 12,
        "paddingBottom": 6, "paddingLeft": 12,
        "cornerRadius": 6, "itemSpacing": 6
      },
      "font": { "family": "Hanken Grotesk", "weight": "Medium", "size": 14 }
    }
  ],
  "designContext": "<button className='h-8 px-3 rounded-md bg-slate-1050 border border-slate-500 text-slate-400'>...</button>"
}
```

Per-instance metadata (for screen nodes) records what component each instance points at and which overrides are set, so the agent can answer "what variant of Pill is this Edit button supposed to be?" by reading the screen JSON.

### `variables.json` shape

```json
{
  "collections": [
    {
      "name": "Crew / Semantic Colors",
      "modes": ["Default"],
      "variables": [
        {
          "name": "state/running",
          "type": "COLOR",
          "valuesByMode": {
            "Default": { "alias": "tw/colors/slate/400", "hex": "#94A3B8" }
          }
        }
      ]
    }
  ]
}
```

### Dependency on Figma access

The CLI runs on the **host**, not in the sandbox — it has access to the same Figma MCP server that this brainstorming session has been using. No new auth path, no sandbox network changes. The sandbox agent reads from disk only.

If a future use case needs the agent itself to call Figma (e.g., agent decides to inspect a node not currently in the snapshot), that's a separate followup. The current design assumes the snapshot is complete enough that the agent never needs live Figma access during its run.

## Piece 2: `visual-fidelity-check` skill (user-scoped)

### Location

`~/.claude/skills/visual-fidelity-check/SKILL.md`. User-scoped so it applies to every project the user works on. Project-specific bindings (dashboard URL, snapshot path, Figma file key) come from `<repo>/.crew/visual-fidelity.json` at invocation time. Skill content is generic; the bindings make it work for any project that opts in.

### Project config shape

```jsonc
// <repo>/.crew/visual-fidelity.json
{
  "figmaFileKey": "9FeJPriqdsdA4n9R5Xsrr8",
  "figmaPages": ["Composites", "Dashboard Screens"],
  "snapshotPath": ".crew/figma-snapshot",
  "dashboardUrl": "http://localhost:23655",
  "componentDir": "packages/dashboard/src/components",
  "codeConnectGlob": "**/*.figma.tsx"
}
```

Resolves variables like `${DASHBOARD_URL}` from `env.toml` if present (same materialization path as the existing crew env system).

### Skill workflow (when fired)

The skill is a **mandatory pre-completion gate** for any task that touches files matching the project's `componentDir` or that creates/modifies `.figma.tsx` files. The dispatch prompt instructs the agent: *"Before claiming any UI-touching task complete, invoke the `visual-fidelity-check` skill."*

Inside the skill, the agent runs through this loop:

1. **Identify touched components.** Read `git status` for modified/added `.tsx`/`.figma.tsx` files under `componentDir`.
2. **Map each to its Figma reference.** For each touched component, find the sibling `.figma.tsx`. Extract the `figma.connect(Component, '<url>')` URL → parse out the node ID.
3. **For each (component, nodeId) pair, perform two checks:**
   - **Structural check.** Read `snapshotPath/composites/<node>.json` and `variables.json`. For each variant, compute what the rendered className should resolve to (using the resolved Tailwind tokens). Compare to the component's actual cva output. Surface any mismatch (e.g., "Figma says variant `type=button-sm, color=running, intensity=mid` has `border-slate-500`, but code emits `border-slate-700`").
   - **Visual check.** Use Playwright MCP to navigate to the dashboard, render a known instance of the component (the dashboard's existing demo / page that uses it). Screenshot. Compare side-by-side against `snapshotPath/composites/<node>.png` — agent describes what it sees in both and identifies differences.
4. **Compile report.** Markdown-format summary of findings, grouped by component. Each finding tagged as either `structural` (token mismatch, computable) or `visual` (eyeball-level, agent-judgment).
5. **Iterate or proceed.** If findings exist, agent fixes and re-runs the skill. Empty report = proceed to PR creation.

### What the skill is NOT

- Not a substitute for the existing `npm run typecheck`/`lint`/`test`/`build` gates — those still run first.
- Not a pixel-diff tool. The visual check is agent-driven structural-text comparison ("does the screenshot have a visible border?"), not perceptual hashing. Tradeoff: catches the class of issues that bit CREW-135 (outline missing, wrong icons) without the operational cost of a real diff engine.
- Not a replacement for human review. Final PR review remains the user's. The skill catches the *self-graded* false positives.

### Skill structure

```
~/.claude/skills/visual-fidelity-check/
├── SKILL.md              # YAML frontmatter (name, description, when-to-use)
├── workflow.md           # The detailed steps + report template (see "Skill workflow" above)
└── examples/
    ├── good-report.md    # What a clean run looks like
    └── findings-report.md # What a run with discovered issues looks like
```

`SKILL.md` declares the skill's trigger criteria so the agent reaches for it correctly: "Use when about to claim any UI-touching task complete, before creating a PR. Triggers on file changes in a project's componentDir."

## Piece 3: Skill validation harness

### Purpose

A skill's prompt is its surface; like any prompt, it can be precise or vague. Without testing, "the skill exists" doesn't mean "the skill works". The harness lets us:

1. Seed known-bad fixtures (e.g., CREW-135's current PR state)
2. Run the skill against each fixture
3. Have a human (user) review the skill's findings: which findings were accurate? Which were missed? Which were false positives?
4. Iterate the skill prompt based on findings, re-run, compare

### Fixture structure

```
<repo>/docs/superpowers/skill-fixtures/visual-fidelity-check/
├── README.md             # how to run the harness, how to add fixtures
├── crew-135/
│   ├── description.md    # what's wrong in this fixture (ground truth)
│   ├── snapshot/         # the Figma snapshot at the time of the fixture
│   ├── rendered/         # captured screenshots of the actual rendered output
│   ├── expected/         # what the skill SHOULD report — ground-truth findings
│   └── runs/             # actual skill outputs from each iteration
│       ├── 2026-05-12-run-01.md
│       └── ...
└── _template/            # boilerplate for adding new fixtures
```

`description.md` for `crew-135` would look like:

```markdown
# CREW-135 fixture (T1 Pill primitives)

PR #177 shipped with these regressions vs Figma:
- Outline (border) missing on `<Button color="running" intensity="mid">` — code uses `border-transparent`, Figma binds `border-slate-500`
- Icon component for close button (button-icon-sm/running/ghost) renders the default git-pull-request glyph instead of lucide/x
- Padding on `<Button size="sm">` is 8px each side; Figma spec is 12/6
```

### Validation loop

```
1. User runs the skill against a fixture (locally, not in dispatched agent context)
2. Skill produces a findings report → written to runs/YYYY-MM-DD-run-NN.md
3. User reviews the report side-by-side with expected/
4. User annotates: which findings were correct, which were misses, which were false positives
5. If accuracy < acceptable, user edits SKILL.md → workflow.md, re-runs
6. Loop until skill catches all expected findings with minimal false positives
```

The harness intentionally has a user-in-the-loop step. There's no automated scoring for "the agent's prose findings match the expected prose findings" — that's an LLM-judge problem we're not solving here. The user reviews and iterates.

### First fixture: CREW-135

Seed the harness with the actual CREW-135 PR state. Its visual regressions are real, well-understood (user has already eyeballed them), and the file-level changes are bounded. Makes it the perfect first calibration target.

## Dispatch flow integration

### `crew run` modifications

1. **Pre-dispatch.** After env materialization and worktree prep, call `crew figma-snapshot --out <worktree>/.crew/figma-snapshot` if the worktree has `.crew/visual-fidelity.json`. Pipe output to `/tmp/crew-figma-snapshot-<KEY>.log` to match the existing `/tmp/crew-docker-<KEY>.log` + `/tmp/crew-playwright-<KEY>.log` pattern. Surface a one-line "snapshot generated (~N nodes)" or error-summary line in the `crew run` stream.
2. **Run-prompt.** Append a "Visual verification gate" section to the dispatched agent's run prompt: *"Before claiming any UI-touching task complete (file changes under `<componentDir>`), invoke the `visual-fidelity-check` skill. The skill expects to find a snapshot at `<snapshotPath>` (already generated for this run) and project config at `<repo>/.crew/visual-fidelity.json`."*

### `.claude/settings.json` updates

- No `filesystem.allowWrite` additions needed — the agent only reads from `.crew/figma-snapshot/`, and the worktree's own files are already readable by default in the sandbox config.
- No MCP server additions — Figma access is host-side only.
- No network allowlist changes — sandbox agent never reaches Figma.

### Failure modes

- **Snapshot generation fails.** `crew run` surfaces the error and prompts: continue without snapshot (skill becomes no-op for this dispatch) vs abort. Default to surface-and-continue with a warning so a one-off Figma outage doesn't block dispatch.
- **Snapshot exists but is stale (Figma changed since dispatch).** Out of scope; the dispatch's snapshot is what the agent works against. If Figma changes mid-dispatch, the agent verifies against the old reference. This is a known limitation; re-running `crew restart` regenerates.
- **Agent skips the skill anyway.** Run prompt is the enforcement; if agents drift, sharpen the prompt or add a CI-side check that scans the agent transcript for the skill invocation before merging. Out of scope for v1.

## Testing strategy

- **Snapshot generator unit tests** — fixtures of Plugin API responses, assert output structure conforms to the documented schemas. Lives in `packages/cli/`.
- **Skill workflow tests** — the harness above. User-in-the-loop validation against fixtures.
- **Integration smoke** — after implementation, dispatch a no-op CREW ticket with the skill enabled. Confirm the dispatch flow runs `crew figma-snapshot`, the agent finds the snapshot, invokes the skill, and exits cleanly.

## Followups + open items

Filed as **near-term** followups (these should follow this work closely, not back-burner):

- **Playwright e2e chromium binary cache fix** — separate from visual smoke. The test runner binary path is broken; orthogonal to this spec. Filed alongside.
- **superpowers-chrome evaluation** — assess whether CDP-based browsing (BETA at time of writing) provides screenshot+diff ergonomics the current Playwright MCP doesn't. Only worth swapping if there's a concrete win.

Filed as **long-tail** followups:

- **Plugin-level distribution of the skill** — once a second project (Recipes?) needs it, promote `visual-fidelity-check` from `~/.claude/skills/` to a proper plugin with versioning.
- **Automated visual diff engine** — replace the agent-driven eyeball comparison with a real perceptual diff (pixelmatch, BackstopJS, or similar). Defer until the structural+eyeball approach hits its accuracy ceiling.
- **Snapshot caching** — currently regenerated every dispatch. If snapshot generation becomes slow (large Figma files), add cache-by-file-version logic.

Already-filed sibling followup:

- **Rethink followup-tracking system (priority tier + Jira backlog sync)** — see `docs/followups.md`. The "near-term vs long-tail" tagging used in this spec is an informal first pass at the priority concept that followup will formalize.

## Open questions

None remaining at spec time. All scope, architecture, and validation decisions are settled in the conversation that produced this spec.
