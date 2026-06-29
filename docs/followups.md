# Followups

A queue between "noticed it" and "decided what to do about it." Items might become Jira tickets, get fixed inline during related work, or be explicitly abandoned. Triage periodically.

**Format:** see the user-level `~/.claude/CLAUDE.md` "Followup detection" section — entry template, ticketing protocol, and the Active/Resolved/Abandoned lifecycle. This is an index; the entries themselves live in the per-topic files below.

**Why split:** the queue outgrew a single file (agents were loading it in chunks). Active is partitioned by topic so an agent working in one area loads only that file — the boundaries mirror the `.agents/*.md` `covers:` topics. Each entry keeps its `YYYY-MM-DD — title` so date context survives. Resolved and Abandoned are their own archive files.

## Active (by topic)

| File | Covers |
| --- | --- |
| [`followups/figma-crew-ds.md`](followups/figma-crew-ds.md) | Figma design-system components/tokens, Crew DS |
| [`followups/visual-fidelity.md`](followups/visual-fidelity.md) | `figma-snapshot`, `visual-fidelity-check`, enrichment tooling |
| [`followups/dashboard-ui.md`](followups/dashboard-ui.md) | Dashboard React UI — drawers, components, screens |
| [`followups/daemon-cli-dispatch.md`](followups/daemon-cli-dispatch.md) | Daemon services/routes, the `crew` CLI, dispatch flow |
| [`followups/architecture-config.md`](followups/architecture-config.md) | docker/env, project config, architecture |
| [`followups/process-conventions.md`](followups/process-conventions.md) | conventions, docs, workflow, the followup system itself (catch-all) |

## Archive

| File | Covers |
| --- | --- |
| [`followups/resolved.md`](followups/resolved.md) | ticketed + shipped, or fixed inline — kept for historical context |
| [`followups/abandoned.md`](followups/abandoned.md) | explicitly decided against — one-line reason in each body |

## Adding / routing an entry

New entries append (newest at top) to the topic file matching the area they touch, per the table above; when nothing fits cleanly, use `process-conventions.md`. Resolving an entry cuts it from its topic file into `resolved.md` (or `abandoned.md`) — same protocol as before, just across files instead of across sections. The crew-specific routing rule lives in [`.agents/workflow.md`](../.agents/workflow.md) §6; the generic lifecycle is in `~/.claude/CLAUDE.md`.
