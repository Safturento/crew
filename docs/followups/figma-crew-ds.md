# Followups — Figma & Crew DS

> Part of the crew followups queue. Index + format: [`../followups.md`](../followups.md). Entry template, ticketing protocol, and the Active/Resolved/Abandoned lifecycle live in the user-level `~/.claude/CLAUDE.md` "Followup detection" section.

(entries below, newest at top)


## 2026-06-27 — figma-snapshot stale for 5 nodes (FilterMenu, NewRunStep2, New Run modals)

**What:** During CREW-294 (the interactive Figma build of the run + supervisor drawers), `crew figma-snapshot --check` reported 5 already-committed snapshot nodes as drifted from live Figma: `844:4328` (FilterMenu), `362:2212` (NewRunStep2Content), and the three New Run modal screens `1:2980` / `1:3418` / `9:2`. These are unrelated to the drawers — they're Figma edits made under earlier tickets whose `figma-snapshot-refresh` never ran. `visual-fidelity-check` for those components/screens is therefore validating against stale snapshot data.

**Why noticed:** The CREW-294 partial refresh (run/supervisor drawers only) deliberately left `meta.json` untouched, so `--check` keeps surfacing the 5 drifts. Partial refresh fixes the named nodes; clearing the stale signal needs a full refresh, which is the catch-all the skill prescribes.

**Anchors:**

- `crew figma-snapshot --check` (run from repo root) — reproduces the stale list
- `.crew/figma-snapshot/` — committed snapshot; `meta.json` carries the freshness hashes
- `.claude/skills/figma-snapshot-refresh/SKILL.md` — step 2 (full vs partial) + the "partial doesn't update meta.json" note
- Figma file `9FeJPriqdsdA4n9R5Xsrr8` — FilterMenu `844:4328`, NewRunStep2Content `362:2212`, New Run modal screens `1:2980` / `1:3418` / `9:2`

**Shape of work:** run a **full** `crew figma-snapshot` (no flag) → enrich every `index.json` node in batches → `--enrich` merge → verify `--check` reports fresh → commit. Should be its own doc-ish PR so the drift fix isn't conflated with feature work. Verify each of the 5 components actually changed in Figma (vs a snapshot hashing quirk) while doing it.

**Open questions:** were these intentional Figma changes (so the snapshot should adopt them) or accidental drift (so Figma should be reverted)? Resolve per-node before committing a full refresh.

## 2026-06-04 — `FinishSteps` checklist has no Crew DS Figma counterpart

**What:** CREW-220 shipped `packages/dashboard/src/components/FinishSteps.tsx` — the agent drawer's live `crew finish` step checklist (ok/skip/error rows). It is figma-less feature-internal (same status as `MinimapStripe`): no finish-checklist was ever designed in the Crew DS Figma, so the component borrows the `TokensByTool` card shell and the status palette (`emerald-500` / `muted-foreground` / `red-400`) by hand. A future fidelity pass could design a proper Figma counterpart and a `.figma.tsx` Code Connect mapping so it joins the regular DS-composite inventory.

**Why noticed:** Building T8 of the dashboard-actions Epic (CREW-208). The `visual-fidelity-check` had no snapshot component to compare against — by design here, but worth a deliberate design pass rather than leaving it as a permanent gap.

**Anchors:**

- `packages/dashboard/src/components/FinishSteps.tsx` — the code component
- `.agents/design-system.md` — "Code-shipped composites" inventory (row marked _no Figma — feature-internal_)
- `packages/dashboard/src/components/TokensByTool.tsx` — the card shell + section idiom it borrows

**Shape of work:** small Crew DS Figma pass (one card composite, three status row variants) + a `FinishSteps.figma.tsx` mapping; opportunistic, low priority.

## 2026-05-24 — Publish `state/pr-merged` variable in Crew DS Figma

**What:** CREW-202 added a `pr_merged` agent state in dashboard code (emerald-500 family, same shade as `finished`). The dashboard binds the new state via direct Tailwind classes (`text-emerald-500`, `bg-emerald-1050`, etc.) in `STATE_CLASSES.pr_merged`. The corresponding Crew DS Figma variable (`state/pr-merged → tw/colors/emerald/500`) was not added in the same pass, so the Figma DS state-token table is one row behind the code.

**Why noticed:** `agents-doc-parity-check` during CREW-202 implementation flagged `.agents/design-system.md`'s state-tokens table as a covered file. The doc was updated to call out the divergence; this followup ensures the Figma side catches up.

