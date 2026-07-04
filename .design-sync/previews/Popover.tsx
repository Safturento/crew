import * as React from 'react';
import { ListFilter } from 'lucide-react';
import { Button, Checkbox, Popover, PopoverContent, PopoverTrigger } from 'crew-dashboard';

const FilterRow = ({ label, checked = true }: { label: string; checked?: boolean }) => (
  <label
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '5px 4px',
      fontSize: 13,
      cursor: 'pointer',
    }}
  >
    <Checkbox defaultChecked={checked || undefined} />
    {label}
  </label>
);

/**
 * The timeline filter popover: ghost trigger button with a checkbox list of
 * event categories, mirroring Timeline/Filters and StateOverrideControl.
 */
export const TimelineFilterPopover = () => (
  <div style={{ display: 'flex', alignItems: 'flex-start', minHeight: 330 }}>
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button color="idle" intensity="mid" size="sm" icon={<ListFilter aria-hidden />}>
          Filter
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <p
          style={{
            margin: '0 0 4px',
            padding: '0 4px',
            fontSize: 10,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            opacity: 0.65,
          }}
        >
          Timeline filters
        </p>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <FilterRow label="Assistant messages" />
          <FilterRow label="Tool calls" />
          <FilterRow label="Lifecycle events" checked={false} />
          <FilterRow label="Errors" />
        </div>
      </PopoverContent>
    </Popover>
  </div>
);
