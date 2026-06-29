# Followups — Process & Conventions

> Part of the crew followups queue. Index + format: [`../followups.md`](../followups.md). Entry template, ticketing protocol, and the Active/Resolved/Abandoned lifecycle live in the user-level `~/.claude/CLAUDE.md` "Followup detection" section.

(entries below, newest at top)


## 2026-05-15 — `.agents/` topic-doc system vs native `.claude/rules/` and agents.md alignment

**Ticket:** [CREW-210](https://safturento.atlassian.net/browse/CREW-210) — parked in Backlog (needs planning).

**What:** crew's `.agents/<topic>.md` system — per-topic docs with `covers:` path globs, indexed from `AGENTS.md`'s "When you need it" table — is a hand-rolled equivalent of Claude Code's native `.claude/rules/` feature: topic `.md` files with `paths:` frontmatter that lazy-load when Claude touches matching files. Decide whether to migrate `.agents/` onto `.claude/rules/`, keep `.agents/` as-is (now that its load path is fixed), or run both.

**Why noticed:** While brainstorming the skill-storage consolidation spec + the `AGENTS.md` auto-load fix, empirical testing showed Claude Code does **not** auto-load `AGENTS.md` — only `CLAUDE.md`. The CREW-153 spec's risk table had dismissed this exact risk with a fabricated "Verified by research: Claude Code reads AGENTS.md natively." Reading the official memory docs surfaced `.claude/rules/`, which delivers path-scoped lazy topic docs natively — crew built a custom version of a native feature, and the custom version's load mechanism never worked.

**Anchors:** `.agents/` (9 topic docs + `README.md`); `packages/cli/scripts/hooks/doc-parity-gate.sh` (CREW-163, keyed on `covers:`); `scripts/validate-agents-frontmatter.ts`; `~/.claude/skills/agents-doc-parity-check` (the `covers:`-overlap audit skill); CREW-153 spec/plan at `docs/superpowers/{specs,plans}/2026-05-13-agent-progressive-disclosure-system.md`; Claude Code `.claude/rules/` reference: https://code.claude.com/docs/en/memory.

**What's been considered:** The decision hinges on **cross-agent portability** — the user wants this agent-context setup to work with agents _beyond_ Claude Code, which is the original reason `AGENTS.md` (a cross-tool convention) was chosen over `CLAUDE.md`. A straight migration to `.claude/rules/` is Claude-only and would sacrifice that. So the real question: once the auto-load fix lands, does `.agents/` genuinely serve the cross-agent goal — and does crew's implementation match how the `AGENTS.md` ecosystem actually intends the system to work?

**Shape of work:** Its own brainstorm → spec. **Must** begin with a thorough read of the full https://agents.md/ spec (not just the homepage) to understand the intended cross-agent `AGENTS.md` model, then reconcile crew's `.agents/` + `covers:` implementation against it. Then decide: keep `.agents/`, migrate to `.claude/rules/`, or run both. Whatever survives, the doc-parity hook (CREW-163), the frontmatter validator, and `agents-doc-parity-check` are downstream and may need rework.

**Open questions:** Once a `CLAUDE.md` → `@AGENTS.md` shim exists, what does `.agents/` + `covers:` buy over `.claude/rules/` + `paths:` for the Claude-Code case? Which non-Claude agents are actually in scope (Codex, Cursor, Gemini, …), and do they read nested/topic-scoped docs at all? Does the agents.md spec even define a topic-doc/lazy-load layer, or is that purely a crew invention layered on a flat `AGENTS.md`?

## 2026-05-12 — Rethink followup-tracking system (priority tier + Jira backlog sync)

**Ticket:** [CREW-211](https://safturento.atlassian.net/browse/CREW-211) — parked in Backlog; discuss separately before planning.

**What:** The current `docs/followups.md` convention captures items well at the "noticed it" moment but has two gaps. (a) **No priority tier** — entries within Active have no signal for what's near-term vs long-tail. (b) **Single surface** — followups live in a versioned markdown file, but Jira is where the rest of the user's work is prioritized, tracked, and resolved.

**Why noticed:** During the 2026-05-12 brainstorm for the agent visual-verification skill. User asked whether priority tiering and Jira-backlog sync would solve the underlying visibility/management problem.

**Anchors:**

- `~/.claude/CLAUDE.md` — current convention lives in the "Followup detection" section
- `docs/followups.md` — the file format under discussion
- Memory: `feedback_autonomous_doc_prs.md`
- Jira project: `CREW` — but the convention is user-level, not project-specific

**What's been considered:**

- **Add a `**Priority:** near-term | someday` line** to the entry template.
- **Sub-section split**: `## Near-term` and `## Long-tail` under `## Active`.
- **One-way sync to Jira backlogs**: a `crew followups sync` CLI that reads `docs/followups.md`, creates Jira tickets for each `## Active` entry without a `**Ticket:**` link, parks them in the project's backlog. Followups still author in markdown (low friction); prioritization happens in Jira.
- **Followup-first vs ticket-first capture**: value of the markdown file is the _thin-bullet capture moment_ — no auth, no project selection, no ADF authoring. Markdown stays as the capture surface; sync bridges to Jira.
- **Multi-repo concern**: a Crew-side observation about Recipes shouldn't auto-create a Jira ticket in CREW. Sync needs a per-entry "target project" hint.

**Shape of work:**

- ~1-2 hour design pass: settle sync semantics, entry-template additions (priority, target project), CLI surface.
- ~half-day implementation: `crew followups sync` command, parser, Jira create/link via existing Rovo MCP path, dry-run mode, an update pass for `~/.claude/CLAUDE.md`.
- ~half-day rollout: backfill existing entries with priority + target project, first sync, validate.

**Open questions:**

- Does sync run automatically (cron, pre-`crew run` hook) or stay manual?
- When a Jira ticket is created, does the markdown entry stay in `## Active` (with `**Ticket:**` line) or move to a new `## In Jira` section?
- What about followups in repos without a Jira project (e.g., user-level `~/.claude/` work)? Sync skips them.
- Should priority on the markdown side map directly to Jira priority, or stay a separate signal?

