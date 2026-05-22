# CREW-180 — dashboard(TokensByTool): new TokensByTool composite + TokenBarRow primitive

Jira: https://safturento.atlassian.net/browse/CREW-180

Part of Epic CREW-177 (drawer code migration). Blocked by CREW-178 (backend, merged). Blocks CREW-182 (cleanup).

## Goal

Build the `<TokensByTool>` composite (Figma `577:643`) and `<TokenBarRow>` primitive (Figma `555:449`), then wire `TokensByTool` into `AgentBody` reading the `tokens_by_tool` field shipped by CREW-178.

## Relevant files

- `packages/dashboard/src/components/TokenBarRow.tsx` (new) + test + `.figma.tsx`
- `packages/dashboard/src/components/TokensByTool.tsx` (new) + test + `.figma.tsx`
- `packages/dashboard/src/components/AgentBody.tsx` — insert TokensByTool above Timeline inside BodyContainer
- `packages/dashboard/src/data/types.ts` — `AgentDetailTokensByTool` shipped in CREW-178; consume here
- `.crew/figma-snapshot/composites/577-643.png` + `555-449.png` — fidelity baseline

## Decisions

- **Tool name uses `font-mono`** — the Figma renders all body content in mono (matches existing `TokenTable.tsx`); plan draft omitted this on the tool cell.
- **Header has three labels (TOOL / TOKENS / SHARE)** — plan draft used flex with only two labels; the screenshot clearly shows three columns. Align via the same grid template as the body row.
- **Keep the old `TokenTable.tsx` in place for this ticket.** Deletion happens in CREW-182 (cleanup).
- **`BodyContainer` is inline div** — Tailwind `pt-5 px-6 pb-8 gap-7` matches Figma 20/24/32/24 + 28 (per plan).

## Notes

- `AgentDetail.tokens_by_tool` is already in the client `types.ts` (CREW-178 — see lines 79-99).
- `tokens.total` already on `AgentDetail.tokens.total`; reuse for the footer total instead of summing on the client.
