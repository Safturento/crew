import { Search } from 'lucide-react';

import { Input } from '../ui/input.js';

interface SearchBarProps {
  value: string;
  onChange: (next: string) => void;
}

export function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <Input
      type="search"
      role="searchbox"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search events…"
      aria-label="Search timeline events"
      leadingIcon={<Search aria-hidden />}
      className="h-8 min-w-0 flex-1 border-slate-600 bg-slate-1100 font-mono text-xs"
    />
  );
}
