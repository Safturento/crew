import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface UseSectionHeightsResult {
  heights: number[];
  refFor: (index: number) => (el: HTMLElement | null) => void;
}

/**
 * Tracks the rendered pixel height of N sibling sections via a single shared
 * `ResizeObserver`. Returns:
 *   - `heights[i]` — current height of section i (0 until first observation)
 *   - `refFor(i)` — a callback-ref to attach to that section's outer element
 *
 * Sections are addressed by index, not key, so the caller must keep the index
 * stable across renders (or accept that re-indexing resets heights to 0 for
 * the new positions). Updates are batched through `requestAnimationFrame` so
 * a flurry of observed resizes coalesces into one setState.
 */
export function useSectionHeights(sectionCount: number): UseSectionHeightsResult {
  const [heights, setHeights] = useState<number[]>(() => Array(sectionCount).fill(0));
  const elementsRef = useRef<Map<HTMLElement, number>>(new Map());
  const observerRef = useRef<ResizeObserver | null>(null);
  const rafRef = useRef<number | null>(null);
  const pendingRef = useRef<Map<number, number>>(new Map());
  // Cache of callback-refs keyed by index. The first PR (#275) returned a
  // fresh inner arrow on every `refFor(i)` call, which made React detach +
  // re-attach each section's ref every render. ResizeObserver fires its
  // initial-size callback on every observe(), which scheduled the rAF, which
  // called setHeights with a fresh array (slice() always allocates) — and
  // that re-render created the next set of fresh refs. Infinite loop.
  // Cache the inner callback per index so the same function comes back
  // across renders and React leaves the binding alone.
  const refCacheRef = useRef<Map<number, (el: HTMLElement | null) => void>>(new Map());

  // Resize the heights array if sectionCount changes (preserve existing where possible).
  useEffect(() => {
    setHeights((prev) => {
      if (prev.length === sectionCount) return prev;
      const next: number[] = Array(sectionCount).fill(0);
      for (let i = 0; i < Math.min(prev.length, sectionCount); i++) next[i] = prev[i];
      return next;
    });
  }, [sectionCount]);

  // Create the observer once.
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const idx = elementsRef.current.get(entry.target as HTMLElement);
        if (idx === undefined) continue;
        pendingRef.current.set(idx, entry.contentRect.height);
      }
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        if (pendingRef.current.size === 0) return;
        // Snapshot + clear BEFORE setHeights so the updater closure is
        // safe to run on whatever schedule React picks (eager or deferred).
        const snapshot = new Map(pendingRef.current);
        pendingRef.current.clear();
        setHeights((prev) => {
          // Suspenders to the cached-ref belt above: if every observed height
          // already matches state, return the SAME array so React skips the
          // re-render. Otherwise a re-observe of an unchanged section would
          // still allocate a new array → re-render → re-observe → loop.
          let changed = false;
          const next = prev.slice();
          for (const [idx, h] of snapshot) {
            if (idx < next.length && next[idx] !== h) {
              next[idx] = h;
              changed = true;
            }
          }
          return changed ? next : prev;
        });
      });
    });
    observerRef.current = observer;
    return () => {
      observer.disconnect();
      observerRef.current = null;
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      elementsRef.current.clear();
      pendingRef.current.clear();
      refCacheRef.current.clear();
    };
  }, []);

  const refFor = useCallback((index: number) => {
    const cached = refCacheRef.current.get(index);
    if (cached) return cached;
    const cb = (el: HTMLElement | null) => {
      const observer = observerRef.current;
      if (!observer) return;
      // Unregister any element previously held at this index.
      for (const [existingEl, existingIdx] of elementsRef.current) {
        if (existingIdx === index && existingEl !== el) {
          observer.unobserve(existingEl);
          elementsRef.current.delete(existingEl);
        }
      }
      if (el) {
        elementsRef.current.set(el, index);
        observer.observe(el);
      }
    };
    refCacheRef.current.set(index, cb);
    return cb;
  }, []);

  return useMemo(() => ({ heights, refFor }), [heights, refFor]);
}
