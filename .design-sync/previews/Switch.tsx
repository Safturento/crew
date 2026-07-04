import * as React from 'react';
import { Label, Switch } from 'crew-dashboard';

/** Off / on / disabled states side by side. */
export const States = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Switch id="sw-off" />
      <Label htmlFor="sw-off">Off</Label>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Switch id="sw-on" defaultChecked />
      <Label htmlFor="sw-on">On</Label>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Switch id="sw-disabled" disabled />
      <Label htmlFor="sw-disabled">Disabled</Label>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Switch id="sw-disabled-on" disabled defaultChecked />
      <Label htmlFor="sw-disabled-on">Disabled on</Label>
    </div>
  </div>
);

/** The "Available only" ticket-picker toggle from the New Run modal. */
export const AvailableOnly = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <Switch id="sw-available" defaultChecked />
    <Label htmlFor="sw-available" className="text-xs text-muted-foreground">
      Available only
    </Label>
  </div>
);

/** The timeline "Live" mode toggle — mono label, on by default. */
export const LiveToggle = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <Switch id="sw-live" defaultChecked />
    <Label htmlFor="sw-live" className="font-mono text-xs leading-none text-muted-foreground">
      Live
    </Label>
  </div>
);
