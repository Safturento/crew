import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * CREW-245: the soft→hard cancel escalation, shared by the Runner page rows
 * and (CREW-246) the agent drawer header.
 *
 * Flow: `requestCancel()` opens a confirm (`phase: 'confirming'`); `confirm()`
 * fires the soft cancel and moves to `phase: 'cancelling'`, starting a timer;
 * once `escalateAfterMs` elapses without the run settling, `showForceKill`
 * flips true and `forceKill()` fires the hard cancel. `dismiss()` aborts an
 * un-confirmed cancel. The timer is cleared on unmount so a slow row that
 * unmounts (the process settled + dropped from the snapshot) never updates
 * state after teardown.
 */
const DEFAULT_ESCALATE_AFTER_MS = 10_000;

export type CancelPhase = 'idle' | 'confirming' | 'cancelling';

export interface CancelEscalation {
  phase: CancelPhase;
  showForceKill: boolean;
  requestCancel: () => void;
  dismiss: () => void;
  confirm: () => void;
  forceKill: () => void;
}

interface Options {
  onSoftCancel: () => void;
  onForceKill: () => void;
  escalateAfterMs?: number;
}

export function useCancelEscalation({
  onSoftCancel,
  onForceKill,
  escalateAfterMs = DEFAULT_ESCALATE_AFTER_MS,
}: Options): CancelEscalation {
  const [phase, setPhase] = useState<CancelPhase>('idle');
  const [showForceKill, setShowForceKill] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => clear, [clear]);

  const requestCancel = useCallback(() => setPhase('confirming'), []);
  // Only an un-confirmed cancel resets to idle. Confirming the AlertDialog
  // fires both onAction (→ confirm → 'cancelling') and onOpenChange(false)
  // (→ dismiss) in one event; the functional guard keeps `dismiss` from
  // clobbering the `cancelling` phase regardless of which lands first.
  const dismiss = useCallback(() => setPhase((p) => (p === 'confirming' ? 'idle' : p)), []);

  const confirm = useCallback(() => {
    onSoftCancel();
    setPhase('cancelling');
    clear();
    timerRef.current = setTimeout(() => setShowForceKill(true), escalateAfterMs);
  }, [onSoftCancel, escalateAfterMs, clear]);

  const forceKill = useCallback(() => {
    // Settle the escalation timer — a Force kill can fire on the
    // snapshot-reported `cancelling` path while a prior soft-cancel timer is
    // still pending; clearing it avoids a stray post-settle state update.
    clear();
    onForceKill();
  }, [onForceKill, clear]);

  return { phase, showForceKill, requestCancel, dismiss, confirm, forceKill };
}
