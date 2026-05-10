import { CHIP_GROUPS, type ChipGroup } from './eventClassification.js';

interface FilterChipsProps {
  visible: ReadonlySet<ChipGroup>;
  onChange: (next: Set<ChipGroup>) => void;
}

export function FilterChips({ visible, onChange }: FilterChipsProps) {
  const toggle = (id: ChipGroup) => {
    const next = new Set(visible);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  return (
    <div
      role="group"
      aria-label="Filter timeline events"
      className="flex flex-wrap items-center gap-1.5"
    >
      {CHIP_GROUPS.map((g) => {
        const isOn = visible.has(g.id);
        return (
          <button
            key={g.id}
            type="button"
            aria-pressed={isOn}
            onClick={() => toggle(g.id)}
            className={[
              'inline-flex h-[22px] items-center rounded-full border px-2 font-mono text-[11px] leading-none whitespace-nowrap transition-opacity hover:opacity-80',
              isOn
                ? 'border-white/30 bg-white/10 text-foreground'
                : 'border-white/10 bg-transparent text-muted-foreground',
            ].join(' ')}
          >
            {g.label}
          </button>
        );
      })}
    </div>
  );
}
