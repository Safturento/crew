# Crew Design System — build conventions

Crew is a **dark-only** dashboard UI (agent-orchestration tooling: agents, runs, tickets, timelines). Slate palette, Hanken Grotesk for UI text, Fira Code for identifiers/meta.

## Wrapping — required

Wrap every app root in `DarkThemeRoot` (exported from the bundle). It puts the `dark` class on `document.documentElement` — Tailwind v4 registers the theme vars with `@property`, so token references resolve at `:root`; without a root-level `dark` class the entire UI silently renders light-mode. Do not add your own theme class on inner divs — it has no effect.

Components that show runner/agent status (`DrawerHeader`, `TopNav`) call react-query hooks. Wrap them in `QueryClientProvider` **imported from this bundle** (`CrewDS.QueryClientProvider`, with `new CrewDS.QueryClient(...)`) — a provider from any other react-query copy will not match and throws "No QueryClient set".

## Styling idiom

Tailwind utility classes, but the shipped stylesheet contains **only the utilities the crew app itself uses** — an arbitrary Tailwind class may not exist. Two safe paths:

- **Semantic token classes** (all verified present): `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-card`, `bg-popover`, `text-popover-foreground`, `text-destructive`, `font-mono`, `rounded-md`. NOT present: `bg-secondary`, `bg-accent`, `text-primary`, `font-sans` (body font is inherited — never set a font class for UI text; use `font-mono` for tickets/paths/meta).
- **Inline styles for layout glue** (`display:flex`, `gap`, `padding`, widths) — always safe.

State color is carried by **components, not classes**: `Badge`, `Tag`, `Button`, `PillBase` take `color` (one of `initializing | queued | running | idle | waiting | pr_open | pr_merged | error | orphaned | finished | white`) and `intensity` (`ghost | muted | mid | loud`). Never hand-build a state chip from color utilities — compose a `Badge`/`Tag`. `StateIcon` is the canonical state disc glyph inside pills.

## Where the truth lives

- `styles.css` → imports `fonts/fonts.css` (Fira Code + Hanken Grotesk `@font-face`) and `_ds_bundle.css` (all compiled utilities + `:root`/`.dark` token definitions). Grep `_ds_bundle.css` before using any utility class you haven't seen in these docs.
- Per-component API: `components/general/<Name>/<Name>.d.ts`; usage patterns: `<Name>.prompt.md`.

## Idiomatic snippet

```jsx
const { DarkThemeRoot, Modal, FormField, Button } = window.CrewDS;

<DarkThemeRoot>
  <Modal title="New run" open onOpenChange={() => {}}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <FormField label="Ticket" placeholder="CREW-123" />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button color="running" intensity="ghost" size="sm">Cancel</Button>
        <Button color="white" intensity="loud" size="sm">Start run</Button>
      </div>
    </div>
  </Modal>
</DarkThemeRoot>
```

Gotchas: `AlertDialogAction`/`AlertDialogCancel` are unstyled by design — pass a `Button` via `asChild`. `DialogContent` ships its own close button. Buttons have no built-in disabled styling — add `className="disabled:opacity-40"` (present in CSS) as the app does.
