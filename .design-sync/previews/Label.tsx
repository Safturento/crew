import * as React from 'react';
import { Checkbox, Input, Label, Switch } from 'crew-dashboard';

/** Label above a text input — the standard field pairing. */
export const FieldLabel = () => (
  <div style={{ maxWidth: 360, display: 'flex', flexDirection: 'column', gap: 6 }}>
    <Label htmlFor="base-branch">Base branch</Label>
    <Input id="base-branch" defaultValue="main" />
  </div>
);

/** Label beside a checkbox, clickable via htmlFor. */
export const CheckboxLabel = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <Checkbox id="delete-branch" defaultChecked />
    <Label htmlFor="delete-branch">Delete branch after merge</Label>
  </div>
);

/** Label beside a switch — the "Available only" toggle treatment. */
export const SwitchLabel = () => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <Switch id="available-only" />
    <Label htmlFor="available-only">Available only</Label>
  </div>
);
