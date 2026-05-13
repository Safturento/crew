# Pill contract correction (Thread A, CREW-135 redo)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the dashboard's pill primitives (Button / Badge / Tag) with the consolidated Figma Pill component set by extracting a shared internal `PillBase`, replacing the boolean `hasIcon` (which rendered a CSS dot) with a proper `icon: ReactNode` slot, dropping trailing-icon usage in favor of leading icons everywhere, and tightening Button's size axis from 8 sizes to 4.

**Architecture:** `PillBase` (new, internal, not exported) owns the shared anatomy — base layout classes, color × intensity surface classes via the existing `pillSurfaceClasses` helper, and the leading icon slot. Three exported wrappers — `Button` (native `<button>`, size axis `xs | sm | md | lg`), `Badge` (native `<span>`, static shape), `Tag` (native `<span>`, static Fira Code 11/17px shape) — each supply their own `shape` string and `as` element to PillBase. `hasIcon` is removed entirely; `icon?: ReactNode` replaces it. `StateBadge.tsx` and `CountBadge.tsx` (and their tests + Code Connect files) are deleted — every caller migrates to `<Badge>`.

**Tech Stack:** React 18, TypeScript, Tailwind v4, class-variance-authority, lucide-react, Vitest, Playwright (e2e — caller validation), `visual-fidelity-check` skill (Step 4 caller audit reads the enriched Figma snapshot to confirm per-instance `intensity` and `Icon` props).

**Spec:** `docs/superpowers/specs/2026-05-13-pill-contract-correction.md`

**Pre-requisite:** Thread B1 (`docs/superpowers/plans/2026-05-13-visual-fidelity-skill-enforcement.md`) MUST be merged before re-dispatching CREW-135. The dispatched agent depends on the new numbered step 8 + injected skill files + PR-gate hook to catch regressions.

---

## Phase 1 — PillBase + wrapper rewrite

### Task 1.1: Add `PillBase` (internal)

**Files:**
- Create: `packages/dashboard/src/components/ui/pill-base.tsx`
- Create: `packages/dashboard/src/components/ui/pill-base.test.tsx`

PillBase is internal to `ui/` — not re-exported from any barrel and never imported outside `ui/{button,badge,tag}.tsx`. It owns layout + surface + icon-slot wiring; everything component-specific (height, radius, padding, font, element tag, size axes) lives in the wrappers.

- [ ] **Step 1: Write the failing test**

Create `packages/dashboard/src/components/ui/pill-base.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PillBase } from './pill-base';

describe('PillBase', () => {
  it('renders the supplied element tag (span by default, button when as="button")', () => {
    const { rerender } = render(<PillBase shape="h-5 px-2">label</PillBase>);
    expect(screen.getByText('label').tagName).toBe('SPAN');

    rerender(<PillBase as="button" shape="h-8 px-3">label</PillBase>);
    expect(screen.getByText('label').tagName).toBe('BUTTON');
  });

  it('applies shape, surface, and base layout classes in that order', () => {
    render(
      <PillBase color="running" intensity="mid" shape="h-5 rounded-full px-2 font-mono text-xs">
        running
      </PillBase>,
    );
    const el = screen.getByText('running');
    // Base layout
    expect(el.className).toContain('inline-flex');
    expect(el.className).toContain('items-center');
    // Shape (wrapper-supplied)
    expect(el.className).toContain('h-5');
    expect(el.className).toContain('rounded-full');
    // Surface (color × intensity)
    expect(el.className).toMatch(/bg-slate-\d+/);
    expect(el.className).toMatch(/border-slate-\d+/);
  });

  it('renders the icon slot before children when icon is provided', () => {
    render(
      <PillBase shape="h-5 px-2" icon={<svg data-testid="icon" />}>label</PillBase>,
    );
    const el = screen.getByText('label');
    expect(el.querySelector('[data-testid="icon"]')).not.toBeNull();
    // Icon precedes children in DOM order
    expect(el.firstElementChild?.getAttribute('data-testid')).toBe('icon');
  });

  it('exposes data-color, data-intensity, data-slot="pill" for downstream introspection', () => {
    render(<PillBase color="waiting" intensity="loud" shape="h-5 px-2">x</PillBase>);
    const el = screen.getByText('x');
    expect(el.dataset.slot).toBe('pill');
    expect(el.dataset.color).toBe('waiting');
    expect(el.dataset.intensity).toBe('loud');
  });
});
```

