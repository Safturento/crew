# Visual-fidelity-check workstream close-out — design

**Date:** 2026-05-16
**Status:** Draft for review
**Branch:** `docs/crew-148-visual-fidelity-closeout`

## Context

The `visual-fidelity-check` skill — a mandatory pre-completion gate that compares an
agent's rendered UI output against the Figma source of truth — has been built across two
overlapping efforts:

- **Epic CREW-148** (render-frame anchor) — fix *what the skill compares against*: re-anchor
  it on render composites instead of component-set definitions, so it produces
  *specifically* correct fixes, not just correctly-typed ones.
- **CREW-146 / CREW-147** (chrome integration) — fix *how rigorously Step 5 inspects*: wire a
  real browser (the `superpowers-chrome` MCP server) into dispatches so the visual check
  reads the live DOM instead of eyeballing a screenshot.

Both efforts were planned before Epic CREW-169 (skill-storage consolidation) rearchitected
the skill-injection subsystem. As a result the existing tickets and plan docs have drifted
out of date, merged work has changed the ground truth, and the two efforts collide on the
same skill files. This spec re-plans both into a single coherent close-out whose terminal
state is a *demonstrably working end-to-end workflow*.

### What changed under the tickets

- **Skill location.** `visual-fidelity-check` already lives at `<repo>/.claude/skills/`
  (moved by CREW-169). CREW-149 Task 1.1 is therefore already done.
- **Skill injection is load-bearing.** CREW-149 also planned to *delete* the injection
  module (`skill-injection.ts` / `skill-injection-step.ts`). That module is now the
  load-bearing dispatch path — CREW-167 made injection unconditional and CREW-146 PR A
  extended it (the `browsing`-skill branch). Deleting it would break dispatch for every
  non-crew project. See WS3 for why and the doc that records it.
- **CREW-146 PR A is merged** (#225): the resolver, `buildMcpConfig`/`writeMcpFile` chrome
  wiring, the `runSkillInjection` browsing branch, the `lib/playwright/` → `lib/mcp-config/`
  rename, and the `.agents/dispatch.md` update. Only the interactive skill-content half
  (PR B) is unfinished.
- **CREW-152's calibration fixture is at risk.** Its Task 4.2 replays the skill against
  "PR #193's CREW-135 branch." Re-dispatching CREW-135 fresh (see below) force-pushes the
  `CREW-135` branch and destroys PR #193's commits. The diff must be frozen first.

### Verified: how the Figma token is used

`crew run` on a `[visual_fidelity]` project generates the Figma snapshot **host-side, before
dispatch** — `runPreDispatchFigmaSnapshot` → `runFigmaSnapshot`, and `figma-snapshot/client.ts`
reads `FIGMA_API_TOKEN` from the host `crew run` process environment. The snapshot is written
into the worktree; the sandboxed agent only *reads* it. The agent never runs
`crew figma-snapshot` and never needs a token.

CREW-147's PR framed this as a "verification gap" because it tried to run `crew figma-snapshot`
*as the dispatched agent* — the wrong layer. There is no token problem for dispatches: the
only prerequisite is that the host shell running `crew run` has `FIGMA_API_TOKEN` exported,
identical to every other `[visual_fidelity]` dispatch. This resolves the CREW-152 autonomy
question (WS1) and is documented for contributors by WS3.

## Decisions

1. **Close CREW-149 as obsolete.** Task 1.1 shipped via CREW-169; Tasks 1.2–1.4 (delete the
   injection module) are now invalid.
2. **Merge the two skill-content rewrites into one interactive pass, homed in CREW-151.**
   CREW-146 PR B (Step 5 live-DOM rewrite) and CREW-151 (Step 4 render-frame rewrite) both
   edit `workflow.md` + `SKILL.md`; both are interactive-only (the dispatch sandbox masks
   `.claude/skills/` read-only). CREW-151 absorbs PR B; CREW-146 closes as autonomous-only.
   This keeps Epic CREW-148 the single tracking unit for the skill's content.
3. **The workstream's success bar is Epic CREW-134.** "Done" is not a synthetic test
   ticket — it is CREW-135 / CREW-136 / CREW-137 (the Crew-DS-to-code reconciliation
   tickets) all completed correctly *through the visual-fidelity-check workflow*. These are
   real dashboard work backed by composites that already exist in Figma (Pill, Form, Modal
   families) — the natural proving ground.
4. **CREW-135 is re-dispatched fresh.** PR #193 is entirely wrong and will be closed; CREW-135
   is re-run via `crew restart --hard`. PR #193's diff is frozen as a fixture artifact
   *before* that happens.
5. **The Timeline Code Connect "gap" is dissolved, not deferred.** CREW-147's criterion to
   author `.figma.tsx` for five Timeline components rested on a false premise — the Timeline
   exists only in *Dashboard Screens*, not as composites. The criterion's *intent* (Code
   Connect coverage for the test bench) is already satisfied by the Pill / Form / Modal
   composites. The genuine future concern — the Timeline drawer needs composites designed —
   stays with the existing 2026-05-11 followup as out-of-workstream dashboard work.

