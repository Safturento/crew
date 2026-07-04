import * as React from 'react';
import { AlertModal } from 'crew-dashboard';

/**
 * The drawer's cancel-run escalation confirm, verbatim from DrawerHeader:
 * graceful-stop warning with an error-loud destructive action.
 */
export const CancelRunConfirm = () => (
  <AlertModal
    open
    onOpenChange={() => {}}
    title="Cancel CREW-295?"
    description="Sends a graceful stop to the agent process. If it hasn't settled in ~10s you can escalate to a force kill."
    cancelLabel="Keep running"
    actionLabel="Cancel run"
    actionColor="error"
    actionIntensity="loud"
  />
);
