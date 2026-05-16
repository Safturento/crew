---
description: Patterns and rules for the crew-dashboard package
last_updated: 2026-05-15
---

# crew-dashboard

React + Vite + Tailwind web UI. Single-page app. No business logic — view over the daemon's API. Live updates via SSE.

## Rules specific to this package

- No business logic in this package. Data comes from the daemon's REST/SSE.
- Components split: cross-section primitives → `src/components/ui/`; feature-scoped → `src/components/<feature>/`.
- Tailwind utilities for styling. Global tokens in `index.css` `@theme` block.
- Tests: Vitest + React Testing Library + jsdom (existing setup).

## When you need it

| Doing                                          | Read                                                      |
| ---------------------------------------------- | --------------------------------------------------------- |
| Writing a React component                      | `.agents/architecture.md`                                 |
| Touching dashboard components or the Figma DS  | `.agents/design-system.md`, `visual-fidelity-check` skill |
| Adding e2e Playwright tests                    | `.agents/testing.md`                                      |
| Running verification                           | `.agents/commands.md`                                     |

## Common gotchas

_To be populated._