## Workstreams

### WS1 — Jira re-plan

- **CREW-149** → close as obsolete; comment explaining decision 1.
- **CREW-151** → re-scope: new scope is the merged interactive skill-content pass
  (`workflow.md` Step 4 + Step 5, `SKILL.md`, findings example). Mark interactive (not
  `crew run`). Drop the `is blocked by CREW-149` link. Migrate CREW-146 PR B's three
  acceptance criteria into it.
- **CREW-152** → re-scope Tasks 4.1 and 4.2; stays `crew run`-autonomous.
  - *Task 4.2:* apply PR #193's *frozen patch artifact* (see WS4) to a base worktree instead
    of checking out a live branch. Known-answer calibration otherwise unchanged.
  - *Task 4.1:* consume the snapshot crew already generated **host-side pre-dispatch** in the
    worktree (`.crew/figma-snapshot/`) and copy its composites into the fixture directory.
    The dispatched agent must *not* invoke `crew figma-snapshot` itself — it has no
    `FIGMA_API_TOKEN` and does not need one (see "Verified: how the Figma token is used").
- **P5 (new CREW-148 child)** → "Workstream sign-off: validate visual-fidelity-check across
  CREW-134." Interactive. Blocked by CREW-151 + CREW-152. `relates-to` CREW-134. DoD: CREW-135
  (fresh re-dispatch), CREW-136, and CREW-137 each complete correctly through the workflow —
  `visual-fidelity-check` fires, findings are accurate, no high-severity regression ships.
