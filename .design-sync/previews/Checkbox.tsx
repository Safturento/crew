import * as React from 'react';
import { Checkbox, Label } from 'crew-dashboard';

/** The four interaction states side by side. */
export const States = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Checkbox id="cb-unchecked" />
      <Label htmlFor="cb-unchecked">Unchecked</Label>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Checkbox id="cb-checked" defaultChecked />
      <Label htmlFor="cb-checked">Checked</Label>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Checkbox id="cb-disabled" disabled />
      <Label htmlFor="cb-disabled">Disabled</Label>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Checkbox id="cb-disabled-checked" disabled defaultChecked />
      <Label htmlFor="cb-disabled-checked">Disabled checked</Label>
    </div>
  </div>
);

/** Checkbox rows as used in the timeline event filters popover. */
export const TimelineFilters = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 220 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Checkbox id="filter-tools" defaultChecked />
      <Label htmlFor="filter-tools" className="font-mono text-xs">
        Tool calls
      </Label>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Checkbox id="filter-messages" defaultChecked />
      <Label htmlFor="filter-messages" className="font-mono text-xs">
        Assistant messages
      </Label>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Checkbox id="filter-errors" />
      <Label htmlFor="filter-errors" className="font-mono text-xs">
        Errors only
      </Label>
    </div>
  </div>
);

/** Single labeled option inside a run-completion form. */
export const LabeledOption = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <Checkbox id="cb-delete-branch" defaultChecked />
    <Label htmlFor="cb-delete-branch">Delete branch after merge</Label>
  </div>
);
