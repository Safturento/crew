# CREW-64 — Backfill docs/followups.md by scanning historical work

Jira: https://safturento.atlassian.net/browse/CREW-64

## Goal

One-shot historical scan of closed/open PRs, all CREW Jira tickets, and every
`docs/**/*.md` file. Capture every still-relevant deferred-work signal as a
template-shaped entry in `docs/followups.md` under `## Active`. Preserve the
existing subagent-transcript entry. Open a PR with totals + per-source
breakdown + uncertain/skipped lists.

## Sources

- Closed PRs in `Safturento/crew` (`gh pr list --state closed --limit 1000`).
- Open PRs (small, but include).
- Jira CREW project, all states (Done tickets often carry "follow up" comments
  written at close time).
- All `.md` files under `docs/` recursively.

## Triggers

Per `~/.claude/CLAUDE.md` "Followup detection":

- Phrases: "follow up", "follow-up", "followup", "worth revisiting", "we should
  think about", "out of scope" (when followed by a _specific_ deferred concern),
  "TODO" naming a concrete deferred gap (not stub markers in code), "deferred",
  "punt".
- Spec `## Out of scope` sections naming a specific item.
- PR descriptions / comment threads saying "let's not do X here, file separately."
- Jira comments marking work as "save for later."

## Triage rules during scan

- Closed PR / Done ticket explicitly resolved the deferral → **skip** (already done).
- References code/files/tickets that no longer exist → **skip** (stale).
- Later PR/ticket/spec subsumed the concern → **skip** (only when reasonably certain).
- Otherwise → **capture**.
- When uncertain about staleness, prefer to capture and flag in PR description.

## Format

Each entry is a `### YYYY-MM-DD — short title`. The date is when the deferral
_originally happened_ (PR merge / ticket close / doc commit), NOT today. Include
**What**, **Why noticed**, **Anchors**, **What's been considered** (if any),
**Shape of work**, **Open questions** (if any).

## ToC

`## Contents` lists each entry under `## Active` with a GitHub-slugged anchor
(lowercase, spaces → `-`, em-dash preserved as `--`, punctuation stripped).

## Decisions

- **Sort order in Active: newest-first** (per ticket spec).
- **Don't duplicate the existing 2026-04-30 subagent-transcript entry.**
- **`out of scope` in specs is captured only when the line names a specific
  deferred concern**, not vague "future work" hand-waves. Same rule for
  open-PR comments.

## Out of scope

- Triaging captured items into Resolved or Abandoned.
- Filing Jira tickets for any captured items.
- Updating any other documentation.

## Notes

Freeform scratch goes here as the scan unfolds. Tracking candidate items, skips
with reasons, and uncertain calls so they end up in the PR body cleanly.
