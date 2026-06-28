# visual-fidelity-check report — 2026-06-27

**Branch:** CREW-292
**Base:** main
**Touched components:** `SupervisorDrawer` (new), `SupervisorCard` (modified)
**Findings:** 0 high, 1 medium, 2 low (all known/intentional — none block)

## Method

- **Figma reference:** `SupervisorDrawerBody` composite `882:1216` (Composites page) + screen `Runner Page (/runner) - Supervisor Drawer Open` `883:4779` (Dashboard Screens), from `.crew/figma-snapshot`.
- **No `.figma.tsx`:** `SupervisorDrawer` ships no Code Connect mapping by design (the project publishes no Code Connect — see `.agents/design-system.md`). Verified against the snapshot node directly.
- **Structural** (from `882:1216` `enrichment.componentInstances`) + **visual** (live render via chrome MCP at `http://localhost:16932/#/runner`, supervisor forced online, supervisor-log stubbed with the Figma's sample lines).

## Structural check — PASS

| Element         | Figma (enriched)                                                               | Code                                                                                         | Verdict |
| --------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- | ------- |
| Status pill     | Pill `type=pill, color=running, intensity=mid, font=mono`, label `running`     | `<Badge color="running" intensity="mid">running</Badge>` (Badge shape is always `font-mono`) | ✓ match |
| Copy button     | Pill `type=button-xs, color=running, intensity=muted, font=sans`, label `Copy` | `<Button color="running" intensity="muted" size="xs">Copy</Button>`                          | ✓ match |
| Body background | `fills` bound to `background → slate/950` (`#020617`)                          | `Drawer` content = `bg-background` (slate-950)                                               | ✓ match |

## Visual check — PASS (no high-severity divergence)

Live render reproduces the Figma: `crew / runner` breadcrumb + `X` close (top-right), bold `Supervisor` title with the `running` pill inline, the `MANAGEMENT LOG` section header with a `● live` indicator + `Copy` button, and the mono console region rendering the management-log lines. Drawer width (`max-w-3xl`, ~55% of a 1400px viewport) matches the Figma's ~half-viewport panel. No console errors.

## Medium-severity findings

### Finding 1: meta line omits workers / uptime / pid (wire limitation)

- **Kind:** visual
- **File:** `packages/dashboard/src/components/runner/SupervisorDrawer.tsx:74-79`
- **Code:** `heartbeat 5s {lastSeen ? · last seen <ago> : · no heartbeat yet}`
- **Figma reference:** `882:1216` meta line — `heartbeat 5s | workers 4 | uptime 2h 14m | pid 48213`
- **Diff:** the live meta line carries only the 5s heartbeat cadence + last-seen; workers/uptime/pid are absent.
- **Why not fixed:** `SupervisorView` (`runner/types.ts`) carries only `{ online, lastSeen }` — workers/uptime/pid are not on the daemon's heartbeat wire today. The sibling `SupervisorCard` documents the identical limitation. Fixing requires a backend change (widen the heartbeat payload), out of scope for T4. They fill in automatically once the wire grows. **Surfaced, not fixed.**

## Low-severity findings

### Finding 2: meta separator `·` vs Figma `|`

- **Kind:** visual
- **File:** `SupervisorDrawer.tsx:76` (`· last seen …`)
- **Figma:** uses `|` (pipe) between meta items.
- **Recommendation:** accept as-is — `·` is the app-wide meta separator convention (`MetaList` primitive injects `·`; the `SupervisorCard` meta line uses `·` too). Matching the app convention beats matching a one-off Figma glyph.

### Finding 3: header surface (`bg-card` + `border-b`) vs uniform Figma body

- **Kind:** visual
- **File:** `SupervisorDrawer.tsx:43` (header `bg-card border-b border-slate-800`)
- **Figma:** the `SupervisorDrawerBody` background is a single uniform `slate/950` with no header divider.
- **Recommendation:** accept as-is — the plan specifies reusing the agent drawer shell, whose `DrawerHeader` uses exactly this `bg-card` + `border-b` treatment. Consistency with the sibling `AgentDrawer` (the established app drawer convention) is the intended look; the Figma simply didn't model the header surface distinctly. The delta (slate-900 vs slate-950) is barely perceptible.

## Verification gaps

None. Structural data came from the enriched snapshot; the live render was reachable and screenshotted.
