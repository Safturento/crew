import { describe, expect, it } from 'vitest';

import { pillSurfaceClasses } from './pill-variants';

describe('pillSurfaceClasses', () => {
  it('ghost: state text on a transparent surface, no border', () => {
    const cls = pillSurfaceClasses('running', 'ghost');
    expect(cls).toBe('text-slate-400 bg-transparent');
  });

  it('muted: state text on the dark state fill, no border', () => {
    const cls = pillSurfaceClasses('running', 'muted');
    expect(cls).toBe('text-slate-400 bg-slate-1050');
  });

  it('mid: state text on the dark fill with a 1px state border', () => {
    const cls = pillSurfaceClasses('running', 'mid');
    expect(cls).toBe('text-slate-400 bg-slate-1050 border border-slate-500');
  });

  it('loud: dark text on the solid state fill', () => {
    const cls = pillSurfaceClasses('running', 'loud');
    expect(cls).toBe('text-slate-950 bg-slate-400 border border-slate-400');
  });

  it('white/loud uses zinc-50 surface + zinc-950 text (not pure white / slate-950)', () => {
    const cls = pillSurfaceClasses('white', 'loud');
    expect(cls).toBe('text-zinc-950 bg-zinc-50 border border-zinc-50');
  });

  it('white/mid uses the foreground text + the white-overlay surface', () => {
    const cls = pillSurfaceClasses('white', 'mid');
    expect(cls).toBe('text-foreground bg-white/5 border border-white/10');
  });
});
