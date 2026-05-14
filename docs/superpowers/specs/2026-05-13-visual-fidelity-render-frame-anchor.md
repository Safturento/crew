# Visual-fidelity-check: render-frame as canonical truth

## Context

CREW-135 has shipped a visible regression three times in a row (PR #177, PR #188, PR #193), each time against a different "fix":

| PR   | Fix that failed                                                      | Specific regression that slipped through                                                                                                                                                                                                                                                                                                                                                     |
| ---- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #177 | Original Pill primitives plan                                        | State badges shipped with `intensity="muted"` (CSS dot) instead of `intensity="mid"` (lucide icon, mid stroke).                                                                                                                                                                                                                                                                              |
| #188 | None (faithful re-run of the same plan)                              | Same `intensity="muted"` regression, plus icon mismatches and trailing Unicode glyphs.                                                                                                                                                                                                                                                                                                       |
| #193 | Thread A spec/plan correction + B1 visual-fidelity-check enforcement | `intensity="muted"` fix landed correctly; new regression: "New Run" button uses `color="white" intensity="loud" size="xs"` when Figma actually renders `color="idle" intensity="loud" size="sm"`. Per-state badge icons (`AlertCircle`, `AlertOctagon`, `Loader2`, `GitPullRequest`, `Check`) invented semantically — Figma's design uses a single `lucide/circle` across every state badge. |

PR #193 is the most informative failure: B1's enforcement worked (the skill fired, the report appeared in the PR description), Thread A's spec correction landed (`intensity="muted"` → `intensity="mid"`, CSS dot → lucide icon slot). The skill produced a clean-looking report with 6 low-severity findings. And the user still saw broken output, because every layer compared code against the **Pill component set** (`272:120`) — its variants, its default property values, its sample fills — when the actual question was _"what variant does the rendered call-site at this specific Figma node use?"_

The component **set** defines what's possible. A render **composite** (TopNav at `245:133`, AgentRow per-state at `212:911…212:1031`, etc.) defines what's actually used at a specific call-site. The set says white-loud has fill `zinc/50`. The composite says TopNav's New Run is `color=idle, intensity=loud, size=sm` with fill `state/idle` (#64748B). Different question, different answer, different bug.

The same "diff against the set, not the composite" pattern is codified in three places:

- **Thread A spec/plan** (`docs/superpowers/plans/2026-05-13-pill-contract-correction.md:709`): encodes `variant="default"` → `color="white" intensity="loud"` as a guess made from Pill-set reasoning, never verified against TopNav's render frame.
- **Skill workflow** (`packages/cli/src/lib/skills/visual-fidelity-check/workflow.md` Step 4): treats the caller's prop choice as authoritative; diffs against the set variant that matches those props.
- **Skill example** (`packages/cli/src/lib/skills/visual-fidelity-check/examples/findings-report-example.md` Finding 4): literally demonstrates the set-vs-code diff pattern as "what a good finding looks like."

Spec author, skill workflow, and skill example all reinforce the same wrong primary anchor. The agent on PR #193 followed all three faithfully and produced a confidently-wrong report. The next attempt will repeat the failure unless the anchor moves.

This spec re-anchors the visual-fidelity pipeline on **render composites** as the canonical truth. Spec authors verify against them; the skill diffs against them; the example demonstrates the pattern; the fixture captures them as first-class data.

This spec also folds in a placement correction for the skill itself, surfaced during brainstorming — the skill source-of-truth moves from `packages/cli/src/lib/skills/visual-fidelity-check/` to `<repo>/.claude/skills/visual-fidelity-check/`, and the dispatcher-injection module shipped in CREW-144 becomes deletable. The B1.2 architecture solved a problem that doesn't exist (sandbox `denyWithinAllow` is a write deny — read auto-discovery works fine).

## Goals

1. Make the **rendered call-site Figma node** the single primary anchor across fixture, spec, and skill. No path through the pipeline that reaches a final answer using only component-set data.
2. Encode the discipline structurally — not as authoring exhortation. Both the data and the workflow point at render composites by default; falling back to set-only reasoning is an explicit failure mode the skill surfaces, not a quiet default.
3. Simplify the skill's source-of-truth placement: `<repo>/.claude/skills/visual-fidelity-check/`, auto-discovered by Claude Code, no dispatcher injection.

## Non-goals

- **Autonomous rendered-screenshot capture.** Still B2's territory (`docs/superpowers/specs/2026-05-13-superpowers-chrome-agent-integration.md`). This spec works from snapshot composites + caller code; it doesn't add browser-rendered comparison.
- **Snapshotting additional pages beyond the existing `Composites` page.** The crew Figma file's single page (`212:630`) covers every primitive and composite this spec cares about. Multi-page expansion is out of scope.
- **Generalizing render-composite captures to other projects.** The data shape changes here are figma-snapshot generic, but the migration only covers crew's fixture. Recipes-App's fixture refresh is a separate concern.
- **Per-project skill-injection policy.** With the skill at `<repo>/.claude/skills/`, every worktree of a repo has every skill the repo ships. Whether other projects want this skill is "vendor your own copy" until plugin distribution exists.

## Design

### §1 — Fixture data: enrichment captures nested-instance overrides

> **Project-specific:** changes land in `packages/cli/src/lib/figma-snapshot/plugin-api-enrichment.ts` and the associated `enrichment-prompt.ts`. Tests in `plugin-api-enrichment.test.ts`. Snapshot output dir convention unchanged (`<fixture-root>/snapshot/composites/<node-id>.json`).

The figma-snapshot module today emits a JSON file per top-level child of the `Composites` page. Component sets (e.g., `272-120.json` = Pill set) carry a `capturedVariants` array — sample variants with their geometry, fills, strokes, and text styles. Composites that _contain_ instances of other components (e.g., TopNav at `245:133` contains a Pill instance for the New Run button) get a top-level JSON but with no walked-tree of nested instances. The skill therefore can't ask "what variant does this Pill instance render as?" without going back to the live Figma file.

The enrichment pass walks each composite's tree and, for every node that is an instance of another component, emits a `componentInstances` entry:

```jsonc
{
  "id": "278:1622",
  "name": "Pill",
  "path": ["right", "Pill"],
  "mainComponentSetId": "272:120",
  "variantOverrides": "type=button-sm, color=idle, intensity=loud",
  "componentPropertyOverrides": {
    "Has Icon": true,
    "Icon": "lucide/plus",
    "Label": "New Run",
  },
  "resolvedStyles": {
    "fills": [{ "hex": "#64748B", "tokenAlias": "state/idle", "opacity": 1 }],
    "strokes": [],
    "textColor": { "hex": "#020617", "tokenAlias": "state/foreground" },
  },
}
```

Field rationale:

- `mainComponentSetId` + `variantOverrides` — answer "what variant of which set is this instance?", which is the question the skill is currently failing to ask.
- `componentPropertyOverrides` — captures `INSTANCE_SWAP` resolutions (Icon: `lucide/plus`), `BOOLEAN` toggles (`Has Icon: true`), and `TEXT` overrides (`Label: "New Run"`). The Label is load-bearing for instance matching when a composite contains multiple instances of the same set (TopNav has both a Pill for "New Run" and a Pill for "Clear attention"'s count — the skill differentiates them by Label).
- `resolvedStyles` — final-rendered fills, strokes, text color. Lets the skill detect instance-level style overrides on top of the variant choice (rare but possible, and the skill should catch them).
- `path` — breadcrumb from the composite's root, useful for matching code structure to Figma structure and for human-readable findings.

Walk scope per composite:

- Recursive descent through children.
- Any node whose Figma `type == 'INSTANCE'` (instance of a `COMPONENT` or `COMPONENT_SET`) emits a `componentInstances` entry.
- Non-instance frames (plain layout containers) emit nothing — they contribute structure but no variant decisions.
- Walk halts at depth ≥ 6 with a warning entry, to bound cost; a deeper composite is a fixture-design problem worth surfacing.

Scope of this round (which composites get the new walk):

- All top-level children of `Composites` page (`212:630`) in file `9FeJPriqdsdA4n9R5Xsrr8`. This already includes `TopNav` (`245:133`), `AgentRow` (`212:910`), `AgentBody` (`220:246`), `ProjectRow` (`220:300`), `ProjectHeader` (`220:315`), `ProjectSection` (`220:224`), `Modal` (`355:238`) and its content variants, `Switch` (`335:242`), `FormField` (`337:234`), `Input` (`318:230`).
- Component sets (Pill `272:120`, etc.) continue to carry `capturedVariants` as today — they're still useful as definitions of what's possible.

Output stays under `<fixture-root>/snapshot/composites/<node-id>.json` — same filename pattern, additional fields in the JSON.

### §2 — Skill Step 4 rewrite + new severity rules

> **Project-specific:** edits land in `packages/cli/src/lib/skills/visual-fidelity-check/workflow.md` (current path; moves under §8). No code-level tests — the workflow is markdown, not code; behavioral verification rides on §7's re-run against PR #193's codebase.

Step 4 (Caller check) today reads, in effect: _"For each caller, look at its props. Look up the matching component-set variant. Diff against the variant's `resolvedStyles`."_ This is what the agent followed on PR #193 — and produced an internally-consistent, render-blind report.

New Step 4: _"For each caller, identify its render-composite Figma node (via the caller's `.figma.tsx` Code Connect mapping, or via the nearest documented render frame). Find the relevant nested instance(s) inside the composite — match by `Label` first, then by `path`, then by position. Read `variantOverrides` and `componentPropertyOverrides`. Diff caller's props against the render's variant + property values, not against the set's general definitions."_

New severity rules (anti-loophole):

- **HIGH (encoding error):** caller passes a `color`, `intensity`, `size`, or any other variant-axis prop that doesn't match the render composite's `variantOverrides` for that call-site. Example: caller has `<Button color="white" intensity="loud" size="xs">` but the render composite shows `variantOverrides: "type=button-sm, color=idle, intensity=loud"`. Wrong variant entirely — not a token delta. Flag as encoding error; the bug is either in the code or the upstream spec.
- **HIGH (missing data, blocking):** caller has no matching render composite in the fixture. Surface as _"cannot verify call-site X — render composite Y not in fixture; run figma-snapshot to capture before proceeding"_. Do **not** silently fall back to set-only diffing. Falling back is the regression mode we're closing.
- **MEDIUM (instance-level override):** caller's props match the render composite's `variantOverrides` BUT the composite carries a `resolvedStyles` override that the caller's surface classes don't reproduce (e.g., a custom fill on top of an `idle, loud` instance). Flag with the specific hex + token alias from `resolvedStyles`.

Step 4 sub-flow:

```
For each caller in the touched files diff:
  1. Find the .figma.tsx in the same directory (or referenced from the file).
  2. Resolve the .figma.tsx's URL to a {fileKey, nodeId}.
  3. Open <fixture-root>/snapshot/composites/<nodeId>.json.
  4. If file missing → HIGH (missing-data, blocking). Stop this caller; move to next.
  5. For each instance-of-shared-primitive the caller renders:
       a. Match to a `componentInstances` entry via Label, then path, then position.
       b. If no match → MEDIUM (verification-gap): "caller renders <Primitive>
          but no matching instance found in composite". Continue.
       c. If matched: diff caller props vs entry.variantOverrides.
            - Any mismatch on a variant axis → HIGH (encoding error).
       d. Diff entry.componentPropertyOverrides vs caller's prop values for
          Has Icon / Icon / Label.
            - Icon name mismatch (caller passes <Plus/>, override is `lucide/check`) → HIGH.
            - Has Icon mismatch (caller passes icon when override is false, or
              vice versa) → MEDIUM.
       e. Diff entry.resolvedStyles vs the surface classes the caller's props
          would emit.
            - Variant match but instance has fill/stroke override → MEDIUM.
```

This sub-flow is mechanical enough that the agent can follow it as a checklist — no judgment calls about what "the right reference" is.

### §3 — Skill example rewrite: `findings-report-example.md`

> **Project-specific:** edits land in `packages/cli/src/lib/skills/visual-fidelity-check/examples/findings-report-example.md` (current path; moves under §8).

The existing Finding 4 codifies the wrong pattern. Replace it with the New Run case as concrete material — the bug is recent and the contrast against the right pattern is sharp:

````markdown
### Finding: "New Run" button uses wrong Pill variant entirely

- **Kind:** caller (encoding error)
- **Severity:** HIGH
- **File:** `packages/dashboard/src/components/TopNav.tsx:53-60`
- **Code:**
  ```tsx
  <Button color="white" intensity="loud" size="xs" icon={<Plus />}>
    New Run
  </Button>
  ```
````

- **Render composite:** `composites/245-133.json` variant `"Active Tab=agents"`
  → `componentInstances` entry matching `Label == "New Run"`:
  `variantOverrides: "type=button-sm, color=idle, intensity=loud"`,
  `resolvedStyles.fills[0]: { hex: "#64748B", tokenAlias: "state/idle" }`,
  `resolvedStyles.textColor: { hex: "#020617", tokenAlias: "state/foreground" }`.
- **Diff:** code chose `white / loud / xs` (white CTA, h-6, 12px font, 12px icon).
  Figma renders `idle / loud / sm` (slate-500 CTA, h-8, 14px font, 16px icon).
  Three axes wrong: color, size, and the consequent geometry/typography.
- **Fix:**
  ```tsx
  <Button color="idle" intensity="loud" size="sm" icon={<Plus />}>
    New Run
  </Button>
  ```
  Drop the `font-semibold` className override — `font-medium` is the Button default and matches Figma's Hanken Grotesk Medium.
- **Why high-severity:** caller chose a variant Figma doesn't use at this call-site. Not a token delta — wrong variant entirely. Per SKILL.md "set vs composite" anti-loophole: never reach this conclusion by diffing against the Pill set's white-loud variant.

```

Also rewrite Finding 1 (state-badge `intensity` mismatch) to reference the per-state render composite instead of the Pill set's `intensity=mid` general definition. Same data; correct anchor.

### §4 — Anti-loophole rule in `SKILL.md`

> **Project-specific:** addition lands in `packages/cli/src/lib/skills/visual-fidelity-check/SKILL.md` (current path; moves under §8).

Prominent paragraph alongside the existing "Icon findings are NEVER judgment calls" anti-loophole:

> **The "set vs composite" rule.** A component **set** (e.g., the Pill set at `272:120`) defines what variants are *possible*. A render **composite** (e.g., TopNav at `245:133`, AgentRow at `212:910`) shows what variant Figma *actually uses* at a specific call-site. Never diff against a set variant when a render composite exists for the call-site. If a caller's render composite is missing from the fixture, surface it as a fixture gap (HIGH, blocking) — do not silently fall back to set-only diffing. Set-only diffs are valid only when the caller has no render-composite reference (e.g., a primitives demonstration page or a standalone-component test fixture).

Reason this lives in SKILL.md rather than workflow.md: the workflow describes *what to do*; SKILL.md is the *why*. Anti-loopholes live at the why layer so future workflow edits can't accidentally undo the discipline by reorganizing steps.

### §5 — Pre-authoring rule

> **Project-specific:** addition lands in `packages/cli/src/lib/skills/visual-fidelity-check/SKILL.md` (current path; moves under §8).

Short "Before authoring specs" section, separate from the gate workflow:

> **Before writing a spec or plan that touches a shared UI primitive (Pill, Input, Switch, Modal, etc.), verify the fixture's render composites cover every caller in scope.** Open each render composite and copy the `variantOverrides` for the call-sites you'll touch — these are what your spec's caller→variant mapping must encode. Don't author "default → white-loud"-style mappings from set-variant reasoning; that's how the same error keeps slipping back in. If a caller's render composite is missing, expand the snapshot (or scope-extend an existing run) before continuing.

Where this lives: in SKILL.md alongside the workflow, as an upstream sibling section. The skill is the canonical doc for "how to keep code aligned with Figma"; spec authoring is upstream of code. Placing the rule elsewhere (brainstorming, writing-plans, CLAUDE.md) means the discipline lives apart from the gate that catches its absence — and either drifts or duplicates.

### §6 — Migration: backfill render composites for the crew DS fixture

> **Project-specific:** task lands in `docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/snapshot/composites/`. Replace the current sparse fixture (`272-120.json`, `243-120.json`, `screens/1-756.png`) with a full set of render-composite JSONs for every top-level child of the Composites page (`212:630`).

Procedure:

1. Ship §1's enrichment changes to `plugin-api-enrichment.ts`.
2. Run `figma-snapshot` against the crew Figma file (`9FeJPriqdsdA4n9R5Xsrr8`) targeting `Composites` page. The enrichment pass produces one JSON per top-level child, each carrying `componentInstances` for its nested-instance tree.
3. Replace `docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/snapshot/composites/` with the new output. Keep the `crew-135` fixture name (it's still the reference fixture for the CREW-135 visual-verification ultimate test).
4. Spot-verify: open `245-133.json` (TopNav). Confirm the New Run Pill instance has `Label: "New Run"`, `variantOverrides: "type=button-sm, color=idle, intensity=loud"`. Confirm the Clear-attention count Pill has `Label: "3"`, `variantOverrides: "type=pill, color=waiting, intensity=mid"`. Confirm `212:910` (AgentRow) has 7 variants (one per state), each containing a Badge instance with the resolved per-state icon name.

One-shot data refresh. No per-call code edits, no migration scripts.

### §7 — Validation

After all changes land, re-run the CREW-135 dispatch (or the visual-fidelity-check skill against the existing PR #193 codebase, manually) and verify:

- The findings report contains a **HIGH-severity** finding for `TopNav.tsx`'s New Run button: caller passes `color="white" intensity="loud" size="xs"`, render composite says `idle / loud / sm`. Fix is the corrected variant.
- The findings report contains a **HIGH-severity** finding (or N findings, one per state) for `AgentRow.tsx`'s state badge icons: caller passes `<AlertCircle/>`, `<AlertOctagon/>`, `<Loader2/>`, `<GitPullRequest/>`, `<Check/>` per state; render composite says every state badge uses `lucide/circle`. Fix: every state passes `<Circle className="fill-current" />`, or Badge defaults the icon slot to that.
- The findings report contains a **HIGH-severity** finding (or note) about the spurious `border ${solidBorder}` in `pillSurfaceClasses(_, 'loud')`: Figma's render composites for any `intensity=loud` instance have no stroke. Code currently adds a border to every loud surface.
- No medium/low-severity findings would have been classified as "judgment calls" or "cosmetic" under the new rules.

Acceptance: every one of the three regressions from PR #193 is caught at HIGH severity. If any slip through, that becomes a new spec input.

### §8 — Architectural simplification: skill at `.claude/skills/`

> **Project-specific:** move the skill source-of-truth from `packages/cli/src/lib/skills/visual-fidelity-check/` to `<repo>/.claude/skills/visual-fidelity-check/`. Delete the dispatcher-injection module CREW-144 added (`packages/cli/src/lib/skills/skill-injection.ts`, `packages/cli/src/lib/run/skill-injection-step.ts`, the build-script that materializes skills, the run.ts wiring). Skill files ride along with `git worktree add` automatically because they're tracked in git under `.claude/skills/`.

Rationale: the B1.2 spec rejected `<repo>/.claude/skills/` on the premise that "the sandbox blocks writes there, so agents can't edit the skill." Half true: the sandbox does block writes, but Claude Code's *project-level skill discovery* is read-only (auto-discovery happens via `readSkillsFromRoot(...)` in `packages/cli/src/lib/prompts/skills.ts`). Reads work fine. Edits to the skill happen in user-driven chat sessions where the user can grant write permission — never through autonomous `crew run` dispatch, per the "Don't ticket — handle manually" rule in user CLAUDE.md.

Removing the injection module simplifies the pipeline:

- Skill files are git-tracked and auto-included in every worktree checkout.
- No build step required (skills are markdown, not compiled artifacts).
- No per-worktree materialization, no copy-into-`.claude/skills/` step, no conditional injection based on per-project config.
- The "should this skill fire?" decision continues to be made at the prompt-template level (numbered step 8 only renders when project config has visual-fidelity wired up). File availability and gate activation stay decoupled.

Net deletion in CREW-144's surface: ≈80%. The injection module's `skillsApplicableTo(config)` selector, `copySkillIntoWorktree()` writer, and the run.ts wiring all go. The build-script that copies skill dirs into worktrees gets removed. The PreToolUse hook (CREW-145) is unaffected — it reads the worktree's `.claude/settings.json` and the session transcript, neither of which moves.

Concurrent changes to `packages/cli/src/lib/prompts/skills.ts`: the existing `readSkillsFromRoot(join(opts.repoPath, '.claude', 'skills'), 'project')` call already discovers project-level skills from `.claude/skills/`. The visual-fidelity-check skill, post-move, is discovered through that existing path — no code change needed in skills.ts.

The user-level fallback copy at `~/.claude/skills/visual-fidelity-check/` (left in place during B1's transition) can be removed once §8 ships — every crew checkout now has the skill via `<repo>/.claude/skills/`.

## Acceptance criteria

- `plugin-api-enrichment.ts` walks each `Composites`-page child's instance tree and emits a `componentInstances` array per composite. Each entry has `id`, `name`, `path`, `mainComponentSetId`, `variantOverrides`, `componentPropertyOverrides`, and `resolvedStyles`. Tests cover: a leaf composite, a nested composite, an instance whose Icon INSTANCE_SWAP is overridden, an instance whose Label is overridden.
- `docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/snapshot/composites/` contains one JSON file per top-level child of the crew file's Composites page (≥10 files), each with the new shape. The Pill set's JSON (`272-120.json`) retains `capturedVariants` as today (sets and composites have complementary roles).
- `<repo>/.claude/skills/visual-fidelity-check/SKILL.md` contains the new "set vs composite" anti-loophole paragraph and the "Before authoring specs" pre-authoring section.
- `<repo>/.claude/skills/visual-fidelity-check/workflow.md` Step 4 reflects the new sub-flow (find render composite → find instance → diff variant overrides) with the new severity rules.
- `<repo>/.claude/skills/visual-fidelity-check/examples/findings-report-example.md` Finding 4 demonstrates the render-composite-vs-code diff pattern using the New Run case. Finding 1 references the per-state render composite breadcrumb instead of the Pill set's `intensity=mid` general definition.
- `packages/cli/src/lib/skills/visual-fidelity-check/` is removed (moved under `.claude/skills/`).
- `packages/cli/src/lib/skills/skill-injection.ts`, `packages/cli/src/lib/run/skill-injection-step.ts`, and the run.ts wiring that called it are removed. Associated tests removed.
- Manual or automated re-run of visual-fidelity-check against PR #193's codebase surfaces HIGH-severity findings for: (a) New Run variant mismatch, (b) per-state badge icon mismatch, (c) spurious border on `intensity=loud`. None classified as low/cosmetic.

## Verification

Empirical verification rides on §7. The minimum bar: every regression visible in PR #193 must be caught at HIGH severity by the updated skill + fixture, with no further code changes or process steps required from the agent. If the regression that prompted this spec doesn't get caught, the spec didn't work.

Additionally: a smaller verification — open `composites/245-133.json` after §6's migration and confirm the New Run instance carries `variantOverrides: "type=button-sm, color=idle, intensity=loud"`. If the figma-snapshot output doesn't capture this correctly, §1's enrichment isn't working.

## Dependencies and order

- **§1 (enrichment) and §6 (migration) must ship before §7 can validate.** The new data has to exist before the skill can read it.
- **§8 (placement) is independent.** Can ship before or after §1–§6 without affecting them. Recommended to ship early so subsequent edits land at the final path.
- **§2 (workflow) and §3 (example) depend on §1's data shape being finalized.** Reference the new field names accurately.
- **§4 (anti-loophole) and §5 (pre-authoring) are content-only.** Can land in the same PR as §2/§3 or earlier.
- **No external dependencies.** This spec is self-contained within the crew repo.

## Out of scope

- Autonomous rendered-screenshot capture (B2's territory — `docs/superpowers/specs/2026-05-13-superpowers-chrome-agent-integration.md`).
- Capturing render composites for non-crew projects (Recipes-App's fixture refresh, when/if it gets visual-fidelity wired up).
- Generalizing the "anti-loophole + render-composite anchor" pattern to non-pill primitives at this layer. The data shape supports it (Input, Switch, Modal all emit `componentInstances`); the skill workflow needs no per-primitive specialization.
- A separate companion convention doc in `~/.claude/conventions/` for design-system spec authoring. §5's pre-authoring rule lives in SKILL.md instead; if the rule turns out to apply broadly enough to need a generic convention, that's a future-spec concern.
- Replacing the `findings-report-example.md` Finding 5 (Unicode arrow vs lucide icon) — the existing finding is correctly framed and remains a good icon-mismatch example.

## Forward path

If this spec works, every layer in the visual-fidelity pipeline anchors on render composites by default. The failure modes we hit on PR #177, PR #188, and PR #193 become structurally hard to reproduce: spec authors look at composite JSONs; skill workflow checks code against composite JSONs; example demonstrates the pattern. The Pill set definition becomes a secondary reference — useful for "what's even possible?" questions, not for "what should this caller render?" questions.

If even one regression slips through after this spec ships, it surfaces either (a) a data gap (composite JSON missing or malformed), (b) a workflow gap (Step 4 sub-flow doesn't cover the case), or (c) a discipline gap (agent skipped a sub-flow step). Each maps to a concrete next-spec input rather than another round of "make the skill better."

B2 (chrome integration) extends the same anchor philosophy with rendered-screenshot capture: the screenshot becomes a third axis of comparison (against the composite's resolvedStyles, plus the composite's screenshot, plus the live browser render). This spec ships independently.
```