**Anchors:** `.agents/design-system.md` § "State tokens"; `packages/dashboard/src/data/state-meta.ts` (`STATE_CLASSES.pr_merged`); Crew DS file `DsA7QuEa2WthDATkksd1Bq` → `Semantic Colors` collection (where the 7 existing `state/*` variables live).

**What's been considered:** Reusing `state/finished` instead of adding a new variable was tempting (both are emerald-500) but conflates two semantically-distinct states — `finished` means "Finish ran cleanly," `pr_merged` means "PR closed, Finish is next." Keeping them as separate aliases (even when they resolve to the same shade today) preserves the option to differentiate later (e.g. swap pr_merged to `emerald/400` for slight contrast against `finished`'s `emerald/500`).

**Shape of work:** ~5 min in Figma — add `state/pr-merged` to `Crew / Semantic Colors` aliasing `Core / tw/colors / emerald/500`. Rebind StateBadge/Pill component instances for the new state if the design language warrants a distinct visual treatment from `finished`. Re-run `crew figma-snapshot` and confirm `visual-fidelity-check` still passes against the dashboard.

## 2026-05-12 — Move figma-snapshot PAGE_DIR_MAP into project config

**What:** `emit.ts` hardcodes `Composites → composites/` and `Dashboard Screens → screens/` in a module-level map. Any other page name falls through to a sanitized slug. This is crew-dashboard-specific knowledge living in a generic CLI helper — violates AGENTS.md's "Don't hardcode project-specific knowledge" rule.

**Why noticed:** Self-review of CREW-139. The map matches the spec's example output structure exactly, but only because the spec was written for crew. A second project adopting the snapshot would either need to use one of these names or accept the kebab-cased fallback.

**Anchors:** `packages/cli/src/lib/figma-snapshot/emit.ts` (the `PAGE_DIR_MAP` const); `packages/shared/src/config/schema.ts` (`visualFidelitySchema` — where the map could live); CREW-139 PR / self-review notes.

**Shape of work:** Add an optional `page_dir_map = { "Composites" = "composites", … }` field to `visualFidelitySchema`; in `emit.ts`, look up `opts.pageDirMap?.[name]` first, fall back to slug. ~30 line change + tests.

**Open questions:** Worth doing before a second project adopts the snapshot, or is YAGNI?

## 2026-05-12 — Pill trailing-icon support + CodeChip mono-font composite

**What:** Two coupled Crew DS gaps surfaced during the 2026-05-12 polish pass.

1. **Pill has no trailing-icon support.** The `Pill` set supports a leading `Icon` (BOOLEAN `Has Icon` + INSTANCE_SWAP `Icon`) but not a trailing one. Two patterns need it: the "Filters" dropdown button (`lucide/filter` + `lucide/chevron-down`) and the docker URL chip (`docker` glyph + `lucide/arrow-up-right`). Left as raw FRAMEs named "Filters (raw — pending trailing-icon Pill support)" / "CodeChip (raw — ...)" rather than migrated to Pill.
2. **CodeChip mono-font composite missing.** The agent drawer + agent page show two "code-style" chips in the header — worktree path with folder icon + git-branch suffix, and docker URL with external-link icon. Both use **Fira Code mono**, neither fits Pill (which is Hanken Grotesk Medium 14). Also blocked on the trailing-icon limitation.

**Anchors:** Pill set node ID `272:120` in Figma file `9FeJPriqdsdA4n9R5Xsrr8`. Affected raw frames: `1:944` / `1:2115` (Filters), `1:807` / `1:1978` (docker URL / CodeChip).

**What's been considered:**

- Add `Has Trailing Icon` (BOOLEAN) + `Trailing Icon` (INSTANCE_SWAP) to all 320 Pill variants — generalizes but doubles the icon-related property surface.
- Build a separate `DropdownButton` composite wrapping Pill with a fixed trailing chevron — cleaner semantic intent.
- For CodeChip: add a `type=code-chip` Pill variant with Fira Code (inconsistent with otherwise Hanken Grotesk Pill) vs build a separate CodeChip composite.

**Shape of work:** ~1h Figma plugin work for trailing-icon Pill, or ~30min for DropdownButton. Pairing with CodeChip composite (~30min). The two share the trailing-icon problem — natural pair.

**Open questions:**

- Is trailing-icon only for dropdown chevrons, or general-purpose? If only chevrons, DropdownButton is right.
- Is mono treatment used anywhere else besides the two header chips? Sample size of 2 is borderline for its own composite.

## 2026-05-12 — Explore intensity-axis for Button (parallels StateBadge muted/mid/loud)

