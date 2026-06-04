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
