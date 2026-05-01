# Followups

A queue between "noticed it" and "decided what to do about it." Items might become Jira tickets, get fixed inline during related work, or be explicitly abandoned. Triage periodically.

Format: see the user-level `~/.claude/CLAUDE.md` "Followup detection" section. Entries follow a structured template; conversation-sourced items must be self-contained because the conversation evaporates, while PR / ticket-sourced items can be thin and link out.

## Active

- **2026-04-30 — Surface subagent activity in transcript outputs.**

  **What:** crew's transcript views don't distinguish subagent (Task tool) events from top-level activity. The `.jsonl` session files DO contain them — verified empirically: CREW-62's session file has 293 `isSidechain: true` lines. The data layer captures the events; the rendering layers (`packages/shared/src/transcripts/parser.ts`, `tail.ts`, and the dashboard agent view) don't carry the marker forward or label sidechain activity differently.

  **Why noticed:** while filing CREW-63 (the resume / restart spec) the user asked whether subagent executions were tracked in transcript logs. Empirical check showed the data is recorded but not surfaced. Becomes painful for runs that dispatch subagents heavily — a `crew run` agent that uses Task to spin off Explore subagents shows the user only "Task invoked" in the parent's view, no visibility into what the subagent actually did. Source conversation: 2026-04-30 brainstorm session that produced CREW-63.

  **Anchors:**
  - `packages/shared/src/transcripts/parser.ts` — no `isSidechain` field on parsed event types
  - `packages/shared/src/transcripts/tail.ts` — no filtering or labeling around sidechain events
  - `packages/shared/src/transcripts/types.ts` — event-type definitions to extend
  - Daemon: `tool_calls` table from CREW-49 migration. Verify whether it currently captures sidechain calls or only top-level
  - Dashboard agent view (path TBD; verify whether it currently renders subagent activity at all)
  - Empirical data: `~/.claude/projects/-home-safturento-Repos-crew-CREW-62/` — 293 `isSidechain` lines, useful as a reference session for testing rendering decisions

  **What's been considered:** nothing yet beyond confirming the data is there. Flagged in conversation, deferred to plan later.

  **Shape of work:** likely two tickets.

  1. Extend transcript types + parser to carry sidechain markers. Decide CLI rendering strategy in `tailTranscript`: indented-under-parent, separate stream, or both.
  2. Dashboard agent view subagent timeline: sub-row beneath the parent's tool call, collapsible panel, or sidebar tree.

  Worth verifying whether the daemon's `tool_calls` table already captures sidechain calls before scoping the second ticket — if not, that becomes a sub-step.

  **Open questions:**
  - Are subagent events always in the parent's JSONL, or sometimes in their own session file? The 293 sidechain lines in CREW-62's session file suggests parent's, but verify before committing to a render strategy — affects whether `tail.ts` needs to multiplex multiple files or just label rows.
  - Dashboard UX shape: timeline interleave, collapsible-per-task, or sidebar tree? Affects how much state the agent view component manages.
  - Should the CLI's live tail collapse-by-default or expand-by-default for sidechain rows? (Verbose runs could become unreadable expanded; collapsed risks the original "invisible activity" complaint.)

## Resolved

(items move here when ticketed, fixed inline, or explicitly abandoned — keep for historical context, prune when the file gets long)
