interface LiveModeToggleProps {
  active: boolean;
  onChange: (next: boolean) => void;
}

export function LiveModeToggle({ active, onChange }: LiveModeToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label="Live"
      onClick={() => onChange(!active)}
      className={[
        'inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2 font-mono text-[11px] leading-none transition-opacity hover:opacity-80',
        active
          ? 'border-emerald-400/40 bg-emerald-400/15 text-emerald-100'
          : 'border-white/10 bg-transparent text-text-3',
      ].join(' ')}
    >
      <span
        aria-hidden
        className={[
          'h-1.5 w-1.5 rounded-full',
          active ? 'bg-emerald-300' : 'bg-text-3',
        ].join(' ')}
      />
      Live
    </button>
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
      className="inline-flex h-[22px] items-center gap-1 rounded-full border border-white/30 bg-white/10 px-3 font-mono text-[11px] leading-none text-text-1 shadow-sm transition-opacity hover:opacity-80"
    >
      <span aria-hidden>↓</span>
      {count} new events
    </button>
  );
}
