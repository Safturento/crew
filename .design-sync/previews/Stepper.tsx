import * as React from 'react';
import { Stepper } from 'crew-dashboard';

// The New Run modal's three-step flow — the Stepper's only call site.
const STEPS = ['Project', 'Ticket', 'Confirm'];

/** First step active — the New Run modal as it opens. */
export const ProjectStep = () => <Stepper steps={STEPS} current={1} />;

/** Mid-flow — a project picked, the ticket picker showing. */
export const TicketStep = () => <Stepper steps={STEPS} current={2} />;

/** Final step active — ready to dispatch the run. */
export const ConfirmStep = () => <Stepper steps={STEPS} current={3} />;
