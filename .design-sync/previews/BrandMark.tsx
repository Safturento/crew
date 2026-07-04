import * as React from 'react';
import { BrandMark, Button } from 'crew-dashboard';
import { Plus } from 'lucide-react';

/** TopNav lockup — the mark beside the wordmark, exactly as the app header renders it. */
export const NavLockup = () => (
  <a
    href="#/"
    className="text-foreground"
    style={{ display: 'inline-flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}
  >
    <BrandMark className="h-6 w-6 text-slate-400" />
    <span className="text-sm font-semibold tracking-tight">crew</span>
  </a>
);

/** Sizes + color inheritance — the mark tints via currentColor. */
export const SizesAndTints = () => (
  <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
    <BrandMark className="h-4 w-4 text-slate-400" />
    <BrandMark className="h-6 w-6 text-slate-400" />
    <BrandMark className="h-6 w-6 text-foreground" />
    <BrandMark className="h-6 w-6 text-amber-400" />
  </div>
);

/** In context — a slice of the top navigation bar. */
export const HeaderContext = () => (
  <header
    className="border-b border-white/10 bg-card px-5 py-3"
    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, minWidth: 480 }}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
      <span className="text-foreground" style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <BrandMark className="h-6 w-6 text-slate-400" />
        <span className="text-sm font-semibold tracking-tight">crew</span>
      </span>
      <nav style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span className="rounded-md px-3 text-xs font-medium bg-popover text-foreground" style={{ paddingTop: 6, paddingBottom: 6 }}>
          Agents
        </span>
        <span className="rounded-md px-3 text-xs font-medium text-muted-foreground" style={{ paddingTop: 6, paddingBottom: 6 }}>
          Projects
        </span>
      </nav>
    </div>
    <Button color="idle" intensity="loud" size="sm" icon={<Plus aria-hidden />} className="font-semibold">
      New Run
    </Button>
  </header>
);
