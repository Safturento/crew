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
          const next = prev.slice();
          for (const [idx, h] of snapshot) {
            if (idx < next.length) next[idx] = h;
          }
          return next;
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
    };
  }, []);

  const refFor = useCallback((index: number) => {
    return (el: HTMLElement | null) => {
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
  }, []);

  return useMemo(() => ({ heights, refFor }), [heights, refFor]);
}
