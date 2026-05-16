# CREW-146 — Wire chrome MCP + browsing skill into crew dispatch (PR A)

Jira: https://safturento.atlassian.net/browse/CREW-146

## Goal

`crew run` on a `[visual_fidelity]` project writes a worktree `.mcp.json` with a `chrome`
server entry resolved from the installed `superpowers-chrome` plugin, and injects the
plugin's `browsing` skill into the worktree. Plugin-absent degrades gracefully with one
warning. This ticket's autonomous half (PR A) ships Changes 1–6 and 8 of the re-plan;
the interactive half (PR B — `visual-fidelity-check` Step 5 rewrite) is authored
separately because the dispatch sandbox masks `<repo>/.claude/skills/` read-only.

## Relevant files

- `packages/cli/src/lib/mcp-config/` — renamed from `lib/playwright/` (Change 6).
- `packages/cli/src/lib/mcp-config/resolve-superpowers-chrome.ts` — new plugin-cache
  resolver yielding `{ mcpServerPath, skillsRoot }` (Change 1).
- `packages/cli/src/lib/mcp-config/build-mcp-config.ts` — now takes `{ playwright?, chrome? }`
  and emits one `mcpServers` entry per requested server (Changes 2–3).
- `packages/cli/src/lib/mcp-config/write-mcp-file.ts` — resolves and emits the `chrome`
  server, warns once when the plugin is absent (Change 3).
- `packages/cli/src/commands/run.ts`, `resume.ts` — `.mcp.json` write gate widened to
  `[visual_fidelity]` projects; `run.ts` supplies the `browsing` skill source (Changes 4–5).
- `packages/cli/src/lib/run/skill-injection-step.ts` — optional `browsingSkillSource`
  injection branch (Change 5).
- `.agents/dispatch.md` — chrome wiring + `browsing` branch + `covers:` glob (Change 8).

## Decisions

- **`browsing` is not in `CREW_OWNED_SKILLS`** — it is borrowed from a plugin, has a
  different source root, and is gated on plugin presence. A dedicated injection branch in
  `runSkillInjection` keeps "skills crew owns" and "skills crew borrows" honest.
- **Plugin-absent warns exactly once** — in `writeMcpFile`. The skill-injection branch
  stays silent on the same condition to avoid a double warning.
- **Followed the plan over the spec on `fix-pr.ts`** — the spec's Change 4 mentions
  `fix-pr.ts` getting the same gate, but `fix-pr.ts` currently writes no `.mcp.json` at
  all, and the plan (Task 4) scopes the gate to `run.ts` + `resume.ts`. Adding a brand-new
  MCP write to `fix-pr.ts` would be unplanned scope; left for a followup if needed.

## Notes

Plan: `docs/superpowers/plans/2026-05-15-crew-146-chrome-integration.md` (on branch
`docs/crew-146-chrome-replan`). Spec:
`docs/superpowers/specs/2026-05-15-crew-146-chrome-integration-replan.md`.
PR #196 (the pre-CREW-169 implementation) is abandoned.

Backend-only change — no frontend or HTTP-route surface, so dashboard visual smoke and
Bruno API smoke do not apply. Verified via typecheck, lint, and the full `crew-cli` unit
suite (629 tests).
