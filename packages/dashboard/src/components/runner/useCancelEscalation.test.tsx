import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useCancelEscalation } from './useCancelEscalation.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useCancelEscalation', () => {
  it('starts idle, opens the confirm, and dismisses back to idle', () => {
    const { result } = renderHook(() =>
      useCancelEscalation({ onSoftCancel: vi.fn(), onForceKill: vi.fn() }),
    );
    expect(result.current.phase).toBe('idle');

    act(() => result.current.requestCancel());
    expect(result.current.phase).toBe('confirming');

    act(() => result.current.dismiss());
    expect(result.current.phase).toBe('idle');
  });

  it('fires onSoftCancel on confirm and reveals Force kill only after the delay', () => {
    const onSoftCancel = vi.fn();
    const onForceKill = vi.fn();
    const { result } = renderHook(() =>
      useCancelEscalation({ onSoftCancel, onForceKill, escalateAfterMs: 10_000 }),
    );

    act(() => result.current.requestCancel());
    act(() => result.current.confirm());

    expect(onSoftCancel).toHaveBeenCalledOnce();
    expect(result.current.phase).toBe('cancelling');
    expect(result.current.showForceKill).toBe(false);

    act(() => vi.advanceTimersByTime(9_999));
    expect(result.current.showForceKill).toBe(false);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.showForceKill).toBe(true);
  });

  it('fires onForceKill when forceKill is called', () => {
    const onForceKill = vi.fn();
    const { result } = renderHook(() =>
      useCancelEscalation({ onSoftCancel: vi.fn(), onForceKill }),
    );
    act(() => result.current.requestCancel());
    act(() => result.current.confirm());
    act(() => vi.advanceTimersByTime(10_000));
    act(() => result.current.forceKill());
    expect(onForceKill).toHaveBeenCalledOnce();
  });

  it('clears the escalation timer on unmount (no late state update)', () => {
    const { result, unmount } = renderHook(() =>
      useCancelEscalation({ onSoftCancel: vi.fn(), onForceKill: vi.fn() }),
    );
    act(() => result.current.requestCancel());
    act(() => result.current.confirm());
    unmount();
    // Advancing past the delay after unmount must not throw / update state.
    expect(() => vi.advanceTimersByTime(20_000)).not.toThrow();
  });
});
