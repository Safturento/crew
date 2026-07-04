import * as React from 'react';
import { Badge, ModalSelectionRow } from 'crew-dashboard';

/**
 * The New Run project-picker rows: name, repo path, Jira prefix, and an
 * active-run count badge. Clickable rows get the hover-ring affordance.
 */
export const ProjectPicker = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 520 }}>
    <ModalSelectionRow
      primary="crew"
      secondary="~/Repos/crew"
      meta="CREW"
      badge={
        <Badge color="finished" intensity="mid">
          3 active
        </Badge>
      }
      onClick={() => {}}
    />
    <ModalSelectionRow
      primary="recipes"
      secondary="~/Repos/recipes"
      meta="KAN"
      badge={
        <Badge color="finished" intensity="mid">
          1 active
        </Badge>
      }
      onClick={() => {}}
    />
    <ModalSelectionRow primary="dotfiles" secondary="~/dotfiles" onClick={() => {}} />
  </div>
);

/**
 * Ticket-picker row states: selectable, in-flight (disabled + running badge),
 * and blocked (disabled + muted badge) — the states the New Run picker renders.
 */
export const RowStates = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: 520 }}>
    <ModalSelectionRow
      primary="CREW-279"
      secondary="New Run ticket picker"
      meta="Story"
      onClick={() => {}}
    />
    <ModalSelectionRow
      primary="CREW-295"
      secondary="Runner page rework"
      badge={
        <Badge color="running" intensity="mid">
          running
        </Badge>
      }
      disabled
    />
    <ModalSelectionRow
      primary="CREW-298"
      secondary="Dispatch MCP auth"
      badge={
        <Badge color="error" intensity="muted">
          blocked
        </Badge>
      }
      disabled
    />
  </div>
);
