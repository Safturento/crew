import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useSectionHeights } from './useSectionHeights.js';

class FakeResizeObserver {
  callback: ResizeObserverCallback;
  static instances: FakeResizeObserver[] = [];
  constructor(cb: ResizeObserverCallback) {
    this.callback = cb;
    FakeResizeObserver.instances.push(this);
  }
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
  fire(entries: Array<{ target: Element; contentRect: { height: number } }>): void {
    this.callback(entries as unknown as ResizeObserverEntry[], this as unknown as ResizeObserver);
  }
}

beforeEach(() => {
  FakeResizeObserver.instances = [];
  (globalThis as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver =
    FakeResizeObserver as unknown as typeof ResizeObserver;
});

describe('useSectionHeights', () => {
  it('returns one number per registered ref, defaulting to 0', () => {
    const { result } = renderHook(() => useSectionHeights(3));
    expect(result.current.heights).toEqual([0, 0, 0]);
    expect(result.current.refFor).toBeInstanceOf(Function);
  });

  it('updates a height when ResizeObserver fires for that section', async () => {
    const { result } = renderHook(() => useSectionHeights(2));
    const el0 = document.createElement('section');
    const el1 = document.createElement('section');
    act(() => {
      result.current.refFor(0)(el0);
      result.current.refFor(1)(el1);
    });
    const flushRaf = (): Promise<void> =>
      new Promise<void>((r) => requestAnimationFrame(() => r()));
    await act(async () => {
      FakeResizeObserver.instances[0].fire([{ target: el0, contentRect: { height: 200 } }]);
      await flushRaf();
    });
    expect(result.current.heights).toEqual([200, 0]);
    await act(async () => {
      FakeResizeObserver.instances[0].fire([{ target: el1, contentRect: { height: 80 } }]);
      await flushRaf();
    });
    expect(result.current.heights).toEqual([200, 80]);
  });

  it('resizes the heights array when sectionCount changes', () => {
    const { result, rerender } = renderHook(({ n }) => useSectionHeights(n), {
      initialProps: { n: 2 },
    });
    expect(result.current.heights).toEqual([0, 0]);
    rerender({ n: 4 });
    expect(result.current.heights).toEqual([0, 0, 0, 0]);
  });
});
