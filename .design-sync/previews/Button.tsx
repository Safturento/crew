import * as React from 'react';
import { Button } from 'crew-dashboard';
import { GitPullRequest, Plus } from 'lucide-react';

/** Modal footer pairing — muted Cancel beside the loud confirm (ResumeModal / FixPrModal). */
export const ModalActions = () => (
  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
    <Button color="running" intensity="mid" size="sm">
      Cancel
    </Button>
    <Button color="running" intensity="loud" size="sm">
      Resume agent
    </Button>
  </div>
);

/** The four sizes on the default white/loud CTA. */
export const Sizes = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <Button size="xs">New Run</Button>
    <Button size="sm">New Run</Button>
    <Button size="md">New Run</Button>
    <Button size="lg">New Run</Button>
  </div>
);

/** Intensity ramp, ghost → loud, on the `running` color. */
export const Intensities = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <Button color="running" intensity="ghost" size="sm">
      Finish
    </Button>
    <Button color="running" intensity="muted" size="sm">
      Finish
    </Button>
    <Button color="running" intensity="mid" size="sm">
      Finish
    </Button>
    <Button color="running" intensity="loud" size="sm">
      Finish
    </Button>
  </div>
);

/** AgentRow quick actions — icon CTAs, state-colored actions, and a runner-gated disabled Finish. */
export const QuickActions = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <Button color="running" intensity="mid" size="sm" icon={<GitPullRequest aria-hidden />}>
      View PR
    </Button>
    <Button color="waiting" intensity="loud" size="sm">
      Provide input
    </Button>
    <Button
      color="idle"
      intensity="loud"
      size="sm"
      icon={<Plus aria-hidden />}
      className="font-semibold"
    >
      New Run
    </Button>
    <Button
      color="running"
      intensity="ghost"
      size="sm"
      disabled
      title="Waiting for runner"
      className="disabled:opacity-40"
    >
      Finish
    </Button>
  </div>
);