**What:** Crew DS Button has 8 variants (default, destructive, danger, outline, secondary, ghost, link, warning) but each is a single visual treatment. StateBadge by contrast has an `intensity` VARIANT axis with 3 values (muted/mid/loud). User noticed that `warning` might benefit from an outline-style sibling treatment — same way `destructive` has its loud-solid version and `danger` is its quieter tinted+stroke counterpart. The pattern would extend: every "loud" colored button might want a "tinted" or "outline" sibling, mirroring StateBadge.

**Why noticed:** Mid-session during Phase 1 of the Button rollout Epic on 2026-05-12. User said "I wonder if we should have an outline version for that as well like error vs destructive — we might just end up with the same variants as we have for the pills in the end." Deferred to keep the in-session Epic bounded.

**Anchors:** Crew DS Button COMPONENT_SET `204:50` in file `DsA7QuEa2WthDATkksd1Bq`; StateBadge intensity pattern — see [`project_crew_ds_palette_strategy`](https://github.com/Safturento/crew/) memory; current pair pattern `destructive` (loud solid red) ↔ `danger` (quiet tinted red with stroke).

**What's been considered:**

- **Per-variant pairs** (existing pattern). Repeat what we did for destructive/danger: add a `warning-quiet` for every "loud" variant. Pro: matches existing. Con: variant count balloons.
- **Explicit `intensity` VARIANT axis** (StateBadge parallel). Single new axis: `intensity = solid / tinted / outline`. Composable. Con: naive 8×3×4 = 96 components (vs current 32). Better candidate for "only colored variants, not default/outline/ghost/link."
- **Only certain colors get sibling treatments.** Maybe `warning` is the only one and the answer is just `warning-outline` as a one-off.

**Shape of work:** Conversation first — settle which colors need intensity siblings and whether to refactor to a unified `intensity` axis. ~30–60 min spec + 1–2h implementation. Includes a possible token-naming alignment decision.

**Open questions:**

- [ ] Unified `intensity` axis or stay with per-variant pairs?
- [ ] If pairs: which colors need siblings? (`warning` for sure; `secondary`/`ghost` don't seem to need it; `default` is already neutral.)
- [ ] Naming convention for siblings if going pairs-based.
- [ ] Whether to backport to the existing `destructive` ↔ `danger`. Probably not worth the rename churn but worth flagging.

## 2026-05-09 — Crew Dashboard Screens: 3 remaining ad-hoc modal frames need DS Modal swap + semantic-token bindings

**Partially resolved 2026-05-10 / 2026-05-12:** Migrations of the agents-related frames (Agents List `1:2`, Drawer Open `1:378`, Agent full page `1:1900`) shipped in the 2026-05-10 interactive Figma-MCP session. Projects-view frames (`1:2334`, `1:2443`) shipped in the 2026-05-12 in-session Button rollout Epic with full token bindings and DS instance swaps. What remains is the 3 ad-hoc modal frames.

**What:** Three ad-hoc modal frames (`New Run modal - 3. Confirm` `9:2`, `Project Page - Edit project modal` `18:2`, `Project Page - Delete confirmation modal` `23:2`) in `9FeJPriqdsdA4n9R5Xsrr8` still render with hardcoded fills + detached primitive structures. Originally blocked on Crew DS Modal composites not existing — those composites have since been built (Modal / AlertModal / ModalSelectionRow per `project_crew_ds_modal_composites` memory, 2026-05-12). Now unblocked but not migrated.

**Anchors:** Figma frames `9:2`, `18:2`, `23:2` in `9FeJPriqdsdA4n9R5Xsrr8`; Modal composites built 2026-05-12 — see `project_crew_ds_modal_composites` memory; [CREW-126](https://safturento.atlassian.net/browse/CREW-126), [CREW-120](https://safturento.atlassian.net/browse/CREW-120) (Epic) — original scope.

**What's been considered:** Per-frame designer pass — open each in Figma desktop, swap detached structures to Modal/AlertModal/ModalSelectionRow instances, bind remaining fills via the picker. Probably 1-2h per modal × 3 frames. Hybrid agent-prepared candidate map possible.

**Shape of work:** One ticket per modal (3 tickets) or one bundled "modal migration" ticket. Designer-led; agent assists with binding scripts once the hex→token map is decided.

**Open questions:**

- [ ] How are the 3 ad-hoc modals' content layouts captured before deletion — screenshots? Re-authoring off live screens?
- [ ] Padding/gap/radius FLOAT bindings in the same pass, or deferred?

