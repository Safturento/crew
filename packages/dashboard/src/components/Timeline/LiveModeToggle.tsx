import { useId } from 'react';

import { Switch } from '../ui/switch.js';

interface LiveModeToggleProps {
  active: boolean;
  onChange: (next: boolean) => void;
}

export function LiveModeToggle({ active, onChange }: LiveModeToggleProps) {
  const id = useId();
  return (
    <span className="inline-flex items-center gap-1.5">
      <Switch id={id} aria-label="Live" checked={active} onCheckedChange={onChange} />
      <label
        htmlFor={id}
        className="cursor-pointer select-none font-mono text-xs leading-none text-muted-foreground"
      >
        Live
      </label>
    </span>
  );
}

interface NewEventsPillProps {
  count: number;
  onClick: () => void;
}

export function NewEventsPill({ count, onClick }: NewEventsPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-6 items-center gap-1 rounded-full border border-white/30 bg-white/10 px-3 font-mono text-xs leading-none text-foreground shadow-sm transition-opacity hover:opacity-80"
    >
      <span aria-hidden>↓</span>
      {count} new events
    </button>
  );
}
