import * as React from 'react';
import { Button, FormField, Modal } from 'crew-dashboard';

/** The shared dashboard modal chrome: titled header, close button, body slot. */
export const NewRunModal = () => (
  <Modal title="New run" open onOpenChange={() => {}}>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <FormField label="Ticket" placeholder="CREW-123" />
      <FormField label="Base branch" defaultValue="main" />
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button color="running" intensity="ghost" size="sm">
          Cancel
        </Button>
        <Button color="white" intensity="loud" size="sm">
          Start run
        </Button>
      </div>
    </div>
  </Modal>
);
