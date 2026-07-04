import * as React from 'react';
import { createPortal } from 'react-dom';
import { GitBranch, SquareArrowOutUpRight, X } from 'lucide-react';
import { Badge, Button, Drawer, MetaList, Separator, StateIcon, Tag } from 'crew-dashboard';

/**
 * The right-anchored agent-detail drawer, rendered open. The real app fills it
 * with AgentBody (DrawerHeader + timeline); this preview composes an
 * equivalent header + transcript slice from exported primitives so the
 * drawer's chrome — overlay, right-anchored panel, full height — reads in
 * context.
 */
export const AgentDetailDrawer = () => (
  <>
    {/* Stand-in for the dashboard the drawer slides over — without it the
        overlay dims the capture sheet's white body and reads gray. Portaled
        to document.body because the capture cell's translateZ(0) wrapper
        would otherwise trap position:fixed inside the (tiny) cell. */}
    <AppBackdrop />
    <Drawer open onOpenChange={() => {}} title="crew / CREW-295">
    {/* Header block — mirrors DrawerHeader's layout */}
    <header
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-card)',
        padding: '18px 24px 16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--color-muted-foreground)',
        }}
      >
        <span>crew</span>
        <span aria-hidden style={{ opacity: 0.4 }}>
          /
        </span>
        <span>CREW-295</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Button color="idle" intensity="ghost" size="sm" icon={<X aria-hidden />} aria-label="Close drawer" />
        </div>
      </div>
      <h1
        style={{
          margin: 0,
          fontSize: 20,
          fontWeight: 600,
          letterSpacing: '-0.025em',
          color: 'var(--color-foreground)',
        }}
      >
        Runner page rework: merge failed starts into the timeline
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Badge color="running" intensity="mid" icon={<StateIcon />}>
          Running
        </Badge>
        <MetaList>
          <span>
            runtime{' '}
            <span style={{ color: 'var(--color-foreground)', fontVariantNumeric: 'tabular-nums' }}>
              47m 12s
            </span>
          </span>
          <span>
            tokens{' '}
            <span style={{ color: 'var(--color-foreground)', fontVariantNumeric: 'tabular-nums' }}>
              1.3M
            </span>
          </span>
        </MetaList>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Button color="idle" intensity="mid" size="md" icon={<SquareArrowOutUpRight aria-hidden />}>
          CREW-295
        </Button>
        <Button
          color="idle"
          intensity="mid"
          size="md"
          icon={<GitBranch aria-hidden />}
          style={{ fontFamily: 'var(--font-mono)' }}
        >
          ~/Repos/crew-CREW-295
        </Button>
      </div>
    </header>

    {/* Body — a timeline slice of transcript rows */}
    <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
      <div
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--color-muted-foreground)',
          marginBottom: 12,
        }}
      >
        run · started 12:41
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <TranscriptLine tool="read" label="Read" text="packages/daemon/src/services/runner.ts" />
        <TranscriptLine tool="bash" label="Bash" text="npm run test --workspace crew-daemon" />
        <TranscriptLine tool="edit" label="Edit" text="packages/dashboard/src/components/runner/RunnerRow.tsx" />
        <TranscriptLine tool="bash" label="Bash" text="npm run typecheck" />
      </div>
      <div style={{ padding: '16px 0' }}>
        <Separator />
      </div>
      <p
        style={{
          margin: 0,
          fontSize: 13,
          lineHeight: 1.6,
          color: 'var(--color-foreground)',
          maxWidth: 640,
        }}
      >
        Merged the failed-start rows into the main timeline and re-ran the daemon suite — 214
        passing. Moving on to the dashboard typecheck before opening the PR.
      </p>
    </div>
    </Drawer>
  </>
);

function AppBackdrop() {
  return createPortal(
    <div
      aria-hidden
      style={{ position: 'fixed', inset: 0, background: 'var(--color-background)' }}
    />,
    document.body,
  );
}

function TranscriptLine({ tool, label, text }: { tool: string; label: string; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Tag toolColor={tool} intensity="mid">
        {label}
      </Tag>
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--color-muted-foreground)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {text}
      </span>
    </div>
  );
}
