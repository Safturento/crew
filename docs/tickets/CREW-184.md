# CREW-184 — visual-fidelity-check Step 5 must fail-closed and the prompt must steer to chrome MCP

Jira: https://safturento.atlassian.net/browse/CREW-184

## Goal

Make `visual-fidelity-check` Step 5 (live-DOM verification via `mcp__chrome__use_browser`) actually run when a project has `[visual_fidelity]` configured. Today the chrome MCP server is wired into `.mcp.json` correctly, but two soft signals let agents skip the check silently:

1. The skill workflow logs a "verification gap" and proceeds when `mcp__chrome__use_browser` is unreachable.
2. The dispatch prompt only mentions `mcp__playwright__*` — no nudge that chrome MCP is the right tool for visual fidelity.

After this change, `[visual_fidelity]` projects must surface chrome-unavailable as a blocker, and the dispatch prompt must explicitly direct agents to `mcp__chrome__use_browser` for Step 5.

## Relevant files

- `.claude/skills/visual-fidelity-check/workflow.md` — Step 5 fail-closed treatment (chrome-unavailable on a `[visual_fidelity]` project = blocker, not skip-and-pass).
- `.claude/skills/visual-fidelity-check/SKILL.md` — fail-closed rule alignment in the rationalization tables.
- `packages/cli/src/lib/prompts/templates/ticket-visual-fidelity.md` — add explicit chrome-MCP guidance to the gate block.
- `packages/cli/src/lib/mcp-config/write-mcp-file.ts` (or a new `mcp-log.ts`) — write `/tmp/crew-mcp-<key>.log` with the resolved server paths + plugin-absent warnings so failures are debuggable.
- `packages/cli/src/commands/run.ts` — wire the new log writer into the orchestrator.
- `packages/cli/src/lib/prompts/builders.test.ts` — assert the new chrome-MCP guidance is present in the visual-fidelity block (and absent when `visualFidelity` is undefined).
- `packages/cli/src/lib/mcp-config/write-mcp-file.test.ts` — assert the diagnostic log is written.
- `.agents/dispatch.md` — touch the diagnostic-log row + `last_updated`.

## Decisions

- **Fail-closed scope is `[visual_fidelity]` only.** Non-VF projects keep the existing playwright-MCP smoke flow unchanged. The new requirement piggybacks on the existing `wantsChrome = Boolean(config.visual_fidelity)` gate in `run.ts`.
- **Two MCPs serve different needs.** Playwright MCP stays the behavior-smoke tool; chrome MCP is the visual-fidelity tool. Keep both; just point each to its purpose.
- **Diagnostic log is dispatch-time, host-side.** Write `/tmp/crew-mcp-<key>.log` from the orchestrator at MCP-write time (resolved paths + warnings). Agent's own session can't observe the host's plugin-resolution state.

## Notes

- Empirical baseline (from the ticket description): CREW-179, CREW-181, CREW-182 transcripts each had 0 `mcp__chrome__use_browser` tool_use entries despite the chrome MCP being wired. Re-verified on this worktree: `.mcp.json` contains the chrome server entry pointing at `superpowers-chrome/2.0.0/mcp/dist/index.js`, but CREW-181's transcript shows zero tool_use entries against `mcp__chrome__*` (only the skill workflow's prose mentions the name). The wiring works; the agent never reaches for it.
- The follow-on validation ticket (CREW-185 or similar) will dispatch a UI-touching change and inspect the resulting transcript for ≥1 `mcp__chrome__use_browser` tool_use entry inside Step 5. That ticket is explicitly out-of-scope here.
