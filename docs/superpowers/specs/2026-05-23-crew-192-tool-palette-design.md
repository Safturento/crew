# CREW-192 — Per-tool color palette inside Tools category

**Ticket:** [CREW-192](https://safturento.atlassian.net/browse/CREW-192)
**Epic:** [CREW-189](https://safturento.atlassian.net/browse/CREW-189)
**Brainstorm canvas:** [Figma — palette preview](https://figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/?node-id=643-859)
**Date:** 2026-05-23

## Goal

Differentiate tools by color in the drawer Timeline so a user can scan for "where did the Bash calls happen" or "is there a cluster of Edit calls" at a glance. Currently every tool renders the same `waiting` (amber) pill, making the Tools category visually flat.

## Non-goals

- **Recoloring non-tool categories.** Conversation / thinking / hooks-and-skills / system stay flat per category (already settled in CREW-187).
- **Theming / light mode.** Dashboard is dark-only today.
- **Per-tool icons in the Tag.** Just colors. Icons are a separate concern.

## Design decisions (brainstormed 2026-05-23)

| Q | Decision |
|---|---|
| Q1 — palette | 14 tools + 1 default. Locked palette below. |
| Q2 — Pill arch | New `toolColor` prop on Pill + new `TOOL_COLOR_CLASSES` module mirroring `STATE_CLASSES`. State enum stays reserved for state semantics. |

## Palette

15 entries, each using a distinct Tailwind color family at the "mid" Pill intensity (dark-tinted bg + 500-weight border + 300-weight text).

| Alias | Tailwind family | Notes |
|---|---|---|
| `Bash` | amber | Shell warning mental model |
| `Edit` | green | Action / mutation |
| `Read` | slate | Neutral (most common tool — doesn't visually compete) |
| `Write` | emerald | Distinct from Edit, sibling vibe |
| `Grep` | violet | Search distinct from Read |
| `TodoWrite` | sky | Light info / planning |
| `Task` | indigo | Delegation / heavyweight |
| `MCP:Jira` | blue | Atlassian cluster |
| `MCP:Figma` | pink | Brand-ish |
| `MCP:Chrome` | cyan | Browser-feeling |
| `MCP:Playwright` | teal | Browser sibling, distinct from Chrome |
| `MCP:Memory` | fuchsia | Distinct & memorable |
| `MCP:Atlassian` | blue | Shares Jira's color (same vendor cluster) |
| `WebFetch` / `WebSearch` | lime | Both "web stuff", grouped on shared color |
| `_default` (unknown) | slate-muted | 600-weight border / 400-weight text — slightly less saturated than `Read` to read as "fallback" |

**Errors override.** `tone === 'error'` continues to force red regardless of `toolColor`. Handled at TranscriptRow's existing `color = tone === 'error' ? 'error' : ...` line.

## Architecture

### `data/tool-colors.ts` — new module

Mirrors the shape of `data/state-meta.ts` `STATE_CLASSES`. Each entry has the same fields Pill needs.

```ts
export type ToolColorKey =
  | 'bash' | 'edit' | 'read' | 'write' | 'grep' | 'todoWrite' | 'task'
  | 'mcpJira' | 'mcpFigma' | 'mcpChrome' | 'mcpPlaywright'
  | 'mcpMemory' | 'mcpAtlassian' | 'webNet' | 'default';

export const TOOL_COLOR_CLASSES: Record<ToolColorKey, {
  text: string;
  bg: string;
  border: string;
  solidBg: string;
  solidBorder: string;
}> = {
  bash:          { text: 'text-amber-300',    bg: 'bg-amber-950/40',    border: 'border-amber-500/60',    solidBg: 'bg-amber-500',    solidBorder: 'border-amber-500' },
  edit:          { text: 'text-green-300',    bg: 'bg-green-950/40',    border: 'border-green-500/60',    solidBg: 'bg-green-500',    solidBorder: 'border-green-500' },
  read:          { text: 'text-slate-300',    bg: 'bg-slate-800/40',    border: 'border-slate-500/60',    solidBg: 'bg-slate-500',    solidBorder: 'border-slate-500' },
  write:         { text: 'text-emerald-300',  bg: 'bg-emerald-950/40',  border: 'border-emerald-500/60',  solidBg: 'bg-emerald-500',  solidBorder: 'border-emerald-500' },
  grep:          { text: 'text-violet-300',   bg: 'bg-violet-950/40',   border: 'border-violet-500/60',   solidBg: 'bg-violet-500',   solidBorder: 'border-violet-500' },
  todoWrite:     { text: 'text-sky-300',      bg: 'bg-sky-950/40',      border: 'border-sky-500/60',      solidBg: 'bg-sky-500',      solidBorder: 'border-sky-500' },
  task:          { text: 'text-indigo-300',   bg: 'bg-indigo-950/40',   border: 'border-indigo-500/60',   solidBg: 'bg-indigo-500',   solidBorder: 'border-indigo-500' },
  mcpJira:       { text: 'text-blue-300',     bg: 'bg-blue-950/40',     border: 'border-blue-500/60',     solidBg: 'bg-blue-500',     solidBorder: 'border-blue-500' },
  mcpFigma:      { text: 'text-pink-300',     bg: 'bg-pink-950/40',     border: 'border-pink-500/60',     solidBg: 'bg-pink-500',     solidBorder: 'border-pink-500' },
  mcpChrome:     { text: 'text-cyan-300',     bg: 'bg-cyan-950/40',     border: 'border-cyan-500/60',     solidBg: 'bg-cyan-500',     solidBorder: 'border-cyan-500' },
  mcpPlaywright: { text: 'text-teal-300',     bg: 'bg-teal-950/40',     border: 'border-teal-500/60',     solidBg: 'bg-teal-500',     solidBorder: 'border-teal-500' },
  mcpMemory:     { text: 'text-fuchsia-300',  bg: 'bg-fuchsia-950/40',  border: 'border-fuchsia-500/60',  solidBg: 'bg-fuchsia-500',  solidBorder: 'border-fuchsia-500' },
  mcpAtlassian:  { text: 'text-blue-300',     bg: 'bg-blue-950/40',     border: 'border-blue-500/60',     solidBg: 'bg-blue-500',     solidBorder: 'border-blue-500' },
  webNet:        { text: 'text-lime-300',     bg: 'bg-lime-950/40',     border: 'border-lime-500/60',     solidBg: 'bg-lime-500',     solidBorder: 'border-lime-500' },
  default:       { text: 'text-slate-400',    bg: 'bg-slate-800/40',    border: 'border-slate-600/60',    solidBg: 'bg-slate-600',    solidBorder: 'border-slate-600' },
};
```

Opacity tweaks (`/40` bg, `/60` border) keep the pill subtle on dark surfaces. Same approach `STATE_CLASSES` uses for non-state colors today.

### `lib/pill-variants.ts` — add `toolColor` axis

Add to `PillBase` (or whatever the internal anatomy component is):

```ts
interface PillSurfaceProps {
  color?: PillColor;           // existing — state colors
  toolColor?: ToolColorKey;    // new — tool colors
  intensity?: PillIntensity;
}

// In pillSurfaceClasses helper:
export function pillSurfaceClasses(
  color: PillColor | undefined,
  toolColor: ToolColorKey | undefined,
  intensity: PillIntensity = 'mid',
) {
  if (toolColor) {
    const klasses = TOOL_COLOR_CLASSES[toolColor];
    return mapIntensityToClasses(klasses, intensity);
  }
  if (color) {
    const klasses = STATE_CLASSES[color];
    return mapIntensityToClasses(klasses, intensity);
  }
  // fallback (shouldn't happen if types are enforced)
  return mapIntensityToClasses(STATE_CLASSES.running, intensity);
}
```

`mapIntensityToClasses` already exists; just reuse it with the tool-color-classes input.

Pill / Tag / Badge components grow a `toolColor?: ToolColorKey` prop that passes through to pill-base. Either `color` OR `toolColor` is set — never both.

### `components/Timeline/event-palette.ts` — new mapping module

```ts
import { type ToolColorKey } from '../../data/tool-colors.js';

const TOOL_COLOR_MAP: Record<string, ToolColorKey> = {
  Bash: 'bash',
  Edit: 'edit',
  Read: 'read',
  Write: 'write',
  Grep: 'grep',
  TodoWrite: 'todoWrite',
  Task: 'task',
  'MCP:Jira': 'mcpJira',
  'MCP:Figma': 'mcpFigma',
  'MCP:Chrome': 'mcpChrome',
  'MCP:Playwright': 'mcpPlaywright',
  'MCP:Memory': 'mcpMemory',
  'MCP:Atlassian': 'mcpAtlassian',
  WebFetch: 'webNet',
  WebSearch: 'webNet',
};

export function colorForTool(aliasedName: string): ToolColorKey {
  return TOOL_COLOR_MAP[aliasedName] ?? 'default';
}
```

### `Timeline/TranscriptRow.tsx` — wire into the tool_use branch

```tsx
import { colorForTool } from './event-palette.js';
import { toolAlias } from '../../format/tool-alias.js';

// In specForAssistantBlock, tool_use branch:
if (isToolUse(block)) {
  const alias = toolAlias(block.name);
  return {
    blockType: 'tool_use',
    category: 'tools',
    tone: 'default',
    tagLabel: alias,                              // already aliased (CREW-187)
    toolColor: colorForTool(alias),               // ← NEW
    oneLiner: truncate(summary),
    timestamp: event.timestamp,
    tokens,
    expanded: prettyJson(block.input),
  };
}
```

`RowSpec` grows an optional `toolColor?: ToolColorKey` field. The `Row` component renders the Tag with `toolColor` when present; else falls through to the existing `CATEGORY_COLOR[spec.category]` lookup.

```tsx
function Row({ spec }: { spec: RowSpec }) {
  // ...
  const tagProps = spec.tone === 'error'
    ? { color: 'error' as const }
    : spec.toolColor
      ? { toolColor: spec.toolColor }
      : { color: CATEGORY_COLOR[spec.category] };

  return (
    <div ...>
      <Tag {...tagProps} intensity="mid">{spec.tagLabel}</Tag>
      {/* ... */}
    </div>
  );
}
```

## Testing

### Unit

`packages/dashboard/src/data/tool-colors.test.ts`:
- TOOL_COLOR_CLASSES has all 15 keys.
- Each entry has text/bg/border/solidBg/solidBorder.
- Tailwind class strings match the spec table.

`packages/dashboard/src/components/Timeline/event-palette.test.ts`:
- `colorForTool('Bash')` → `'bash'`.
- `colorForTool('MCP:Jira')` → `'mcpJira'`.
- `colorForTool('WebFetch')` and `colorForTool('WebSearch')` both → `'webNet'`.
- Unknown tool → `'default'`.

`packages/dashboard/src/components/ui/pill-base.test.tsx` (existing):
- New cases: `toolColor='bash'` applies amber classes.
- `toolColor` precedence over `color` if both somehow set.

`packages/dashboard/src/components/Timeline/TranscriptRow.test.tsx`:
- Tool_use block renders the Tag with the matching tool color.
- Error tool_result still renders red regardless of tool color.
- Non-tool rows (conversation, thinking) still render category colors.

### Visual

`visual-fidelity-check` against the CREW-102 populated fixture: confirm the 6-13 distinct tool aliases each render distinct colors; no two adjacent tools share a color visually-by-accident (besides the intentional Jira/Atlassian blue share).

### Code Connect / doc parity

- `.agents/design-system.md` gets a new entry: `tool-colors.ts` registered alongside `state-meta.ts` under "data modules" (or appropriate section).
- Pill / Tag `.figma.tsx` mappings may need an update to expose the new `toolColor` axis if the Figma Pill set has a corresponding variant. If not, leave the Figma mapping untouched (tool-color is a code-only refinement; Figma still uses the 8 state colors per Crew DS).

## Out of scope

- New Figma variants for the 15 tool colors. Pill stays at 8 state colors in Figma; tool colors are a code-only refinement until/unless we want to mirror them in the DS.
- Pill `intensity` axis combinations for tool colors beyond `mid`. If a future need surfaces (e.g. a "loud" Bash button), extend then.
- Per-tool icons in the Tag. Separate ticket if useful.

## Risks

- **Color overload.** 15 distinct colors at small Tag sizes could feel chaotic in a busy timeline. Mitigation: most timelines use 3-5 tools, so visual variety in practice is contained. If real usage shows fatigue, fold MCP siblings (Chrome/Playwright = browsers, Jira/Atlassian = already shared).
- **Tailwind JIT must see all class strings.** TOOL_COLOR_CLASSES uses string literals so JIT picks them up at build time. Verified by running `npm run build --workspace=crew-dashboard` and inspecting the output bundle.
- **Pill's existing `color` consumers don't pass `toolColor`.** Safe — `toolColor` is optional; default branch falls through to `color`. All existing call sites work unchanged.
- **Color-blindness.** No single color combo for color-blind users. State colors carry the icon + label, which preserve accessibility; tool colors are decorative differentiation. Document this trade-off in the spec.
