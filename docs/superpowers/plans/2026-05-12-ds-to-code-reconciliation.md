# Crew DS → code reconciliation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reconcile the dashboard code with the consolidated Crew Design System (Figma file `9FeJPriqdsdA4n9R5Xsrr8`, post-2026-05-12 reorg) at the component-parity level. Modal screen wiring is out of scope (separate slices).

**Architecture:** Three grouped tickets. T1 (Pill primitives) lands first — it owns the new color × intensity contract that Button + Badge + Tag share via a `lib/pill-variants.ts` helper, and retires StateBadge + CountBadge. T2 (form composites) and T3 (modal infrastructure) run in parallel after T1 since they share no code surface.

**Tech Stack:** React 19, TypeScript, Tailwind v4, shadcn-ui (Radix primitives + cva), `class-variance-authority`, vitest + `@testing-library/react`, `@figma/code-connect`.

**Spec:** [`docs/superpowers/specs/2026-05-12-ds-to-code-reconciliation-design.md`](../specs/2026-05-12-ds-to-code-reconciliation-design.md)

**Working directory:** `packages/dashboard/`

**Deviation from spec:** Code keeps `pr_open` (snake) to match `AgentState` from the daemon API. `.figma.tsx` Code Connect files bridge to Figma's `pr-open` (kebab) via `figma.enum()`. This matches existing convention in `StateBadge.figma.tsx`.

---

## T1 — Pill primitives (sequential; blocks T2 + T3)

Produces: `lib/pill-variants.ts`, rewritten `ui/button.tsx` + `ui/badge.tsx`, new `ui/tag.tsx`, updated `.figma.tsx` files, deleted `StateBadge`/`CountBadge` (`.tsx` + `.test.tsx` + `.figma.tsx`), all caller sites updated.

### Task 1.1: Add `lib/pill-variants.ts` helper

**Files:**

- Create: `packages/dashboard/src/lib/pill-variants.ts`
- Create: `packages/dashboard/src/lib/pill-variants.test.ts`

The helper exposes two pieces:

- `PillColor` / `PillIntensity` types — the union types used by Button/Badge/Tag prop signatures
- `pillSurfaceClasses(color, intensity)` — returns the bg + border + text class fragment as a single string

Color names in code: `idle | initializing | running | waiting | pr_open | error | finished | white`.
Intensity names: `ghost | muted | mid | loud`.

- [ ] **Step 1: Write failing test**

```ts
// packages/dashboard/src/lib/pill-variants.test.ts
import { describe, expect, it } from 'vitest';

import { pillSurfaceClasses } from './pill-variants.js';

describe('pillSurfaceClasses', () => {
  it('loud state colors use solid bg + dark text', () => {
    const result = pillSurfaceClasses('running', 'loud');
    expect(result).toContain('bg-slate-400');
    expect(result).toContain('text-slate-950');
  });

  it('mid state colors layer tinted bg + state-colored stroke + state text', () => {
    const result = pillSurfaceClasses('error', 'mid');
    expect(result).toContain('bg-red-1050');
    expect(result).toContain('border-red-500');
    expect(result).toContain('text-red-400');
  });

  it('muted drops the stroke', () => {
    const result = pillSurfaceClasses('waiting', 'muted');
    expect(result).toContain('bg-amber-1050');
    expect(result).toContain('text-amber-400');
    expect(result).not.toContain('border-amber-500');
  });

  it('ghost is transparent bg with state text', () => {
    const result = pillSurfaceClasses('initializing', 'ghost');
    expect(result).not.toContain('bg-blue');
    expect(result).toContain('text-blue-400');
  });

  it('white/loud is near-white bg with dark text', () => {
    const result = pillSurfaceClasses('white', 'loud');
    expect(result).toContain('bg-neutral-200');
    expect(result).toContain('text-slate-950');
  });

  it('white/mid keeps the bg and adds a slate stroke + dark text', () => {
    const result = pillSurfaceClasses('white', 'mid');
    expect(result).toContain('bg-neutral-200');
    expect(result).toContain('border-slate-500');
    expect(result).toContain('text-slate-950');
  });

  it('pr_open is colored via violet (matches STATE_CLASSES)', () => {
    expect(pillSurfaceClasses('pr_open', 'loud')).toContain('bg-violet-400');
    expect(pillSurfaceClasses('pr_open', 'mid')).toContain('text-violet-400');
  });
});
```

- [ ] **Step 2: Run test (expect failure — module missing)**

```bash
cd packages/dashboard && npm run test -- pill-variants
```

Expected: FAIL with "Cannot find module './pill-variants.js'".

- [ ] **Step 3: Implement the helper**

```ts
// packages/dashboard/src/lib/pill-variants.ts
import { STATE_CLASSES, type StateClassTokens } from '@/data/state-meta';
import type { AgentState } from '@/data/types';

export type PillStateColor = AgentState;
export type PillColor = PillStateColor | 'white';
export type PillIntensity = 'ghost' | 'muted' | 'mid' | 'loud';

const WHITE_CLASSES: StateClassTokens = {
  text: 'text-slate-950',
  bg: 'bg-neutral-200',
  border: 'border-slate-500',
  solidBg: 'bg-neutral-200',
  solidBorder: 'border-slate-500',
};

function tokensFor(color: PillColor): StateClassTokens {
  return color === 'white' ? WHITE_CLASSES : STATE_CLASSES[color];
}

export function pillSurfaceClasses(color: PillColor, intensity: PillIntensity): string {
  const t = tokensFor(color);
  switch (intensity) {
    case 'loud':
      return `${t.solidBg} ${color === 'white' ? 'text-slate-950' : 'text-slate-950'}`;
    case 'mid':
      return `${t.bg} border ${t.border} ${color === 'white' ? 'text-slate-950' : t.text}`;
    case 'muted':
      return `${color === 'white' ? '' : t.bg} ${color === 'white' ? 'text-slate-950' : t.text}`.trim();
    case 'ghost':
      return color === 'white' ? 'text-slate-950' : t.text;
  }
}

export const PILL_COLORS: PillColor[] = [
  'idle',
  'initializing',
  'running',
  'waiting',
  'pr_open',
  'error',
  'finished',
  'white',
];

export const PILL_INTENSITIES: PillIntensity[] = ['ghost', 'muted', 'mid', 'loud'];
```