- [ ] **Step 2: Run tests to confirm fail**

```bash
npm run test --workspace=crew-dashboard -- packages/dashboard/src/components/ui/pill-base.test.tsx 2>&1 | tail -15
```

Expected: failure, "Cannot find module './pill-base'".

- [ ] **Step 3: Implement PillBase**

Create `packages/dashboard/src/components/ui/pill-base.tsx`:

```tsx
import * as React from 'react';

import { cn } from '@/lib/utils';
import { pillSurfaceClasses, type PillColor, type PillIntensity } from '@/lib/pill-variants';

export type PillBaseProps = React.HTMLAttributes<HTMLElement> & {
  color?: PillColor;
  intensity?: PillIntensity;
  icon?: React.ReactNode;
  shape: string;
  as?: 'button' | 'span';
};

export function PillBase({
  color = 'running',
  intensity = 'mid',
  icon,
  shape,
  as = 'span',
  className,
  children,
  ...rest
}: PillBaseProps) {
  const Comp = as as 'button' | 'span';
  return (
    <Comp
      data-slot="pill"
      data-color={color}
      data-intensity={intensity}
      className={cn(
        'inline-flex w-fit items-center whitespace-nowrap',
        shape,
        pillSurfaceClasses(color, intensity),
        className,
      )}
      {...(rest as React.HTMLAttributes<HTMLElement>)}
    >
      {icon}
      {children}
    </Comp>
  );
}
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npm run test --workspace=crew-dashboard -- packages/dashboard/src/components/ui/pill-base.test.tsx 2>&1 | tail -10
```

Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/ui/pill-base.tsx packages/dashboard/src/components/ui/pill-base.test.tsx
git commit -m "feat(dashboard): add internal PillBase for Button/Badge/Tag shared anatomy"
```

### Task 1.2: Rewrite `Button` on top of PillBase

**Files:**
- Modify: `packages/dashboard/src/components/ui/button.tsx`
- Modify: `packages/dashboard/src/components/ui/button.test.tsx`

Drop the legacy `variant` axis (removed in PR #188 already), keep `color × intensity`, replace the 8-size axis with 4 sizes (`xs | sm | md | lg` — note `default` is renamed `md` and the four `icon-*` square variants are removed). Add `icon?: ReactNode`. Surface PillBase via composition.

- [ ] **Step 1: Update the test file**

Replace `packages/dashboard/src/components/ui/button.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';

