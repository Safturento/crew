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
