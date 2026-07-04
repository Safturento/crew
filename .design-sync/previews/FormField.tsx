import * as React from 'react';
import { FormField } from 'crew-dashboard';
import { Search } from 'lucide-react';

/** Uppercase 11px label over an empty input — the New Run "Ticket" field. */
export const TicketField = () => (
  <div style={{ maxWidth: 360 }}>
    <FormField label="Ticket" placeholder="CREW-123" />
  </div>
);

/** Field pre-filled with a value, as when the base branch defaults to main. */
export const PrefilledField = () => (
  <div style={{ maxWidth: 360 }}>
    <FormField label="Base branch" defaultValue="main" />
  </div>
);

/** FormField forwards InputProps — here the leading search icon. */
export const SearchField = () => (
  <div style={{ maxWidth: 360 }}>
    <FormField label="Search tickets" leadingIcon={<Search />} placeholder="Filter by key or title…" />
  </div>
);

/** Disabled field — label stays readable, input drops to reduced opacity. */
export const DisabledField = () => (
  <div style={{ maxWidth: 360 }}>
    <FormField label="Worktree" defaultValue="~/Repos/crew-CREW-298" disabled />
  </div>
);