- [ ] **Step 4: Run test (expect pass)**

```bash
cd packages/dashboard && npm run test -- pill-variants
```

Expected: all 7 assertions pass.

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/lib/pill-variants.ts packages/dashboard/src/lib/pill-variants.test.ts
git commit -m "feat(dashboard): add pill-variants helper for shared color × intensity classes"
```

---

### Task 1.2: Rewrite `ui/button.tsx` + update call sites

**Files:**

- Modify: `packages/dashboard/src/components/ui/button.tsx`
- Modify: `packages/dashboard/src/components/AgentRow.tsx` (lines 98, 101, 122, 127)
- Modify: `packages/dashboard/src/components/AgentBody.tsx` (lines 78, 85)
- Modify: `packages/dashboard/src/components/ui/dialog.tsx` (line 101)
- Test: `packages/dashboard/src/components/ui/button.test.tsx` (new)

Button drops the old `variant` axis. New axes: `color` (8 values) × `intensity` (4 values) × `size` (8 values, including 4 icon-only sizes).

- [ ] **Step 1: Write button test**

```tsx
// packages/dashboard/src/components/ui/button.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Button } from './button.js';

describe('Button', () => {
  it('renders with color + intensity classes from pill-variants', () => {
    render(
      <Button color="running" intensity="mid">
        Resume
      </Button>,
    );
    const btn = screen.getByRole('button', { name: 'Resume' });
    expect(btn.className).toContain('bg-slate-1050');
    expect(btn.className).toContain('text-slate-400');
  });

  it('defaults to color=white, intensity=loud, size=default', () => {
    render(<Button>OK</Button>);
    const btn = screen.getByRole('button', { name: 'OK' });
    expect(btn).toHaveAttribute('data-color', 'white');
    expect(btn).toHaveAttribute('data-intensity', 'loud');
    expect(btn).toHaveAttribute('data-size', 'default');
  });

  it('size=icon-sm renders a square 32×32 button', () => {
    render(<Button size="icon-sm" aria-label="Close" />);
    const btn = screen.getByRole('button', { name: 'Close' });
    expect(btn.className).toContain('size-8');
  });

  it('asChild renders the child element', () => {
    render(
      <Button asChild>
        <a href="/foo">Link</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'Link' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test (expect failure)**

```bash
cd packages/dashboard && npm run test -- button.test
```

Expected: FAIL — Button doesn't accept `color`/`intensity` yet.

- [ ] **Step 3: Rewrite `ui/button.tsx`**

```tsx
// packages/dashboard/src/components/ui/button.tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';
import { pillSurfaceClasses, type PillColor, type PillIntensity } from '@/lib/pill-variants';

const buttonBase =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

const buttonSizes = cva('', {
  variants: {
    size: {
      xs: "h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
      sm: 'h-8 gap-1.5 px-3 text-sm has-[>svg]:px-2.5',
      default: 'h-9 px-4 py-2 text-sm has-[>svg]:px-3',
      lg: 'h-10 px-6 text-sm has-[>svg]:px-4',
      'icon-xs': "size-6 [&_svg:not([class*='size-'])]:size-3",
      'icon-sm': 'size-8',
      'icon-default': 'size-9',
      'icon-lg': 'size-10',
    },
  },
  defaultVariants: { size: 'default' },
});

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonSizes> & {
    color?: PillColor;
    intensity?: PillIntensity;
    asChild?: boolean;
  };

function Button({
  className,
  color = 'white',
  intensity = 'loud',
  size = 'default',
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      data-color={color}
      data-intensity={intensity}
      data-size={size}
      className={cn(
        buttonBase,
        buttonSizes({ size }),
        pillSurfaceClasses(color, intensity),
        className,
      )}
      {...props}
    />
  );
}

export { Button, buttonSizes };
```

- [ ] **Step 4: Update AgentRow.tsx call sites**

In `packages/dashboard/src/components/AgentRow.tsx`, replace each Button:

```tsx
// Was: <Button variant="outline" size="xs" onClick={fire('resume')}>
<Button color="running" intensity="mid" size="xs" onClick={fire('resume')}>

// Was: <Button variant="ghost" size="xs" onClick={fire('finish')}>
<Button color="running" intensity="ghost" size="xs" onClick={fire('finish')}>

// Was: <Button variant="outline" size="xs" asChild>
<Button color="running" intensity="mid" size="xs" asChild>
```

(There are 4 Button instances in AgentRow.tsx — apply per the variant mapping: `outline`→`running/mid`, `ghost`→`running/ghost`.)

- [ ] **Step 5: Update AgentBody.tsx call sites**

In `packages/dashboard/src/components/AgentBody.tsx`, lines 78 + 85 — both are `variant="outline" size="xs" asChild`:

```tsx
<Button color="running" intensity="mid" size="xs" asChild>
```

- [ ] **Step 6: Update `ui/dialog.tsx` line 101**

```tsx
// Was: <Button variant="outline">Close</Button>
<Button color="running" intensity="mid">
  Close
</Button>
```

- [ ] **Step 7: Run typecheck + tests**

```bash
cd packages/dashboard && npm run typecheck && npm run test
```

Expected: typecheck clean, all tests pass (existing AgentRow + AgentBody tests will assert on output that still works since `data-color`/`data-intensity` are new attrs, not breaking).

- [ ] **Step 8: Commit**

```bash
git add packages/dashboard/src/components/ui/button.tsx \
        packages/dashboard/src/components/ui/button.test.tsx \
        packages/dashboard/src/components/AgentRow.tsx \
        packages/dashboard/src/components/AgentBody.tsx \
        packages/dashboard/src/components/ui/dialog.tsx
git commit -m "feat(dashboard): button → color × intensity contract, drop legacy variant axis"
```

---

### Task 1.3: Rewrite `ui/badge.tsx` + delete StateBadge & CountBadge + update callers

**Files:**

- Modify: `packages/dashboard/src/components/ui/badge.tsx`
- Create: `packages/dashboard/src/components/ui/badge.test.tsx`
- Delete: `packages/dashboard/src/components/StateBadge.tsx`
- Delete: `packages/dashboard/src/components/StateBadge.test.tsx`
- Delete: `packages/dashboard/src/components/CountBadge.tsx`
- Delete: `packages/dashboard/src/components/CountBadge.test.tsx`
- Modify: `packages/dashboard/src/components/AgentRow.tsx` (StateBadge usages)
- Modify: `packages/dashboard/src/components/AgentBody.tsx` (StateBadge usages)
- Modify: `packages/dashboard/src/components/ProjectRow.tsx` (CountBadge usages)

Badge takes `color` + `intensity` + `hasIcon` (optional dot). Renders the human-readable label as `children`.

- [ ] **Step 1: Write badge test**

```tsx
// packages/dashboard/src/components/ui/badge.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Badge } from './badge.js';

describe('Badge', () => {
  it('renders children + applies color/intensity classes', () => {
    render(
      <Badge color="running" intensity="mid">
        Running
      </Badge>,
    );
    const b = screen.getByText('Running');
    expect(b.className).toContain('bg-slate-1050');
    expect(b.className).toContain('text-slate-400');
  });

  it('renders a dot when hasIcon is true', () => {
    render(
      <Badge color="waiting" intensity="muted" hasIcon>
        Waiting
      </Badge>,
    );
    expect(screen.getByTestId('badge-dot')).toBeInTheDocument();
  });

  it('exposes color/intensity as data attributes', () => {
    render(
      <Badge color="error" intensity="loud">
        Err
      </Badge>,
    );
    const b = screen.getByText('Err');
    expect(b).toHaveAttribute('data-color', 'error');
    expect(b).toHaveAttribute('data-intensity', 'loud');
  });

  it('defaults to color=running, intensity=mid', () => {
    render(<Badge>Default</Badge>);
    const b = screen.getByText('Default');
    expect(b).toHaveAttribute('data-color', 'running');
    expect(b).toHaveAttribute('data-intensity', 'mid');
  });
});
```

- [ ] **Step 2: Rewrite `ui/badge.tsx`**

```tsx
// packages/dashboard/src/components/ui/badge.tsx
import * as React from 'react';
import { Slot } from 'radix-ui';

import { cn } from '@/lib/utils';
import { pillSurfaceClasses, type PillColor, type PillIntensity } from '@/lib/pill-variants';
import { STATE_CLASSES } from '@/data/state-meta';
import type { AgentState } from '@/data/types';

type BadgeProps = React.ComponentProps<'span'> & {
  color?: PillColor;
  intensity?: PillIntensity;
  hasIcon?: boolean;
  asChild?: boolean;
};

function dotClass(color: PillColor): string {
  if (color === 'white') return 'bg-slate-500';
  return STATE_CLASSES[color as AgentState].solidBg;
}

function Badge({
  className,
  color = 'running',
  intensity = 'mid',
  hasIcon = false,
  asChild = false,
  children,
  ...props
}: BadgeProps) {
  const Comp = asChild ? Slot.Root : 'span';
  return (
    <Comp
      data-slot="badge"
      data-color={color}
      data-intensity={intensity}
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-0.5 font-mono text-xs leading-none whitespace-nowrap',
        pillSurfaceClasses(color, intensity),
        className,
      )}
      {...props}
    >
      {hasIcon && (
        <span
          data-testid="badge-dot"
          aria-hidden
          className={cn('inline-block h-1.5 w-1.5 rounded-full', dotClass(color))}
        />
      )}
      {children}
    </Comp>
  );
}

export { Badge };
```

- [ ] **Step 3: Update AgentRow.tsx**

Find usages of `<StateBadge state={...} />` and replace with `<Badge color={state} intensity="muted" hasIcon>{STATE_META[state].label}</Badge>`. Import `STATE_META` from `@/data/state-meta`. Remove the `StateBadge` import.

- [ ] **Step 4: Update AgentBody.tsx + ProjectRow.tsx similarly**

ProjectRow uses CountBadge — replace `<CountBadge count={n} state={s} />` with:

```tsx
{
  count === 0 ? (
    <span className="font-mono text-xs text-muted-foreground">0</span>
  ) : (
    <Badge color={state} intensity="mid">
      {count}
    </Badge>
  );
}
```

(Keep the count===0 muted case inline; Badge handles count>0.)

- [ ] **Step 5: Delete obsolete component files**

```bash
cd packages/dashboard
rm src/components/StateBadge.tsx src/components/StateBadge.test.tsx
rm src/components/CountBadge.tsx src/components/CountBadge.test.tsx
```

(The `.figma.tsx` files for StateBadge and CountBadge get deleted in Task 1.5 along with the rest of the Code Connect updates.)

- [ ] **Step 6: Run typecheck + full test suite**

```bash
cd packages/dashboard && npm run typecheck && npm run test
```

Expected: typecheck clean, all tests pass. AgentRow.test.tsx + AgentBody.test.tsx + ProjectRow.test.tsx may need assertion tweaks if they referenced StateBadge/CountBadge testids — update those to assert on Badge's `data-color`/`data-intensity` instead.

- [ ] **Step 7: Commit**

```bash
git add packages/dashboard/src/components/ui/badge.tsx \
        packages/dashboard/src/components/ui/badge.test.tsx \
        packages/dashboard/src/components/AgentRow.tsx \
        packages/dashboard/src/components/AgentBody.tsx \
        packages/dashboard/src/components/ProjectRow.tsx
git add -u packages/dashboard/src/components/StateBadge.tsx \
           packages/dashboard/src/components/StateBadge.test.tsx \
           packages/dashboard/src/components/CountBadge.tsx \
           packages/dashboard/src/components/CountBadge.test.tsx
git commit -m "feat(dashboard): badge → color × intensity contract, retire StateBadge + CountBadge"
```

---

### Task 1.4: New `ui/tag.tsx`

**Files:**

- Create: `packages/dashboard/src/components/ui/tag.tsx`
- Create: `packages/dashboard/src/components/ui/tag.test.tsx`

Tag is a small Fira Code mono chip for tool-call rows in the agent transcript (Figma type=tag). 17px high, smaller padding than Badge.

- [ ] **Step 1: Write tag test**

```tsx
// packages/dashboard/src/components/ui/tag.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Tag } from './tag.js';

describe('Tag', () => {
  it('renders children with mono font + small height', () => {
    render(
      <Tag color="finished" intensity="mid">
        Edit
      </Tag>,
    );
    const t = screen.getByText('Edit');
    expect(t.className).toContain('font-mono');
    expect(t.className).toContain('h-[17px]');
  });

  it('exposes color/intensity as data attributes', () => {
    render(
      <Tag color="waiting" intensity="muted">
        Bash
      </Tag>,
    );
    const t = screen.getByText('Bash');
    expect(t).toHaveAttribute('data-color', 'waiting');
    expect(t).toHaveAttribute('data-intensity', 'muted');
  });
});
```

- [ ] **Step 2: Implement Tag**

```tsx
// packages/dashboard/src/components/ui/tag.tsx
import * as React from 'react';

import { cn } from '@/lib/utils';
import { pillSurfaceClasses, type PillColor, type PillIntensity } from '@/lib/pill-variants';

type TagProps = React.ComponentProps<'span'> & {
  color?: PillColor;
  intensity?: PillIntensity;
};

function Tag({ className, color = 'running', intensity = 'mid', children, ...props }: TagProps) {
  return (
    <span
      data-slot="tag"
      data-color={color}
      data-intensity={intensity}
      className={cn(
        'inline-flex h-[17px] w-fit items-center rounded-[4px] px-1.5 font-mono text-[11px] leading-none whitespace-nowrap',
        pillSurfaceClasses(color, intensity),
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

export { Tag };
```

- [ ] **Step 3: Run test (expect pass)**

```bash
cd packages/dashboard && npm run test -- tag.test
```

- [ ] **Step 4: Commit**

```bash
git add packages/dashboard/src/components/ui/tag.tsx packages/dashboard/src/components/ui/tag.test.tsx
git commit -m "feat(dashboard): add Tag primitive (Fira Code chip for tool-call rows)"
```

---

### Task 1.5: Code Connect updates for Button + Badge + new Tag; delete StateBadge/CountBadge figma files

**Files:**

- Modify: `packages/dashboard/src/components/ui/button.figma.tsx`
- Modify: `packages/dashboard/src/components/ui/badge.figma.tsx`
- Create: `packages/dashboard/src/components/ui/tag.figma.tsx`
- Delete: `packages/dashboard/src/components/StateBadge.figma.tsx`
- Delete: `packages/dashboard/src/components/CountBadge.figma.tsx`

Pill set node ID: `272:120` in file `9FeJPriqdsdA4n9R5Xsrr8`.

- [ ] **Step 1: Rewrite `button.figma.tsx`**

```tsx
// packages/dashboard/src/components/ui/button.figma.tsx
import { figma } from '@figma/code-connect';

import { Button } from '@/components/ui/button';

figma.connect(Button, 'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=272-120', {
  variant: {
    type: [
      'button-xs',
      'button-sm',
      'button-default',
      'button-lg',
      'button-icon-xs',
      'button-icon-sm',
      'button-icon-default',
      'button-icon-lg',
    ],
  },
  props: {
    label: figma.string('Label'),
    hasIcon: figma.boolean('Has Icon'),
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
    size: figma.enum('type', {
      'button-xs': 'xs',
      'button-sm': 'sm',
      'button-default': 'default',
      'button-lg': 'lg',
      'button-icon-xs': 'icon-xs',
      'button-icon-sm': 'icon-sm',
      'button-icon-default': 'icon-default',
      'button-icon-lg': 'icon-lg',
    }),
  },
  example: ({ label, color, intensity, size }) => (
    <Button color={color} intensity={intensity} size={size}>
      {label}
    </Button>
  ),
});
```

- [ ] **Step 2: Rewrite `badge.figma.tsx`**

```tsx
// packages/dashboard/src/components/ui/badge.figma.tsx
import { figma } from '@figma/code-connect';

import { Badge } from '@/components/ui/badge';

figma.connect(Badge, 'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=272-120', {
  variant: { type: 'pill' },
  props: {
    label: figma.string('Label'),
    hasIcon: figma.boolean('Has Icon'),
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
  example: ({ label, color, intensity, hasIcon }) => (
    <Badge color={color} intensity={intensity} hasIcon={hasIcon}>
      {label}
    </Badge>
  ),
});
```

- [ ] **Step 3: Create `tag.figma.tsx`**

```tsx
// packages/dashboard/src/components/ui/tag.figma.tsx
import { figma } from '@figma/code-connect';

import { Tag } from '@/components/ui/tag';

figma.connect(Tag, 'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=272-120', {
  variant: { type: 'tag' },
  props: {
    label: figma.string('Label'),
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
  example: ({ label, color, intensity }) => (
    <Tag color={color} intensity={intensity}>
      {label}
    </Tag>
  ),
});
```

- [ ] **Step 4: Delete obsolete figma files**

```bash
cd packages/dashboard
rm src/components/StateBadge.figma.tsx src/components/CountBadge.figma.tsx
```

- [ ] **Step 5: Verify typecheck still clean**

```bash
cd packages/dashboard && npm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add packages/dashboard/src/components/ui/button.figma.tsx \
        packages/dashboard/src/components/ui/badge.figma.tsx \
        packages/dashboard/src/components/ui/tag.figma.tsx
git add -u packages/dashboard/src/components/StateBadge.figma.tsx \
           packages/dashboard/src/components/CountBadge.figma.tsx
git commit -m "feat(dashboard): Code Connect — point Button/Badge at unified Pill, add Tag, retire StateBadge/CountBadge mappings"
```

---

### T1 verification step

After all 5 T1 tasks land, run:

```bash
cd packages/dashboard && npm run typecheck && npm run lint && npm run test && npm run build
```

Expected: all clean. Then spin up the dashboard locally (or via worktree docker compose) and eyeball the Agents page + Projects page for visual regression. Compare against `https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew` agent drawer + project page screens.

---

## T2 — Form composites (parallel with T3; blocked by T1)

### Task 2.1: Install shadcn switch + author Code Connect

**Files:**

- Create: `packages/dashboard/src/components/ui/switch.tsx` (via shadcn cli)
- Create: `packages/dashboard/src/components/ui/switch.figma.tsx`
- Create: `packages/dashboard/src/components/ui/switch.test.tsx`

- [ ] **Step 1: Run shadcn install**

```bash
cd packages/dashboard && npx shadcn@latest add switch
```

This creates `src/components/ui/switch.tsx`. Inspect the file — it imports from `@radix-ui/react-switch`. May need a dependency install (`npm install @radix-ui/react-switch -w crew-dashboard`).

- [ ] **Step 2: Write switch test**

```tsx
// packages/dashboard/src/components/ui/switch.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Switch } from './switch.js';

describe('Switch', () => {
  it('renders an unchecked switch by default', () => {
    render(<Switch aria-label="Live" />);
    const s = screen.getByRole('switch', { name: 'Live' });
    expect(s).toHaveAttribute('data-state', 'unchecked');
  });

  it('renders checked when prop is set', () => {
    render(<Switch aria-label="Live" checked onCheckedChange={() => {}} />);
    expect(screen.getByRole('switch')).toHaveAttribute('data-state', 'checked');
  });
});
```

- [ ] **Step 3: Run test (expect pass — shadcn install gives a working component)**

```bash
cd packages/dashboard && npm run test -- switch.test
```

- [ ] **Step 4: Create `switch.figma.tsx`**

```tsx
// packages/dashboard/src/components/ui/switch.figma.tsx
import { figma } from '@figma/code-connect';

import { Switch } from '@/components/ui/switch';

figma.connect(Switch, 'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=335-242', {
  props: {
    checked: figma.enum('state', { on: true, off: false }),
  },
  example: ({ checked }) => <Switch checked={checked} onCheckedChange={() => {}} />,
});
```

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/ui/switch.tsx \
        packages/dashboard/src/components/ui/switch.test.tsx \
        packages/dashboard/src/components/ui/switch.figma.tsx \
        packages/dashboard/package.json packages/dashboard/package-lock.json
git commit -m "feat(dashboard): add shadcn Switch primitive + Code Connect mapping"
```

---

### Task 2.2: Add `leadingIcon` prop to `ui/input.tsx`

**Files:**

- Modify: `packages/dashboard/src/components/ui/input.tsx`
- Modify: `packages/dashboard/src/components/ui/input.figma.tsx`
- Create: `packages/dashboard/src/components/ui/input.test.tsx`

- [ ] **Step 1: Write test for leading icon support**

```tsx
// packages/dashboard/src/components/ui/input.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Search } from 'lucide-react';

import { Input } from './input.js';

describe('Input', () => {
  it('renders a plain input by default', () => {
    render(<Input placeholder="name" />);
    expect(screen.getByPlaceholderText('name')).toBeInTheDocument();
    expect(screen.queryByTestId('input-leading-icon')).not.toBeInTheDocument();
  });

  it('renders a leading icon when leadingIcon is provided', () => {
    render(<Input placeholder="search" leadingIcon={<Search data-testid="search-icon" />} />);
    expect(screen.getByTestId('input-leading-icon')).toBeInTheDocument();
    expect(screen.getByTestId('search-icon')).toBeInTheDocument();
  });

  it('applies extra left padding to the input when leadingIcon is set', () => {
    render(<Input leadingIcon={<Search />} aria-label="search" />);
    expect(screen.getByLabelText('search').className).toContain('pl-9');
  });
});
```

- [ ] **Step 2: Update `ui/input.tsx`**

```tsx
// packages/dashboard/src/components/ui/input.tsx
import * as React from 'react';

import { cn } from '@/lib/utils';

type InputProps = React.ComponentProps<'input'> & {
  leadingIcon?: React.ReactNode;
};

function Input({ className, type, leadingIcon, ...props }: InputProps) {
  const inputEl = (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30',
        'focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
        'aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
        leadingIcon && 'pl-9',
        className,
      )}
      {...props}
    />
  );

  if (!leadingIcon) return inputEl;

  return (
    <div className="relative w-full">
      <span
        data-testid="input-leading-icon"
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground [&_svg]:size-4"
        aria-hidden
      >
        {leadingIcon}
      </span>
      {inputEl}
    </div>
  );
}

export { Input };
```

- [ ] **Step 3: Run test (expect pass)**

```bash
cd packages/dashboard && npm run test -- input.test
```

- [ ] **Step 4: Update `input.figma.tsx`**

```tsx
// packages/dashboard/src/components/ui/input.figma.tsx
import { figma } from '@figma/code-connect';
import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';

figma.connect(Input, 'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=318-230', {
  props: {
    placeholder: figma.string('Placeholder'),
    hasIcon: figma.boolean('Has Icon'),
  },
  example: ({ placeholder, hasIcon }) => (
    <Input placeholder={placeholder} {...(hasIcon ? { leadingIcon: <Search /> } : {})} />
  ),
});
```

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/ui/input.tsx \
        packages/dashboard/src/components/ui/input.test.tsx \
        packages/dashboard/src/components/ui/input.figma.tsx
git commit -m "feat(dashboard): input gains optional leadingIcon prop (for search inputs)"
```

---

### Task 2.3: New `FormField` composite

**Files:**

- Create: `packages/dashboard/src/components/FormField.tsx`
- Create: `packages/dashboard/src/components/FormField.test.tsx`
- Create: `packages/dashboard/src/components/FormField.figma.tsx`

- [ ] **Step 1: Write FormField test**

```tsx
// packages/dashboard/src/components/FormField.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FormField } from './FormField.js';

describe('FormField', () => {
  it('renders the label associated with the input', () => {
    render(<FormField label="Project name" placeholder="my-project" />);
    const label = screen.getByText('Project name');
    const input = screen.getByPlaceholderText('my-project');
    expect(label).toBeInTheDocument();
    expect(input).toBeInTheDocument();
    expect((label as HTMLLabelElement).htmlFor).toBe(input.id);
  });

  it('passes through value + onChange to the Input', () => {
    const handler = vi.fn();
    render(<FormField label="Name" value="x" onChange={handler} />);
    expect(screen.getByDisplayValue('x')).toBeInTheDocument();
  });
});
```

(Add `import { vi } from 'vitest';` at top.)

- [ ] **Step 2: Implement FormField**

```tsx
// packages/dashboard/src/components/FormField.tsx
import * as React from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type FormFieldProps = React.ComponentProps<typeof Input> & {
  label: string;
  labelClassName?: string;
};

function FormField({ label, labelClassName, id, className, ...inputProps }: FormFieldProps) {
  const generatedId = React.useId();
  const fieldId = id ?? generatedId;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label
        htmlFor={fieldId}
        className={cn('text-xs font-normal text-muted-foreground uppercase', labelClassName)}
      >
        {label}
      </Label>
      <Input id={fieldId} {...inputProps} />
    </div>
  );
}

export { FormField };
```

- [ ] **Step 3: Run test (expect pass)**

```bash
cd packages/dashboard && npm run test -- FormField.test
```

- [ ] **Step 4: Create `FormField.figma.tsx`**

```tsx
// packages/dashboard/src/components/FormField.figma.tsx
import { figma } from '@figma/code-connect';

import { FormField } from '@/components/FormField';

figma.connect(
  FormField,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=337-234',
  {
    props: {
      label: figma.string('Label'),
    },
    example: ({ label }) => <FormField label={label} placeholder="" />,
  },
);
```

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/FormField.tsx \
        packages/dashboard/src/components/FormField.test.tsx \
        packages/dashboard/src/components/FormField.figma.tsx
git commit -m "feat(dashboard): add FormField composite (Label + Input vertical stack)"
```

---

## T3 — Modal infrastructure (parallel with T2; blocked by T1)

### Task 3.1: Install shadcn alert-dialog

**Files:**

- Create: `packages/dashboard/src/components/ui/alert-dialog.tsx` (via shadcn cli)

- [ ] **Step 1: Run shadcn install**

```bash
cd packages/dashboard && npx shadcn@latest add alert-dialog
```

Inspect generated file — uses `@radix-ui/react-alert-dialog`. Install dep if cli didn't auto-install:

```bash
npm install @radix-ui/react-alert-dialog -w crew-dashboard
```

- [ ] **Step 2: Typecheck**

```bash
cd packages/dashboard && npm run typecheck
```

Expected: clean. shadcn-generated file references `@/components/ui/button` — which now exports the updated Button. The shadcn template uses `<AlertDialogAction>` etc. as wrappers around Button, which our color/intensity Button still satisfies via `asChild`.

If the generated file uses `variant="..."` (legacy Button API), update those references to `color` + `intensity` to match Task 1.2.

- [ ] **Step 3: Commit**

```bash
git add packages/dashboard/src/components/ui/alert-dialog.tsx \
        packages/dashboard/package.json packages/dashboard/package-lock.json
git commit -m "feat(dashboard): add shadcn AlertDialog primitive"
```

---

### Task 3.2: Build `Modal` composite

**Files:**

- Create: `packages/dashboard/src/components/Modal.tsx`
- Create: `packages/dashboard/src/components/Modal.test.tsx`
- Create: `packages/dashboard/src/components/Modal.figma.tsx`

Modal wraps shadcn Dialog with Crew dark styling (slate-950 bg, 14px radius, drop shadow). Provides title bar with optional close button. Body = children.

- [ ] **Step 1: Write Modal test**

```tsx
// packages/dashboard/src/components/Modal.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Modal } from './Modal.js';

describe('Modal', () => {
  it('renders the title + children when open', () => {
    render(
      <Modal title="Register" open onOpenChange={() => {}}>
        <p>body content</p>
      </Modal>,
    );
    expect(screen.getByText('Register')).toBeInTheDocument();
    expect(screen.getByText('body content')).toBeInTheDocument();
  });

  it('hides the close button when showClose=false', () => {
    render(
      <Modal title="X" open showClose={false} onOpenChange={() => {}}>
        <p />
      </Modal>,
    );
    expect(screen.queryByRole('button', { name: /close/i })).not.toBeInTheDocument();
  });

  it('calls onOpenChange(false) when close is clicked', () => {
    const handler = vi.fn();
    render(
      <Modal title="X" open onOpenChange={handler}>
        <p />
      </Modal>,
    );
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(handler).toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: Implement Modal**

```tsx
// packages/dashboard/src/components/Modal.tsx
import * as React from 'react';
import { X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type ModalProps = {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showClose?: boolean;
  children: React.ReactNode;
};

function Modal({ title, open, onOpenChange, showClose = true, children }: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="w-[560px] gap-0 border border-border bg-slate-950 p-0 shadow-[0_30px_80px_-10px_rgba(0,0,0,0.7)]"
        showCloseButton={false}
      >
        <DialogHeader className="flex flex-row items-center justify-between border-b border-border px-3.5 py-3.5 pt-5.5">
          <DialogTitle className="text-sm font-medium text-foreground">{title}</DialogTitle>
          {showClose && (
            <Button
              color="running"
              intensity="ghost"
              size="icon-sm"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
            >
              <X />
            </Button>
          )}
        </DialogHeader>
        <div className="px-3.5 py-4">{children}</div>
      </DialogContent>
    </Dialog>
  );
}

export { Modal };
```

Note: `DialogContent` already accepts a `showCloseButton` prop (added in CREW-124 / 2026-05-09). Passing `showCloseButton={false}` suppresses shadcn's built-in close in favor of Modal's own header close button. No change required to `ui/dialog.tsx`.

- [ ] **Step 3: Run Modal tests**

```bash
cd packages/dashboard && npm run test -- Modal.test
```

Expected: all pass.

- [ ] **Step 4: Create `Modal.figma.tsx`**

```tsx
// packages/dashboard/src/components/Modal.figma.tsx
import { figma } from '@figma/code-connect';

import { Modal } from '@/components/Modal';

figma.connect(Modal, 'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=355-238', {
  props: {
    title: figma.string('Title'),
    showClose: figma.boolean('Show Close'),
    // Content is INSTANCE_SWAP in Figma; in code we pass arbitrary children
    content: figma.instance('Content'),
  },
  example: ({ title, showClose, content }) => (
    <Modal title={title} showClose={showClose} open onOpenChange={() => {}}>
      {content}
    </Modal>
  ),
});
```

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Modal.tsx \
        packages/dashboard/src/components/Modal.test.tsx \
        packages/dashboard/src/components/Modal.figma.tsx
git commit -m "feat(dashboard): add Modal composite (Crew dark styling over shadcn Dialog)"
```

---

### Task 3.3: Build `AlertModal` composite

**Files:**

- Create: `packages/dashboard/src/components/AlertModal.tsx`
- Create: `packages/dashboard/src/components/AlertModal.test.tsx`
- Create: `packages/dashboard/src/components/AlertModal.figma.tsx`

- [ ] **Step 1: Write AlertModal test**

```tsx
// packages/dashboard/src/components/AlertModal.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AlertModal } from './AlertModal.js';

describe('AlertModal', () => {
  it('renders title + description + default Cancel/Continue labels', () => {
    render(
      <AlertModal
        title="Remove project?"
        description="This is destructive."
        open
        onOpenChange={() => {}}
        onAction={() => {}}
      />,
    );
    expect(screen.getByText('Remove project?')).toBeInTheDocument();
    expect(screen.getByText('This is destructive.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
  });

  it('fires onAction when the action button is clicked', () => {
    const handler = vi.fn();
    render(
      <AlertModal
        title="X"
        description="Y"
        actionLabel="Remove project"
        open
        onOpenChange={() => {}}
        onAction={handler}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Remove project' }));
    expect(handler).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement AlertModal**

```tsx
// packages/dashboard/src/components/AlertModal.tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { pillSurfaceClasses, type PillColor, type PillIntensity } from '@/lib/pill-variants';
import { cn } from '@/lib/utils';

type AlertModalProps = {
  title: string;
  description: string;
  cancelLabel?: string;
  actionLabel?: string;
  actionColor?: PillColor;
  actionIntensity?: PillIntensity;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancel?: () => void;
  onAction?: () => void;
};

function AlertModal({
  title,
  description,
  cancelLabel = 'Cancel',
  actionLabel = 'Continue',
  actionColor = 'error',
  actionIntensity = 'loud',
  open,
  onOpenChange,
  onCancel,
  onAction,
}: AlertModalProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="w-[440px] gap-2.5 border border-border bg-slate-950 p-5.5 shadow-[0_30px_80px_-10px_rgba(0,0,0,0.7)]">
        <AlertDialogTitle className="text-base font-semibold text-foreground">
          {title}
        </AlertDialogTitle>
        <AlertDialogDescription className="text-sm text-muted-foreground">
          {description}
        </AlertDialogDescription>
        <AlertDialogFooter className="mt-2 flex flex-row justify-end gap-2">
          <AlertDialogCancel asChild>
            <Button color="running" intensity="mid" size="sm" onClick={onCancel}>
              {cancelLabel}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <Button color={actionColor} intensity={actionIntensity} size="sm" onClick={onAction}>
              {actionLabel}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export { AlertModal };
```

- [ ] **Step 3: Run tests**

```bash
cd packages/dashboard && npm run test -- AlertModal.test
```

- [ ] **Step 4: Create `AlertModal.figma.tsx`**

```tsx
// packages/dashboard/src/components/AlertModal.figma.tsx
import { figma } from '@figma/code-connect';

import { AlertModal } from '@/components/AlertModal';

figma.connect(
  AlertModal,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=373-413',
  {
    props: {
      title: figma.string('Title'),
      description: figma.string('Description'),
    },
    example: ({ title, description }) => (
      <AlertModal title={title} description={description} open onOpenChange={() => {}} />
    ),
  },
);
```

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/AlertModal.tsx \
        packages/dashboard/src/components/AlertModal.test.tsx \
        packages/dashboard/src/components/AlertModal.figma.tsx
git commit -m "feat(dashboard): add AlertModal composite (shadcn AlertDialog with Crew styling)"
```

---

### Task 3.4: Build `ModalSelectionRow`

**Files:**

- Create: `packages/dashboard/src/components/ModalSelectionRow.tsx`
- Create: `packages/dashboard/src/components/ModalSelectionRow.test.tsx`
- Create: `packages/dashboard/src/components/ModalSelectionRow.figma.tsx`

- [ ] **Step 1: Write test**

```tsx
// packages/dashboard/src/components/ModalSelectionRow.test.tsx
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Badge } from '@/components/ui/badge';
import { ModalSelectionRow } from './ModalSelectionRow.js';

describe('ModalSelectionRow', () => {
  it('renders primary + secondary + meta text', () => {
    render(
      <ModalSelectionRow primary="kanban-api" secondary="~/code/kanban-api" meta="4 active" />,
    );
    expect(screen.getByText('kanban-api')).toBeInTheDocument();
    expect(screen.getByText('~/code/kanban-api')).toBeInTheDocument();
    expect(screen.getByText('4 active')).toBeInTheDocument();
  });

  it('renders the badge slot when provided', () => {
    render(
      <ModalSelectionRow
        primary="x"
        badge={
          <Badge color="running" intensity="muted">
            KAN
          </Badge>
        }
      />,
    );
    expect(screen.getByText('KAN')).toBeInTheDocument();
  });

  it('fires onClick', () => {
    const h = vi.fn();
    render(<ModalSelectionRow primary="x" onClick={h} />);
    fireEvent.click(screen.getByText('x'));
    expect(h).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// packages/dashboard/src/components/ModalSelectionRow.tsx
import * as React from 'react';

import { cn } from '@/lib/utils';

type ModalSelectionRowProps = {
  primary: string;
  secondary?: string;
  meta?: string;
  badge?: React.ReactNode;
  onClick?: () => void;
  className?: string;
};

function ModalSelectionRow({
  primary,
  secondary,
  meta,
  badge,
  onClick,
  className,
}: ModalSelectionRowProps) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-2 rounded-md border border-border bg-card px-4 py-2.5 text-left',
        onClick && 'cursor-pointer hover:border-ring',
        className,
      )}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-medium text-foreground">{primary}</span>
        {secondary && <span className="font-mono text-xs text-muted-foreground">{secondary}</span>}
      </div>
      <div className="flex items-center gap-2">
        {meta && <span className="font-mono text-xs text-muted-foreground">{meta}</span>}
        {badge}
      </div>
    </div>
  );
}

export { ModalSelectionRow };
```

- [ ] **Step 3: Run tests**

```bash
cd packages/dashboard && npm run test -- ModalSelectionRow.test
```

- [ ] **Step 4: Create `ModalSelectionRow.figma.tsx`**

```tsx
// packages/dashboard/src/components/ModalSelectionRow.figma.tsx
import { figma } from '@figma/code-connect';

import { Badge } from '@/components/ui/badge';
import { ModalSelectionRow } from '@/components/ModalSelectionRow';

figma.connect(
  ModalSelectionRow,
  'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=350-236',
  {
    props: {
      primary: figma.string('Primary'),
      secondary: figma.string('Secondary'),
      meta: figma.string('Meta'),
      showBadge: figma.boolean('Show Badge'),
    },
    example: ({ primary, secondary, meta, showBadge }) => (
      <ModalSelectionRow
        primary={primary}
        secondary={secondary}
        meta={meta}
        badge={
          showBadge ? (
            <Badge color="running" intensity="muted">
              Badge
            </Badge>
          ) : undefined
        }
      />
    ),
  },
);
```

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/ModalSelectionRow.tsx \
        packages/dashboard/src/components/ModalSelectionRow.test.tsx \
        packages/dashboard/src/components/ModalSelectionRow.figma.tsx
git commit -m "feat(dashboard): add ModalSelectionRow composite (picker rows for modals)"
```

---

### Task 3.5: Build `Stepper`

**Files:**

- Create: `packages/dashboard/src/components/Stepper.tsx`
- Create: `packages/dashboard/src/components/Stepper.test.tsx`
- Create: `packages/dashboard/src/components/Stepper.figma.tsx`

- [ ] **Step 1: Write test**

```tsx
// packages/dashboard/src/components/Stepper.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Stepper } from './Stepper.js';

describe('Stepper', () => {
  it('renders all step labels with their indices', () => {
    render(<Stepper steps={['Project', 'Ticket', 'Confirm']} current={1} />);
    expect(screen.getByText('1·Project')).toBeInTheDocument();
    expect(screen.getByText('2·Ticket')).toBeInTheDocument();
    expect(screen.getByText('3·Confirm')).toBeInTheDocument();
  });

  it('marks the current step with data-active', () => {
    render(<Stepper steps={['A', 'B', 'C']} current={2} />);
    const b = screen.getByText('2·B');
    expect(b).toHaveAttribute('data-active', 'true');
    expect(screen.getByText('1·A')).toHaveAttribute('data-active', 'false');
  });
});
```

- [ ] **Step 2: Implement**

```tsx
// packages/dashboard/src/components/Stepper.tsx
import * as React from 'react';

import { cn } from '@/lib/utils';

type StepperProps = {
  steps: string[];
  current: number;
  className?: string;
};

function Stepper({ steps, current, className }: StepperProps) {
  return (
    <div className={cn('flex items-center gap-2 font-mono text-xs', className)}>
      {steps.map((label, idx) => {
        const stepNum = idx + 1;
        const active = stepNum === current;
        return (
          <React.Fragment key={label}>
            <span
              data-active={active}
              className={cn(
                'rounded px-1.5 py-0.5',
                active ? 'bg-blue-1050 text-blue-400' : 'text-muted-foreground',
              )}
            >
              {stepNum}·{label}
            </span>
            {idx < steps.length - 1 && <span className="text-muted-foreground">›</span>}
          </React.Fragment>
        );
      })}
    </div>
  );
}

export { Stepper };
```

- [ ] **Step 3: Run tests**

```bash
cd packages/dashboard && npm run test -- Stepper.test
```

- [ ] **Step 4: Create `Stepper.figma.tsx`**

```tsx
// packages/dashboard/src/components/Stepper.figma.tsx
import { figma } from '@figma/code-connect';

import { Stepper } from '@/components/Stepper';

figma.connect(Stepper, 'https://www.figma.com/design/9FeJPriqdsdA4n9R5Xsrr8/Crew?node-id=378-462', {
  example: () => <Stepper steps={['Project', 'Ticket', 'Confirm']} current={1} />,
});
```

- [ ] **Step 5: Commit**

```bash
git add packages/dashboard/src/components/Stepper.tsx \
        packages/dashboard/src/components/Stepper.test.tsx \
        packages/dashboard/src/components/Stepper.figma.tsx
git commit -m "feat(dashboard): add Stepper composite (numbered progress indicator)"
```

---

## Final verification (all 3 tickets)

After T1 + T2 + T3 all land:

```bash
cd packages/dashboard
npm run typecheck
npm run lint
npm run test
npm run build
```

Expected: all clean. Smoke-test the live dashboard: dispatch via worktree docker, click into Agents + Projects pages, confirm no visual regression vs the Figma `Crew` file's Agents List + Project Page screens.

---

## Spec coverage check

| Spec section                                                    | Plan tasks                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------------- |
| T1 → Pill primitives                                            | Tasks 1.1, 1.2, 1.3, 1.4, 1.5                                              |
| T2 → Form composites                                            | Tasks 2.1, 2.2, 2.3                                                        |
| T3 → Modal infrastructure                                       | Tasks 3.1, 3.2, 3.3, 3.4, 3.5                                              |
| Architecture → shared variants helper at `lib/pill-variants.ts` | Task 1.1                                                                   |
| Hard break on Button `variant` axis                             | Task 1.2 (rewrite, no shim)                                                |
| Delete StateBadge + CountBadge                                  | Tasks 1.3 (tsx + tests) + 1.5 (figma files)                                |
| Caller updates for Button/Badge                                 | Tasks 1.2 + 1.3                                                            |
| Code Connect file URL + node ID updates                         | Tasks 1.5, 2.1, 2.2, 2.3, 3.2, 3.3, 3.4, 3.5                               |
| Per-component tests                                             | Each task includes `*.test.tsx`                                            |
| No new e2e                                                      | Plan does not introduce Playwright specs                                   |
| Visual smoke after T1                                           | "T1 verification step" + "Final verification"                              |
| Out-of-scope items deferred                                     | No tasks touch modal screen wiring, trailing-icon Pill, CodeChip composite |
