import * as React from 'react';
import { Input } from 'crew-dashboard';
import { Search } from 'lucide-react';

/** Empty input with placeholder — the default resting state. */
export const Placeholder = () => (
  <div style={{ maxWidth: 360 }}>
    <Input placeholder="Search tickets…" />
  </div>
);

/** Input holding a typed value, as when editing the base branch of a run. */
export const Filled = () => (
  <div style={{ maxWidth: 360 }}>
    <Input defaultValue="feature/crew-321-timeline-filters" />
  </div>
);

/** Leading-icon variant — the ticket search box in the New Run modal. */
export const WithLeadingIcon = () => (
  <div style={{ maxWidth: 360 }}>
    <Input leadingIcon={<Search />} placeholder="Filter by key or title…" />
  </div>
);

/** Disabled input keeps its value but drops to reduced opacity. */
export const Disabled = () => (
  <div style={{ maxWidth: 360 }}>
    <Input disabled defaultValue="~/Repos/crew-CREW-298" />
  </div>
);
