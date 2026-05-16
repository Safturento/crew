# Visual-fidelity-check workstream close-out — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the visual-fidelity-check workstream close-out — freeze a fragile fixture, reconcile stale plan docs, record why skill injection is load-bearing, update followups, and re-plan Epic CREW-148 in Jira — so the workstream has a clean, coherent path to closure.

**Architecture:** This is a documentation + project-admin close-out, not a code change. Tasks 1–6 are git-tracked edits on branch `docs/crew-148-visual-fidelity-closeout` (PR #227); Task 7 is a Jira re-plan executed via the Atlassian MCP. The interactive skill-content pass (WS5 / CREW-151) is *not* executed here — Task 2 produces its consolidated task list, and the user triggers it later.

**Tech Stack:** Markdown, git + `gh`, Jira via the Atlassian MCP (Rovo `editJiraIssue` / `createJiraIssue` / `transitionJiraIssue` with ADF).

**Spec:** `docs/superpowers/specs/2026-05-16-visual-fidelity-closeout-design.md`. Read it before starting — this plan implements its WS1–WS5.

---

## File structure

**Modified (on branch `docs/crew-148-visual-fidelity-closeout`):**

- `docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/pr-193.patch` — created (Task 1).
- `docs/superpowers/plans/2026-05-13-visual-fidelity-render-frame-anchor.md` — reconciled (Task 2).
- `docs/superpowers/plans/2026-05-15-crew-146-chrome-integration.md` — PR B re-home banner (Task 2).
- `.agents/dispatch.md` — injection-is-load-bearing note (Task 3).
- `docs/rationale/architecture.md` — skill-injection history section (Task 4).
- `docs/visual-fidelity-setup.md` — host-side-token section (Task 5).
- `docs/followups.md` — ticket lines on 284/316 + 2026-05-11 annotation (Task 6).

**Jira (Task 7):** CREW-149, CREW-151, CREW-152, CREW-146, CREW-147, Epic CREW-148, one new child.

## Commands

- Verify a doc edit: `git diff -- <path>`
- Verify a Jira edit: re-fetch the issue (`getJiraIssue`) and confirm the field landed.

---

## Task 1: Freeze PR #193's diff as a durable fixture

PR #193 is the open CREW-135 attempt. Re-dispatching CREW-135 fresh force-pushes the `CREW-135` branch and destroys #193's commits — but CREW-152's calibration replay needs that diff. Freeze it now, before any re-dispatch.

**Files:**
- Create: `docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/pr-193.patch`

- [ ] **Step 1: Confirm PR #193 is the open CREW-135 PR**

Run: `gh pr list --search "CREW-135 in:title" --state open --json number,title,headRefName`
Expected: one result — number `193`, head branch `CREW-135`. If the number differs, use the actual open CREW-135 PR number throughout this task.

- [ ] **Step 2: Capture the diff**

Run: `gh pr diff 193 > docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/pr-193.patch`

- [ ] **Step 3: Verify the patch is non-empty and well-formed**

Run: `head -5 docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/pr-193.patch && wc -l docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/pr-193.patch`
Expected: the file starts with a `diff --git` line and has a non-trivial line count (hundreds of lines — #193 touches the Pill primitives). If it is empty, the PR diff did not resolve — stop and investigate before proceeding.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/pr-193.patch
git commit -m "test(fixture): freeze PR #193 diff for CREW-152 calibration replay

CREW-135 will be re-dispatched fresh, force-pushing the CREW-135 branch
and destroying PR #193's commits. CREW-152 replays the visual-fidelity
gate against #193's known regressions — capture the diff as a durable
fixture artifact so the calibration survives the re-dispatch.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

## Task 2: Reconcile the stale render-frame plan doc + consolidate WS5

`docs/superpowers/plans/2026-05-13-visual-fidelity-render-frame-anchor.md` predates Epic CREW-169. Phase 1 is obsolete; Phase 3 must absorb the chrome Step 5 rewrite so CREW-151 has one authoritative task list.

**Files:**
- Modify: `docs/superpowers/plans/2026-05-13-visual-fidelity-render-frame-anchor.md`
- Modify: `docs/superpowers/plans/2026-05-15-crew-146-chrome-integration.md`

- [ ] **Step 1: Read both plan docs**

Read `docs/superpowers/plans/2026-05-13-visual-fidelity-render-frame-anchor.md` in full and the `# PR B — Interactive (Tasks 7–8)` section of `docs/superpowers/plans/2026-05-15-crew-146-chrome-integration.md`.

- [ ] **Step 2: Mark Phase 1 obsolete**

At the top of the render-frame plan's Phase 1 section, insert this banner immediately under the Phase 1 heading:

```markdown
> **OBSOLETE — do not implement.** Phase 1 (CREW-149) was closed obsolete on 2026-05-16.
> CREW-169 already moved the skill to `<repo>/.claude/skills/`; the injection module Phase 1
> planned to delete is load-bearing (see `docs/rationale/architecture.md`). Retained for
> history. See `docs/superpowers/specs/2026-05-16-visual-fidelity-closeout-design.md`.
```

- [ ] **Step 3: Path-check Phases 2–4**

For each file path referenced in Phases 2, 3, and 4, confirm it still exists at that path post-CREW-169. The skill is now at `<repo>/.claude/skills/visual-fidelity-check/` (not `packages/cli/src/lib/skills/`). Correct any path in Phases 2–4 that still points at the old location. The figma-snapshot paths (`packages/cli/src/lib/figma-snapshot/`) are unchanged. Verify each corrected path with `ls`.

- [ ] **Step 4: Append the chrome Step 5 rewrite to Phase 3**

Phase 3 currently ends after CREW-151's Task 3.3 (SKILL.md anti-loophole). Append two new tasks to Phase 3, copying their content verbatim from `docs/superpowers/plans/2026-05-15-crew-146-chrome-integration.md`:

- **Task 3.4** ← that plan's **Task 7** (rewrite `workflow.md` Step 5 as live-DOM inspection).
- **Task 3.5** ← that plan's **Task 8** (update `SKILL.md` for live-DOM Step 5 + `browsing` peer).

Renumber the copied step lists to fit Phase 3. Keep the `.claude/skills/visual-fidelity-check/` paths (already correct).

- [ ] **Step 5: Add the MCP-tool-id verification step to Phase 3**

In the appended Task 3.4 (Step 5 rewrite), add a step before its commit step:

```markdown
- [ ] **Verify the chrome MCP tool id**

Confirm against CREW-146 PR A's merged code (`packages/cli/src/lib/mcp-config/`) what MCP
tool id a dispatched agent sees: `writeMcpFile` keys the server as `chrome`, so the tool is
`mcp__chrome__use_browser`. If the merged code keys it differently, use the actual id
throughout the Step 5 rewrite. (In a plugin-loaded session the same server surfaces as
`mcp__plugin_superpowers-chrome_chrome__use_browser` — do not copy that namespaced form.)
```

- [ ] **Step 6: Add a re-home banner to the chrome plan**

In `docs/superpowers/plans/2026-05-15-crew-146-chrome-integration.md`, under the `# PR B — Interactive (Tasks 7–8)` heading, insert:

```markdown
> **RE-HOMED.** PR B (Tasks 7–8) is absorbed into CREW-151 as of 2026-05-16. Its task content
> now lives in Phase 3 of `docs/superpowers/plans/2026-05-13-visual-fidelity-render-frame-anchor.md`
> (Tasks 3.4–3.5). CREW-146 ships as PR A only. See the close-out spec.
```

- [ ] **Step 7: Verify and commit**

Run: `git diff --stat`
Expected: two plan docs modified.

```bash
git add docs/superpowers/plans/2026-05-13-visual-fidelity-render-frame-anchor.md \
        docs/superpowers/plans/2026-05-15-crew-146-chrome-integration.md
git commit -m "docs(plans): reconcile render-frame plan; consolidate CREW-151 (WS2)

Mark Phase 1 obsolete (CREW-149 closed), path-check Phases 2-4 against
post-CREW-169 layout, and absorb the chrome Step 5 rewrite into Phase 3
so CREW-151 has one authoritative task list.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

## Task 3: Record why skill injection is load-bearing — `.agents/dispatch.md`

**Files:**
- Modify: `.agents/dispatch.md`

- [ ] **Step 1: Insert the rationale subsection**

In `.agents/dispatch.md`, the `## Skills` section ends with the numbered "Add a new crew-owned skill by:" list (steps 1–4), immediately before `## Figma snapshot`. Insert this subsection between that list and `## Figma snapshot`:

```markdown
### Why injection is load-bearing

`runSkillInjection` can look redundant — skills are committed in `<repo>/.claude/skills/` and
Claude Code discovers them natively, so why copy? Because crew is a *dispatcher*: a `crew run`
targets a worktree of whatever project the ticket belongs to, and a non-crew target (e.g. the
Recipes repo) has no copy of crew's skills. Injection is the only path that carries crew-owned
gates into a foreign worktree. Native discovery finds the skills *after* injection puts them
there — it does not replace injection.

Do not "optimize" this away. CREW-149 was planned to delete this module on the native-discovery
reasoning above; it was closed obsolete instead. CREW-167 made injection unconditional and
CREW-146 extended it (the `browsing` branch) — it is built on, not removed. Full history:
`docs/rationale/architecture.md`.
```

- [ ] **Step 2: Bump `last_updated`**

Set the frontmatter `last_updated:` field to `2026-05-16`.

- [ ] **Step 3: Verify and commit**

Run: `git diff -- .agents/dispatch.md`
Expected: the new subsection and the `last_updated` bump, nothing else.

```bash
git add .agents/dispatch.md
git commit -m "docs(.agents): record why skill injection is load-bearing (WS3)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

## Task 4: Record the skill-injection history — `docs/rationale/architecture.md`

**Files:**
- Modify: `docs/rationale/architecture.md`

- [ ] **Step 1: Append the history section**

Add this as a new `##` section immediately before the final `## Settled questions` section of `docs/rationale/architecture.md`:

```markdown
## Skill injection — why it's load-bearing

crew owns three skills — `visual-fidelity-check`, `agents-doc-parity-check`,
`bruno-collection-maintenance` — that act as gates every dispatched agent should honour.
`runSkillInjection` copies them, pre-dispatch, from crew's own `.claude/skills/` into the
target worktree's `.claude/skills/`.

This looks redundant once skills are committed and Claude Code discovers `.claude/skills/`
natively — and that perception nearly cost the project. CREW-149 (a child of the
visual-fidelity render-frame epic) was planned to *delete* the injection module on exactly
that reasoning: skills now live in `.claude/skills/`, native discovery finds them, so the
copy is dead weight.

The reasoning holds only for crew dispatching against *itself*. crew is a dispatcher: a
`crew run` targets a worktree of whatever project the ticket belongs to. A non-crew target —
the Recipes repo, say — has no copy of crew's skills in its checkout. Injection is the only
mechanism that carries crew-owned gates into a foreign project's worktree. Native discovery
finds them *after* injection has put them there; it is not a substitute for injection.

CREW-149 was closed obsolete rather than executed. CREW-167 had already made injection
unconditional (every dispatch, no per-skill config gate); CREW-146 then extended the same
module to also inject the plugin-sourced `browsing` skill. The module is actively built
*on*, not removed. Do not re-attempt this optimization. The dynamic-discovery experiment
that preceded unconditional injection is recorded in
`docs/superpowers/specs/2026-04-28-dynamic-skill-discovery-design.md` (superseded).
```

- [ ] **Step 2: Verify and commit**

Run: `git diff -- docs/rationale/architecture.md`
Expected: one new section, placed before `## Settled questions`.

```bash
git add docs/rationale/architecture.md
git commit -m "docs(rationale): skill-injection history + the CREW-149 near-miss (WS3)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

## Task 5: Document the host-side token flow — `docs/visual-fidelity-setup.md`

**Files:**
- Modify: `docs/visual-fidelity-setup.md`

- [ ] **Step 1: Insert the token-flow section**

In `docs/visual-fidelity-setup.md`, insert this new section between the `## Verify` section and the `## Why this isn't committed to the repo` section:

```markdown
## How the token is used

`crew run` generates the Figma snapshot **on the host, before the agent is dispatched**: the
pre-dispatch hook reads `FIGMA_API_TOKEN` from the environment of the `crew run` process and
writes the snapshot into the worktree. The dispatched (sandboxed) agent only *reads* that
snapshot — it never runs `crew figma-snapshot` and never needs the token.

So `FIGMA_API_TOKEN` must be exported in the shell where *you* run `crew run`, not inside any
dispatch. The manual `crew figma-snapshot` in the Verify section above is a contributor
convenience for confirming your token and config resolve correctly; it is not a step any
dispatch performs.
```

- [ ] **Step 2: Verify and commit**

Run: `git diff -- docs/visual-fidelity-setup.md`
Expected: one new section between Verify and Why-this-isn't-committed.

```bash
git add docs/visual-fidelity-setup.md
git commit -m "docs(visual-fidelity): clarify the host-side token flow (WS3)

The FIGMA_API_TOKEN is consumed host-side by crew run pre-dispatch; the
dispatched agent only reads the snapshot. Documenting the layer split
prevents the confusion that produced CREW-147's 'verification gap'.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

## Task 6: Update `docs/followups.md`

**Files:**
- Modify: `docs/followups.md`

- [ ] **Step 1: Add a Ticket line to entry 284**

Under the H3 title `### 2026-05-13 — visual-fidelity-check calibration: pattern accuracy ≠ specific accuracy + planned screenshot-vs-Figma ultimate test`, insert as the first line of the entry body (before `**What:**`):

```markdown
**Ticket:** [CREW-148](https://safturento.atlassian.net/browse/CREW-148) — resolution gated on Epic CREW-148 completion.
```

- [ ] **Step 2: Add a Ticket line to entry 316**

Under the H3 title `### 2026-05-13 — figma-snapshot omits instance `componentProperties` (REST API limitation) — needed for caller-check accuracy`, insert as the first line of the entry body (before `**What:**`):

```markdown
**Ticket:** [CREW-148](https://safturento.atlassian.net/browse/CREW-148) — resolution gated on Epic CREW-148 completion.
```

- [ ] **Step 3: Annotate the 2026-05-11 Timeline followup**

Find the entry `### 2026-05-11 — Agent activity timeline + Bash event-tag components missing from Crew DS`. Append this line to the end of its `**Shape of work:**` (or, if absent, as a new trailing paragraph of the entry body):

```markdown

**2026-05-16 annotation:** when this Crew DS design work happens, it must also author the
`.figma.tsx` Code Connect files for each new Timeline component. CREW-147's plan to author
those `.figma.tsx` files was based on a false premise (it assumed the Timeline composites
already existed); the authoring is downstream of *this* followup's design work. Until then,
`visual-fidelity-check` correctly reports "no Code Connect mapping" for Timeline components —
a handled, expected degradation, not a gap that blocks the visual-fidelity workstream.
```

- [ ] **Step 4: Verify and commit**

Run: `git diff -- docs/followups.md`
Expected: two `**Ticket:**` lines added; one annotation appended. No other entries touched. The `## Contents` ToC does not change (no new entries, no section moves).

```bash
git add docs/followups.md
git commit -m "docs(followups): ticket-link 284/316 to CREW-148; annotate Timeline (WS4)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

## Task 7: Jira re-plan of Epic CREW-148

Executed via the Atlassian MCP. After each write, re-fetch the issue and confirm the change landed (the documentation convention's verify-after-send rule). Jira descriptions use ADF.

- [ ] **Step 1: Close CREW-149 as obsolete**

Transition CREW-149 to a closed state (`Done`, or `Won't Do` if available). Add a comment:

> Closed obsolete on 2026-05-16. Task 1.1 (move the skill to `.claude/skills/`) already shipped via Epic CREW-169. Tasks 1.2–1.4 (delete the skill-injection module) are invalid — that module is the load-bearing dispatch path: CREW-167 made injection unconditional and CREW-146 PR A extended it (`browsing` injection). Deleting it would break dispatch for every non-crew project. See `docs/superpowers/specs/2026-05-16-visual-fidelity-closeout-design.md` and `docs/rationale/architecture.md`.

- [ ] **Step 2: Remove the CREW-149 → CREW-151 blocks link**

Delete the "blocks" issue link between CREW-149 and CREW-151 (CREW-151 was "blocked by CREW-149"). CREW-151 is now unblocked.

- [ ] **Step 3: Re-scope CREW-151**

Update CREW-151's summary to `P3: skill content edits — render-frame Step 4 + live-DOM Step 5 + SKILL.md + findings example` and rewrite its description to state:

- Scope is the merged interactive skill-content pass: `workflow.md` Step 4 (render-frame anchor) **and** Step 5 (live-DOM, absorbed from CREW-146 PR B), `SKILL.md` edits, `examples/findings-report-example.md`.
- It is **interactive** — authored in-session, not via `crew run` (the dispatch sandbox masks `.claude/skills/` read-only).
- Authoritative task list: Phase 3 of `docs/superpowers/plans/2026-05-13-visual-fidelity-render-frame-anchor.md` (Tasks 3.1–3.5, post-reconciliation).
- Acceptance criteria: carry over CREW-151's existing three, plus CREW-146 PR B's three (`workflow.md` Step 5 rewritten with sub-steps 5.1–5.5; `SKILL.md` overview + Related-skills updated with `browsing`; Step 5 required/skipped/verification-gap behavior specified).

- [ ] **Step 4: Re-scope CREW-152**

Update CREW-152's description: Task 4.2 applies the frozen patch `docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/pr-193.patch` to a base worktree instead of checking out PR #193's live branch. Task 4.1 consumes the snapshot crew generates host-side pre-dispatch (in the worktree's `.crew/figma-snapshot/`) and copies its composites into the fixture — the dispatched agent does **not** run `crew figma-snapshot`. Note that CREW-152 remains `crew run`-autonomous. Add a comment summarizing the re-scope and citing the close-out spec.

- [ ] **Step 5: Create the P5 child**

Create a new Task under Epic CREW-148:

- Summary: `P5: workstream sign-off — validate visual-fidelity-check across CREW-134`
- Description: Interactive sign-off ticket. The visual-fidelity workstream is successful when CREW-135 (re-dispatched fresh via `crew restart --hard` after PR #193 is closed), CREW-136, and CREW-137 each complete correctly through the visual-fidelity-check workflow — the gate fires, findings are accurate against the render composites, no high-severity regression ships. When P5 signs off, Epic CREW-148 transitions to Done and its Epic-close ritual moves followups 284/316 to Resolved. Reference `docs/superpowers/specs/2026-05-16-visual-fidelity-closeout-design.md`.
- Links: `is blocked by` CREW-151 and CREW-152; `relates to` CREW-134.

- [ ] **Step 6: Close CREW-146**

Transition CREW-146 to `Done`. Add a comment:

> PR A (#225) is merged and satisfies CREW-146's autonomous acceptance criteria. PR B (the interactive `visual-fidelity-check` Step 5 rewrite) is re-homed to CREW-151 as of the 2026-05-16 close-out — see `docs/superpowers/specs/2026-05-16-visual-fidelity-closeout-design.md`. The old abandoned PR #196 is closed (Task 8).

- [ ] **Step 7: Close CREW-147**

Transition CREW-147 to `Done`. Add a comment:

> Docs PR #195 merged. The acceptance criterion to author `.figma.tsx` for five Timeline components rested on a false premise — the Timeline exists only in the *Dashboard Screens* Figma page, not as composites, so no Code Connect mapping can point at it. The criterion's intent (Code Connect coverage for the visual-fidelity test bench) is satisfied by the existing Pill / Form / Modal composites delivered by Epic CREW-134. The Timeline composites are tracked as future dashboard design work in the 2026-05-11 followup in `docs/followups.md`.

- [ ] **Step 8: Update the Epic CREW-148 description**

Rewrite the Epic's "Child tickets" and "Parallelism plan / Recommended dispatch sequence" sections:

- Children: CREW-150 (P2 — figma-snapshot enrichment), CREW-151 (P3 — interactive skill content, re-scoped), CREW-152 (P4 — fixture refresh + frozen-patch validation), P5 (workstream sign-off). CREW-149 closed obsolete.
- Dispatch sequence: `crew run CREW-150` (independent, anytime) ∥ CREW-151 interactive session; then `crew run CREW-152` (blocked by CREW-150 + CREW-151); then re-dispatch CREW-135 fresh + CREW-136 + CREW-137; then P5 sign-off.
- Note CREW-151 is interactive and CREW-152 is autonomous.

- [ ] **Step 9: Verify the Jira state**

Re-fetch CREW-148 and `parent = CREW-148`. Confirm: CREW-149 closed; CREW-150/151/152 + the new P5 present; P5 blocked by CREW-151 + CREW-152; no CREW-149→CREW-151 link remains. Confirm CREW-146 and CREW-147 are `Done`.

## Task 8: Close the stale GitHub PRs

**Files:** none (GitHub admin).

- [ ] **Step 1: Close PR #196 (abandoned CREW-146)**

Run: `gh pr close 196 --comment "Abandoned — built on the pre-CREW-169 skill-injection architecture. CREW-146 was re-planned and shipped as PR #225 (PR A) + CREW-151 (PR B re-homed). See docs/superpowers/specs/2026-05-16-visual-fidelity-closeout-design.md."`

- [ ] **Step 2: Close PR #193 (wrong CREW-135 attempt)**

Run: `gh pr close 193 --comment "Closed — this CREW-135 attempt is being discarded. CREW-135 will be re-dispatched fresh on the corrected visual-fidelity-check workflow (Epic CREW-148). The diff has been frozen as a calibration fixture at docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/pr-193.patch."`

Do **not** delete the `CREW-135` branch — leave it for the fresh re-dispatch to overwrite.

## Completion

- [ ] All Task 1–6 commits are on `docs/crew-148-visual-fidelity-closeout`; push and confirm they appear on PR #227.
- [ ] Task 7 Jira state verified (Task 7 Step 9).
- [ ] Task 8 PRs #196 and #193 show `CLOSED`.
- [ ] The close-out is doc + admin only — no `.agents/<topic>.md` `covers:` glob matches a *code* path here, so `agents-doc-parity-check` has nothing to flag. (`.agents/dispatch.md` is edited directly in Task 3; that is the parity doc itself, not a code change requiring a doc update.)

## What this plan does NOT cover

- **WS5 / CREW-151** (the interactive skill-content pass) — its task list is Phase 3 of the reconciled render-frame plan (produced by Task 2). The user triggers it as an interactive session.
- **CREW-150, CREW-152, P5** — `crew run` / interactive tickets the user triggers after this close-out lands.

## Self-review notes

- **Spec coverage:** WS1 → Task 7 (+ Task 8 for the stale PRs); WS2 → Task 2; WS3 → Tasks 3, 4, 5; WS4 → Task 1 (fixture freeze) + Task 6 (followups); WS5 → Task 2 Step 4 produces its task list, explicitly out of scope here.
- **Sequencing:** Task 1 (fixture freeze) leads — it must precede any CREW-135 re-dispatch. Task 8 Step 2 (close PR #193) follows Task 1 so the diff is frozen first. Tasks 2–6 are independent doc edits. Task 7 depends on nothing in this plan but reads cleanest after Task 2 (CREW-151's description points at the reconciled Phase 3).