describe('Button', () => {
  it('renders a native <button> by default', () => {
    render(<Button>hi</Button>);
    expect(screen.getByRole('button').tagName).toBe('BUTTON');
  });

  it.each(['xs', 'sm', 'md', 'lg'] as const)('renders size=%s with the expected height class', (size) => {
    const expectedHeight = { xs: 'h-6', sm: 'h-8', md: 'h-9', lg: 'h-10' }[size];
    render(<Button size={size}>x</Button>);
    expect(screen.getByRole('button').className).toContain(expectedHeight);
  });

  it('renders the icon slot before children', () => {
    render(<Button icon={<svg data-testid="icon" />}>Resume</Button>);
    const btn = screen.getByRole('button', { name: 'Resume' });
    expect(btn.querySelector('[data-testid="icon"]')).not.toBeNull();
  });

  it('renders icon-only when no children are passed (square-ish via flex collapse)', () => {
    render(<Button icon={<svg data-testid="icon" />} aria-label="Close" />);
    const btn = screen.getByRole('button', { name: 'Close' });
    expect(btn.querySelector('[data-testid="icon"]')).not.toBeNull();
    expect(btn.textContent).toBe('');
  });

  it('does not accept "default" as a size value (removed from the type)', () => {
    // @ts-expect-error — `default` is no longer a valid size.
    render(<Button size="default">x</Button>);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test --workspace=crew-dashboard -- packages/dashboard/src/components/ui/button.test.tsx 2>&1 | tail -15
```

Expected: failures — old Button still has the legacy `variant` and 8-size axis.

- [ ] **Step 3: Rewrite Button**

Replace `packages/dashboard/src/components/ui/button.tsx`:

```tsx
import * as React from 'react';
import { Slot } from 'radix-ui';

import { PillBase } from './pill-base';
import type { PillColor, PillIntensity } from '@/lib/pill-variants';

export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg';

const BUTTON_SHAPES: Record<ButtonSize, string> = {
  xs: "h-6 gap-1 rounded-md px-2 text-xs font-medium has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
  sm: "h-8 gap-1.5 rounded-md px-3 text-sm font-medium has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-4",
  md: "h-9 gap-2 rounded-md px-4 text-sm font-medium has-[>svg]:px-3 [&_svg:not([class*='size-'])]:size-4",
  lg: "h-10 gap-2 rounded-md px-6 text-sm font-medium has-[>svg]:px-4 [&_svg:not([class*='size-'])]:size-4",
};

type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'> & {
  color?: PillColor;
  intensity?: PillIntensity;
  size?: ButtonSize;
  icon?: React.ReactNode;
  asChild?: boolean;
};

function Button({
  color = 'white',
  intensity = 'loud',
  size = 'md',
  icon,
  asChild = false,
  children,
  ...rest
}: ButtonProps) {
  if (asChild) {
    // asChild composition: wrap the child but apply PillBase's class string to it.
    return (
      <Slot.Root>
        <PillBase
          as="button"
          color={color}
          intensity={intensity}
          icon={icon}
          shape={BUTTON_SHAPES[size]}
          {...(rest as React.HTMLAttributes<HTMLElement>)}
        >
          {children}
        </PillBase>
      </Slot.Root>
    );
  }
  return (
    <PillBase
      as="button"
      color={color}
      intensity={intensity}
      icon={icon}
      shape={BUTTON_SHAPES[size]}
      {...(rest as React.HTMLAttributes<HTMLElement>)}
    >
      {children}
    </PillBase>
  );
}

export { Button };
```

- [ ] **Step 4: Run tests to confirm pass**

```bash
npm run test --workspace=crew-dashboard -- packages/dashboard/src/components/ui/button.test.tsx 2>&1 | tail -15
```

Expected: 8 passed (4 size cases + 4 other tests). Some pre-existing callers WILL fail typecheck now — that's expected; they get fixed in Phase 2.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/ui/button.tsx packages/dashboard/src/components/ui/button.test.tsx
git commit -m "feat(dashboard): rewrite Button on top of PillBase, 4 sizes, icon slot"
```

### Task 1.3: Rewrite `Badge` on top of PillBase

**Files:**
- Modify: `packages/dashboard/src/components/ui/badge.tsx`
- Modify: `packages/dashboard/src/components/ui/badge.test.tsx`

Drop `hasIcon: boolean` (and the dot it rendered). Add `icon?: ReactNode`. Static shape — no size axis.

- [ ] **Step 1: Update the test file**

Replace `packages/dashboard/src/components/ui/badge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders a native <span>', () => {
    render(<Badge>label</Badge>);
    expect(screen.getByText('label').tagName).toBe('SPAN');
  });

  it('has the static shape (rounded-full, h-5, px-2 py-0.5, font-mono, text-xs)', () => {
    render(<Badge>label</Badge>);
    const el = screen.getByText('label');
    expect(el.className).toContain('rounded-full');
    expect(el.className).toContain('h-5');
    expect(el.className).toContain('font-mono');
    expect(el.className).toContain('text-xs');
  });

  it('renders the icon slot when provided', () => {
    render(<Badge icon={<svg data-testid="icon" />}>Waiting</Badge>);
    expect(screen.getByText('Waiting').querySelector('[data-testid="icon"]')).not.toBeNull();
  });

  it('does NOT accept hasIcon prop (removed from the type)', () => {
    // @ts-expect-error — hasIcon was replaced by `icon`.
    render(<Badge hasIcon>label</Badge>);
  });

  it('defaults to color="running" intensity="mid" (per dashboard convention)', () => {
    render(<Badge>x</Badge>);
    const el = screen.getByText('x');
    expect(el.dataset.color).toBe('running');
    expect(el.dataset.intensity).toBe('mid');
  });
});
```

- [ ] **Step 2: Run tests, confirm fail**

```bash
npm run test --workspace=crew-dashboard -- packages/dashboard/src/components/ui/badge.test.tsx 2>&1 | tail -15
```

Expected: failures — old Badge still has hasIcon.

- [ ] **Step 3: Rewrite Badge**

Replace `packages/dashboard/src/components/ui/badge.tsx`:

```tsx
import * as React from 'react';

import { PillBase } from './pill-base';
import type { PillColor, PillIntensity } from '@/lib/pill-variants';

const BADGE_SHAPE =
  "h-5 gap-1.5 rounded-full px-2 py-0.5 font-mono text-xs leading-none [&_svg:not([class*='size-'])]:size-3";

type BadgeProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'> & {
  color?: PillColor;
  intensity?: PillIntensity;
  icon?: React.ReactNode;
};

function Badge({ color = 'running', intensity = 'mid', icon, children, ...rest }: BadgeProps) {
  return (
    <PillBase
      as="span"
      color={color}
      intensity={intensity}
      icon={icon}
      shape={BADGE_SHAPE}
      {...(rest as React.HTMLAttributes<HTMLElement>)}
    >
      {children}
    </PillBase>
  );
}

export { Badge };
```

- [ ] **Step 4: Run tests, confirm pass**

```bash
npm run test --workspace=crew-dashboard -- packages/dashboard/src/components/ui/badge.test.tsx 2>&1 | tail -15
```

Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/ui/badge.tsx packages/dashboard/src/components/ui/badge.test.tsx
git commit -m "feat(dashboard): rewrite Badge on top of PillBase, drop hasIcon for icon slot"
```

### Task 1.4: Rewrite `Tag` on top of PillBase

**Files:**
- Modify: `packages/dashboard/src/components/ui/tag.tsx`
- Modify: `packages/dashboard/src/components/ui/tag.test.tsx`

Static shape: 17px height, Fira Code mono 11px, 4px radius. Add icon slot.

- [ ] **Step 1: Update the test file**

Replace `packages/dashboard/src/components/ui/tag.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Tag } from './tag';

describe('Tag', () => {
  it('renders a span with 17px height + 4px radius + Fira Code 11', () => {
    render(<Tag>label</Tag>);
    const el = screen.getByText('label');
    expect(el.tagName).toBe('SPAN');
    expect(el.className).toContain('h-[17px]');
    expect(el.className).toContain('rounded-[4px]');
    expect(el.className).toContain('text-[11px]');
    expect(el.className).toContain('font-mono');
  });

  it('renders the icon slot when provided', () => {
    render(<Tag icon={<svg data-testid="icon" />}>tool_call</Tag>);
    expect(screen.getByText('tool_call').querySelector('[data-testid="icon"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run + confirm fail**

```bash
npm run test --workspace=crew-dashboard -- packages/dashboard/src/components/ui/tag.test.tsx 2>&1 | tail -15
```

- [ ] **Step 3: Rewrite Tag**

Replace `packages/dashboard/src/components/ui/tag.tsx`:

```tsx
import * as React from 'react';

import { PillBase } from './pill-base';
import type { PillColor, PillIntensity } from '@/lib/pill-variants';

const TAG_SHAPE =
  "h-[17px] gap-1 rounded-[4px] px-1.5 font-mono text-[11px] leading-none [&_svg:not([class*='size-'])]:size-2.5";

type TagProps = Omit<React.HTMLAttributes<HTMLSpanElement>, 'color'> & {
  color?: PillColor;
  intensity?: PillIntensity;
  icon?: React.ReactNode;
};

function Tag({ color = 'running', intensity = 'mid', icon, children, ...rest }: TagProps) {
  return (
    <PillBase
      as="span"
      color={color}
      intensity={intensity}
      icon={icon}
      shape={TAG_SHAPE}
      {...(rest as React.HTMLAttributes<HTMLElement>)}
    >
      {children}
    </PillBase>
  );
}

export { Tag };
```

- [ ] **Step 4: Run + confirm pass**

```bash
npm run test --workspace=crew-dashboard -- packages/dashboard/src/components/ui/tag.test.tsx 2>&1 | tail -10
```

Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/ui/tag.tsx packages/dashboard/src/components/ui/tag.test.tsx
git commit -m "feat(dashboard): rewrite Tag on top of PillBase with icon slot"
```

### Task 1.5: Delete legacy StateBadge / CountBadge files

> **Note:** PR #188 already deleted StateBadge.tsx, StateBadge.test.tsx, StateBadge.figma.tsx, CountBadge.tsx, CountBadge.test.tsx, CountBadge.figma.tsx. They are NOT on `main`. After this branch is created (fresh from main), those files do not exist. Skip Task 1.5 unless the working tree somehow still contains them (verify with `ls`). If present:

- [ ] **Step 1: Verify presence (skip if absent)**

```bash
ls packages/dashboard/src/components/StateBadge.tsx packages/dashboard/src/components/CountBadge.tsx 2>&1
```

If both are "No such file or directory" — skip the rest of this task. If present, continue:

- [ ] **Step 2: Delete**

```bash
git rm packages/dashboard/src/components/StateBadge.tsx packages/dashboard/src/components/StateBadge.test.tsx packages/dashboard/src/components/StateBadge.figma.tsx packages/dashboard/src/components/CountBadge.tsx packages/dashboard/src/components/CountBadge.test.tsx packages/dashboard/src/components/CountBadge.figma.tsx
git commit -m "chore(dashboard): retire StateBadge and CountBadge (folded into Badge)"
```

---

## Phase 2 — Caller migration

For each caller, the migration is mechanical once the contract is right: replace `intensity="muted"` with `intensity="mid"` for state-badge instances, replace `hasIcon` with `icon={<LucideIcon />}` where Figma's `enrichment.componentProperties.Icon.name` names a specific lucide glyph, and remove trailing Unicode glyphs in favor of leading icons.

**The visual-fidelity-check skill (now invoked at step 8 of the dispatch workflow) is the authoritative oracle for per-instance prop values.** Its Step 4 (caller check) reads each instance's `enrichment.componentProperties` from the snapshot at `<snapshotPath>/screens/<node>.json` and reports the exact `intensity` and `Icon.name` Figma defines for that specific instance. Use the skill's report as the source of truth; don't guess.

Below are the call sites known to need migration based on PR #188's diff and the visual-fidelity-check ultimate-test findings (see `docs/followups.md` for context). Each task ends with a "rerun the gate" sanity check.

### Task 2.1: AgentRow caller migration

**Files:**
- Modify: `packages/dashboard/src/components/AgentRow.tsx`

Two distinct migrations:

- The state badge (`<Badge ... hasIcon>` at the top of the row) needs `intensity="mid"` (not `muted`) and `icon={<LucideIcon />}` where the lucide name comes from the snapshot's enrichment for that state.
- The action buttons (`Resume`, `Finish`, `View PR ↗`, `Provide input`, `Inspect`) currently use the legacy `variant` prop. Migrate to `color × intensity × size` AND replace trailing `↗` with a leading `icon` prop using the lucide name the snapshot declares for the corresponding Figma instance.

- [ ] **Step 1: Update the state badge call site**

Locate `packages/dashboard/src/components/AgentRow.tsx:67-69` (the existing `<Badge role="status" ... intensity="muted" hasIcon>`). Replace with:

```tsx
<Badge role="status" aria-label={meta.label} color={agent.state} intensity="mid" icon={<StateIcon state={agent.state} />}>
  {meta.label}
</Badge>
```

Add a helper component for the state-specific icon at the bottom of the file:

```tsx
import { Circle } from 'lucide-react';
// ...

function StateIcon({ state }: { state: AgentState }) {
  // Per the visual-fidelity snapshot enrichment, state-badge instances use lucide/circle
  // as the Icon INSTANCE_SWAP for all state values. If the per-state enrichment names
  // a different glyph for a specific state, update this map accordingly — read the name
  // from `<snapshotPath>/screens/<node>.json` enrichment.componentProperties.Icon.name.
  return <Circle className="fill-current" aria-hidden />;
}
```

- [ ] **Step 2: Update the action buttons**

For each action button switch-case block (around lines 96-138), replace the legacy variant API with the new contract. Examples (final lucide names come from the visual-fidelity-check skill's enrichment readout):

```tsx
// 'idle' case:
<Button color="running" intensity="mid" size="xs" icon={<Play aria-hidden />} onClick={fire('resume')}>
  Resume
</Button>
<Button color="running" intensity="ghost" size="xs" onClick={fire('finish')}>
  Finish
</Button>

// 'waiting' case:
<Button color="waiting" intensity="loud" size="xs" icon={<ArrowRight aria-hidden />} onClick={fire('provide-input')}>
  Provide input
</Button>

// 'pr_open' case — note: leading icon, NO trailing arrow:
<Button color="running" intensity="mid" size="xs" icon={<GitPullRequest aria-hidden />} asChild>
  <a href={agent.prUrl ?? '#'} target="_blank" rel="noreferrer" onClick={stop}>
    View PR
  </a>
</Button>

// 'error' case:
<Button color="error" intensity="loud" size="xs" icon={<AlertCircle aria-hidden />} onClick={fire('inspect')}>
  Inspect
</Button>
```

Update the imports at the top of `AgentRow.tsx` accordingly:

```tsx
import { AlertCircle, ArrowRight, Circle, GitPullRequest, Play } from 'lucide-react';
```

(Final lucide selection per action: read `enrichment.componentProperties.Icon.name` from each AgentRow instance in the snapshot. The names above are the recorded ones from prior calibration; verify and adjust per the skill's report.)

- [ ] **Step 3: Run AgentRow unit tests + typecheck**

```bash
npm run test --workspace=crew-dashboard -- packages/dashboard/src/components 2>&1 | tail -15
npm run typecheck --workspace=crew-dashboard 2>&1 | tail -10
```

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/components/AgentRow.tsx
git commit -m "feat(dashboard): migrate AgentRow to new Pill contract (icon slots + intensity=mid)"
```

### Task 2.2: AgentBody caller migration

**Files:**
- Modify: `packages/dashboard/src/components/AgentBody.tsx`

Same patterns as AgentRow: state-badge `intensity="muted"` → `mid` + lucide icon, "View PR" / "Open as page" buttons get leading icons (no trailing `↗`).

- [ ] **Step 1: Locate the state badge + action buttons**

Read `packages/dashboard/src/components/AgentBody.tsx` and find the Badge + Button call sites. Mirror the AgentRow migration: replace `intensity="muted"` with `mid` + appropriate `icon` prop on the state badge; convert `View PR ↗` and `Open as page ↗` to leading-icon Button calls. The lucide names: `lucide/git-pull-request` for "View PR", `lucide/arrow-up-right` for "Open as page".

- [ ] **Step 2: Typecheck + test**

```bash
npm run typecheck --workspace=crew-dashboard 2>&1 | tail -10
npm run test --workspace=crew-dashboard -- packages/dashboard/src/components/AgentBody 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/AgentBody.tsx
git commit -m "feat(dashboard): migrate AgentBody to new Pill contract"
```

### Task 2.3: TopNav caller migration

**Files:**
- Modify: `packages/dashboard/src/components/TopNav.tsx`

PR #188's visual-fidelity-check report found two issues here (see `docs/followups.md`):
- The Clear attention button currently has `intensity="mid"` + an override className with `border-white/10`. Figma's frame has NO border — should be `intensity="ghost"`, no border override.
- The attention count badge currently uses `intensity="loud"` (solid amber). Figma uses `intensity="mid"` (hollow with stroke).

- [ ] **Step 1: Apply both fixes**

Locate the Clear attention Button (~line 37). Update to:

```tsx
<Button
  color="running"
  intensity="ghost"
  size="xs"
  onClick={onClearAttention}
  disabled={attentionCount === 0}
  className="disabled:opacity-40"
>
  Clear attention
</Button>
```

Locate the count Badge (~line 47). Update to:

```tsx
<Badge color="waiting" intensity="mid">
  {attentionCount}
</Badge>
```

- [ ] **Step 2: Verify**

```bash
npm run test --workspace=crew-dashboard -- packages/dashboard/src/components/TopNav 2>&1 | tail -10
```

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/TopNav.tsx
git commit -m "feat(dashboard): TopNav uses ghost Clear-attention button + mid count badge"
```

### Task 2.4: Remaining callers — ProjectRow, ProjectSection, ProjectHeader, ProjectsListPage, ui/dialog

**Files:**
- Modify: `packages/dashboard/src/components/ProjectRow.tsx`
- Modify: `packages/dashboard/src/components/ProjectSection.tsx`
- Modify: `packages/dashboard/src/components/ProjectHeader.tsx`
- Modify: `packages/dashboard/src/routes/ProjectsListPage.tsx`
- Modify: `packages/dashboard/src/components/ui/dialog.tsx`
- Modify: `packages/dashboard/src/components/ui/dialog.figma.tsx`

These callers use the legacy `variant` API. Mechanical migration per the new contract — `color × intensity × size` + optional `icon` prop. None of them have known visual-fidelity findings (the previous gate only flagged the AgentRow / TopNav / AgentBody surfaces); rerun the skill at the end of this task to be sure.

- [ ] **Step 1: Migrate each file**

For each caller in the list, replace any `<Button variant="X" size="Y">` with `<Button color="..." intensity="..." size="...">`. Sensible defaults when migrating without per-instance enrichment data:

- `variant="outline"` → `color="white" intensity="mid"` (hollow with border)
- `variant="ghost"` → `color="running" intensity="ghost"` (text only)
- `variant="default"` → `color="white" intensity="loud"` (solid white CTA)
- `variant="destructive"` → `color="error" intensity="loud"`

The visual-fidelity-check skill's Step 4 will correct any of these if Figma's enrichment names a different intensity for a specific instance.

- [ ] **Step 2: Run typecheck + dashboard unit tests**

```bash
npm run typecheck --workspace=crew-dashboard 2>&1 | tail -10
npm run test --workspace=crew-dashboard 2>&1 | tail -15
```

All green.

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/ProjectRow.tsx packages/dashboard/src/components/ProjectSection.tsx packages/dashboard/src/components/ProjectHeader.tsx packages/dashboard/src/routes/ProjectsListPage.tsx packages/dashboard/src/components/ui/dialog.tsx packages/dashboard/src/components/ui/dialog.figma.tsx
git commit -m "feat(dashboard): migrate remaining Button callers to new Pill contract"
```

---

## Phase 3 — Code Connect mapping updates

### Task 3.1: Update `.figma.tsx` files to expose the `Icon` INSTANCE_SWAP

**Files:**
- Modify: `packages/dashboard/src/components/ui/button.figma.tsx`
- Modify: `packages/dashboard/src/components/ui/badge.figma.tsx`
- Modify: `packages/dashboard/src/components/ui/tag.figma.tsx`

Each Code Connect file currently maps `color`, `intensity`, and (Button) `size`. None expose the `Icon` INSTANCE_SWAP. Updating them ensures future Figma Code Connect tools surface the correct icon prop in their suggestions, even though crew's Figma plan is Pro (not Org) and `figma connect publish` doesn't run (per `project_code_connect_skipped` memory — the files stay as inert docs).

- [ ] **Step 1: Update badge.figma.tsx**

Replace `packages/dashboard/src/components/ui/badge.figma.tsx`:

```tsx
import { figma } from '@figma/code-connect';

import { Badge } from '@/components/ui/badge';

figma.connect(Badge, 'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=272-120', {
  variant: { type: 'pill' },
  props: {
    label: figma.string('Label'),
    icon: figma.instance('Icon'),
    color: figma.enum('color', {
      idle: 'idle',
      initializing: 'initializing',
      running: 'running',
      waiting: 'waiting',
      'pr-open': 'pr_open',
      error: 'error',
      finished: 'finished',
      white: 'white',
    }),
    intensity: figma.enum('intensity', {
      ghost: 'ghost',
      muted: 'muted',
      mid: 'mid',
      loud: 'loud',
    }),
  },
  example: ({ label, color, intensity, icon }) => (
    <Badge color={color} intensity={intensity} icon={icon}>
      {label}
    </Badge>
  ),
});
```

- [ ] **Step 2: Update button.figma.tsx**

Mirror the pattern (Button uses `size` mapped from the `type` axis). Add `icon: figma.instance('Icon')`.

- [ ] **Step 3: Update tag.figma.tsx**

Mirror. Add `icon: figma.instance('Icon')`.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck --workspace=crew-dashboard 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/ui/button.figma.tsx packages/dashboard/src/components/ui/badge.figma.tsx packages/dashboard/src/components/ui/tag.figma.tsx
git commit -m "feat(dashboard): expose Icon INSTANCE_SWAP in Code Connect mappings"
```

---

## Phase 4 — Verify, gate, ship

### Task 4.1: Run the visual-fidelity-check skill (the dispatch's new step 8)

This is the load-bearing step. The dispatched agent invokes the skill, which reads `<snapshotPath>/screens/*.json` enrichment and reports any caller-side mismatches.

- [ ] **Step 1: Invoke the skill**

Use the `Skill` tool with `skill: visual-fidelity-check` (the skill files were injected into the worktree by Thread B1's dispatcher step). Walk through the skill's workflow.md procedure.

- [ ] **Step 2: Resolve high-severity findings**

For any high-severity finding, jump back to the appropriate Phase-2 task and fix it. Re-run the skill until zero high-severity remain.

- [ ] **Step 3: Surface medium/low findings**

Capture the skill's report (or a summary of medium/low findings) for inclusion in the PR description.

### Task 4.2: Standard verification

- [ ] **Step 1: All four standard commands**

```bash
npm run typecheck --workspace=crew-dashboard 2>&1 | tail -10
npm run lint 2>&1 | tail -10
npm run test --workspace=crew-dashboard 2>&1 | tail -15
npm run build --workspace=crew-dashboard 2>&1 | tail -10
```

All four must be clean.

- [ ] **Step 2: Bruno smoke**

```bash
npm run bruno:smoke 2>&1 | tail -15
```

Should pass — no daemon API surface changed.

- [ ] **Step 3: Visual smoke via Playwright MCP**

Per the dispatch prompt's visual-smoke section, open the dashboard via Playwright MCP and exercise: agents page, projects page, agent drawer. Confirm state badges show borders (mid intensity), `View PR` buttons show a leading icon, count badges are hollow with stroke.

### Task 4.3: Push and PR

- [ ] **Step 1: Push**

```bash
git push -u origin CREW-135
```

- [ ] **Step 2: Open PR**

```bash
gh pr create --base main --head CREW-135 --title "feat(dashboard): Pill primitives — color × intensity × icon-slot contract (CREW-135 redo)" --body "..."
```

PR description must include:
- Summary of the contract change (PillBase + wrappers, drop hasIcon, icon slot).
- The visual-fidelity-check report (or a summary) showing zero high-severity findings.
- Re-dispatch note: supersedes closed PR #188 + PR #177.
- Link to the spec at `docs/superpowers/specs/2026-05-13-pill-contract-correction.md`.

- [ ] **Step 3: Move CREW-135 to "In Review" via Jira MCP**

---

## Self-review (for the implementing agent)

Before claiming complete:

- [ ] `ui/pill-base.tsx` exists, is not exported from any barrel.
- [ ] No file in `packages/dashboard/` references `hasIcon` anywhere (`grep -rn hasIcon packages/dashboard` returns nothing).
- [ ] No file in `packages/dashboard/` uses `↗` or other Unicode arrow glyphs as button content (`grep -rn '↗\|↑\|→' packages/dashboard/src` returns nothing).
- [ ] `<Button>` callers use `color × intensity × size` only (no `variant=` prop anywhere).
- [ ] AgentRow state badge is `intensity="mid"` (not `muted`) with a lucide icon component (not a CSS dot span).
- [ ] visual-fidelity-check report shows zero high-severity findings.
- [ ] `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build` all clean.

## Verification

PR review: a fresh reviewer reads the new spec, reads the Code Connect files, opens the rendered dashboard at the worktree's APP_URL, and confirms the state badge has a 1px stroke + a lucide icon, the View PR button has a leading icon, the count badge is hollow with stroke. visual-fidelity-check report (linked from PR description) shows zero high-severity findings.

If a regression is found post-merge: surface in `docs/followups.md` per the user-level convention, with anchors to the failing caller. The skill's enforcement (B1) ensures the next dispatch catches it.
