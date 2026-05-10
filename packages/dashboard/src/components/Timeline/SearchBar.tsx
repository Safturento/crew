interface SearchBarProps {
  value: string;
  onChange: (next: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <input
      type="search"
      role="searchbox"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search events…"
      aria-label="Search timeline events"
      className="h-[22px] min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-2 font-mono text-[11px] leading-none text-foreground placeholder:text-muted-foreground focus:border-white/30 focus:outline-none"
    />
  );
}