- **CREW-146** → transition to Done. PR A (#225) satisfies its autonomous acceptance
  criteria; PR B is re-homed to CREW-151. Comment recording the re-home. Close PR #196.
- **CREW-147** → transition to Done. Comment recording that the Timeline `.figma.tsx`
  criterion rested on a false premise (decision 5); the Code Connect test bench is the
  existing Pill / Form / Modal composites.
- **Epic CREW-148** → update description: drop CREW-149 from the child list, note CREW-151
  now also carries chrome Step 5, add P5, rewrite the parallelism / dispatch-sequence block.

Resulting Epic CREW-148 children: CREW-150 (P2), CREW-151 (P3, re-scoped), CREW-152 (P4,
re-scoped), P5 (new).

### WS2 — Reconcile the stale CREW-148 plan doc

Edit `docs/superpowers/plans/2026-05-13-visual-fidelity-render-frame-anchor.md`: strike
Phase 1 (obsolete — see decision 1), path-check Phases 2–4 against post-CREW-169 reality,
note Phase 3 now also carries the Step 5 live-DOM rewrite absorbed from CREW-146 PR B.

### WS3 — Rationale & clarification docs

The CREW-149 near-miss — a planned "optimization" that would have deleted load-bearing code
— must be recorded so it is not repeated.

- **`.agents/dispatch.md`** — add a concise "Why injection exists / is load-bearing" note to
  the Skills section. The non-obvious point: crew is a *dispatcher*; it copies its own
  skills into the worktree of *whatever* project it dispatches against. A target project
  (e.g. Recipes) has no copy of crew's skills. Native `.claude/skills/` discovery makes
  injection look redundant only when crew dispatches against *itself*; for the general
  cross-project case, injection is the only path. Do not delete it.
- **`docs/rationale/architecture.md`** — add a fuller history entry: the dynamic-discovery
  origin, the CREW-167 unconditional-injection model, and the CREW-149 near-miss as the
  cautionary tale.
- **`docs/visual-fidelity-setup.md`** — add a short "how the token is used" note: the
  `FIGMA_API_TOKEN` is consumed host-side by `crew run` pre-dispatch; the dispatched agent
  only reads the snapshot and needs no token. Prevents the layer confusion that produced
  CREW-147's "verification gap" framing.

### WS4 — followups.md + fixture freeze

- Add `**Ticket:** [CREW-148]` lines to entries 284 (calibration) and 316 (figma-snapshot
  `componentProperties`); keep both in `## Active` per the Epic-exception rule.
- No Timeline Code Connect followup is created (decision 5). Annotate the existing
  2026-05-11 Timeline followup so its eventual design work explicitly includes authoring the
  `.figma.tsx` Code Connect files.
- **Freeze PR #193's diff.** `gh pr diff 193 > docs/superpowers/skill-fixtures/visual-fidelity-check/crew-135/pr-193.patch`
  (works on a closed PR). Commit it. This must happen *before* CREW-135 is re-dispatched.

### WS5 — Interactive skill-content pass (= re-scoped CREW-151)

Executed interactively in a later session (the dispatch sandbox cannot write
`.claude/skills/`). Content source-of-truth is the two existing specs — this workstream
*consolidates*, it does not re-derive:

- `workflow.md` Step 4 → render-frame-anchored sub-flow + severity table
  (from `2026-05-13-visual-fidelity-render-frame-anchor.md`).
- `workflow.md` Step 5 → five-substep live-DOM inspection
  (from `2026-05-15-crew-146-chrome-integration-replan.md`).
- `SKILL.md` → "set vs composite" anti-loophole, live-DOM Step 5 overview, `browsing` peer.
- `examples/findings-report-example.md` → New Run case.
- **Verification woven in:** before finalizing Step 5's wording, confirm against CREW-146
  PR A's merged code what MCP tool id a dispatched agent actually sees. The plan text
  assumes `mcp__chrome__use_browser`; that holds only if PR A's `.mcp.json` keys the server
  as `chrome`. (In a plugin-loaded session the same server surfaces as
  `mcp__plugin_superpowers-chrome_chrome__use_browser` — different namespace.)

## Sequencing

```
Close-out (this session, interactive):
  WS4 fixture freeze  →  WS1 Jira  →  WS2 plan-doc  →  WS3 rationale docs  →  WS4 followups

Then, user-triggered:
  crew run CREW-150          (autonomous — figma-snapshot enrichment)
  CREW-151                   (interactive skill-content pass — WS5)
        ↓ (CREW-152 blocked by CREW-150 + CREW-151)
  crew run CREW-152          (autonomous — fixture refresh from the pre-dispatch
                              snapshot + frozen-patch validation)
        ↓ (P5 blocked by CREW-151 + CREW-152)
  Re-dispatch CREW-135 fresh, then CREW-136 + CREW-137, through the workflow
  P5 sign-off                (interactive — workstream closes)
```

The WS4 fixture freeze leads because it must precede any CREW-135 re-dispatch. CREW-150 is
independent and can start at any point.

## Acceptance criteria — the close-out itself

- CREW-149 closed; CREW-146 and CREW-147 transitioned to Done with the recorded comments.
- CREW-151 and CREW-152 descriptions reflect their re-scopes; P5 exists as a CREW-148 child
  with the correct dependency links.
- Epic CREW-148's description lists the four current children and a correct dispatch
  sequence.
- `2026-05-13-visual-fidelity-render-frame-anchor.md` Phase 1 struck; Phases 2–4 path-checked.
- `.agents/dispatch.md` and `docs/rationale/architecture.md` carry the injection-is-load-bearing
  rationale; `docs/visual-fidelity-setup.md` carries the host-side-token note.
- followups.md entries 284 / 316 carry `**Ticket:**` lines; the 2026-05-11 Timeline followup
  is annotated.
- `pr-193.patch` committed to the CREW-135 fixture directory.

## Definition of done — the workstream (P5)

CREW-135 (fresh), CREW-136, and CREW-137 each ship through the visual-fidelity-check
workflow with the gate firing, findings accurate against the render composites, and no
high-severity regression merged. When P5 signs off, Epic CREW-148 transitions to Done and
its Epic-close ritual moves followups 284 / 316 to Resolved.

## References

- Spec — chrome integration: `docs/superpowers/specs/2026-05-15-crew-146-chrome-integration-replan.md`
- Plan — chrome integration: `docs/superpowers/plans/2026-05-15-crew-146-chrome-integration.md`
- Spec — render-frame anchor: `docs/superpowers/specs/2026-05-13-visual-fidelity-render-frame-anchor.md`
- Plan — render-frame anchor: `docs/superpowers/plans/2026-05-13-visual-fidelity-render-frame-anchor.md` (stale — reconciled by WS2)
- Skill-storage rearchitecture: `docs/superpowers/specs/2026-05-15-skill-storage-and-agents-autoload-design.md`
- Epics: CREW-148 (render-frame anchor), CREW-134 (Crew DS → code reconciliation)
- Merged: CREW-146 PR A (#225); CREW-147 docs PR (#195)
