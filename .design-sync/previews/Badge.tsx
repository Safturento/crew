import * as React from 'react';
import { Badge, StateIcon } from 'crew-dashboard';

/** One badge per agent state, with the StateIcon disc — the AgentRow status treatment. */
export const AgentStates = () => (
  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
    <Badge color="initializing" intensity="mid" icon={<StateIcon />}>
      Starting
    </Badge>
    <Badge color="queued" intensity="mid" icon={<StateIcon />}>
      Queued
    </Badge>
    <Badge color="running" intensity="mid" icon={<StateIcon />}>
      Running
    </Badge>
    <Badge color="idle" intensity="mid" icon={<StateIcon />}>
      Idle
    </Badge>
    <Badge color="waiting" intensity="mid" icon={<StateIcon />}>
      Waiting
    </Badge>
    <Badge color="pr_open" intensity="mid" icon={<StateIcon />}>
      PR open
    </Badge>
    <Badge color="pr_merged" intensity="mid" icon={<StateIcon />}>
      PR merged
    </Badge>
    <Badge color="error" intensity="mid" icon={<StateIcon />}>
      Error
    </Badge>
    <Badge color="orphaned" intensity="mid" icon={<StateIcon />}>
      Orphaned
    </Badge>
    <Badge color="finished" intensity="mid" icon={<StateIcon />}>
      Finished
    </Badge>
  </div>
);

/** Monospace metadata badges — ticket keys and the TopNav attention count. */
export const TicketsAndCounts = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <Badge color="finished" intensity="mid">
      CREW-231
    </Badge>
    <Badge color="finished" intensity="mid">
      CREW-315
    </Badge>
    <Badge color="waiting" intensity="mid">
      3
    </Badge>
  </div>
);

/** Intensity ramp on the default `running` color. */
export const Intensities = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <Badge intensity="ghost">ghost</Badge>
    <Badge intensity="muted">muted</Badge>
    <Badge intensity="mid">mid</Badge>
    <Badge intensity="loud">loud</Badge>
  </div>
);

/** RunnerStatusChip treatment — runner connectivity as a stateful badge. */
export const RunnerStatus = () => (
  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
    <Badge color="pr_merged" intensity="mid" icon={<StateIcon />}>
      Runner online
    </Badge>
    <Badge color="idle" intensity="mid" icon={<StateIcon />}>
      Runner offline
    </Badge>
  </div>
);
