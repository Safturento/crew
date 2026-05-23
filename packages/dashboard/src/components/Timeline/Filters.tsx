import { ChevronDown, Filter } from 'lucide-react';
import { useMemo } from 'react';

import type { AgentDetailTokensByTool } from '../../data/types.js';
import { aggregateByAlias } from '../../format/tool-alias.js';
import { Button } from '../ui/button.js';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.js';
import { CATEGORIES, defaultVisibleCategorySet, type CategoryId } from './eventClassification.js';

export interface TimelineFilterState {
  categories: ReadonlySet<CategoryId>;
  tools: ReadonlySet<string>;
}

interface FiltersProps {
  state: TimelineFilterState;
  onChange: (next: TimelineFilterState) => void;
  /** Used to derive the Tools section rows, alias-aggregated descending. */
  tokensByTool: AgentDetailTokensByTool[];
}

export const defaultTimelineFilterState: TimelineFilterState = {
  categories: new Set(defaultVisibleCategorySet),
  tools: new Set(),
};

export function Filters({ state, onChange, tokensByTool }: FiltersProps) {
  const aliasRows = useMemo(
    () =>
      aggregateByAlias(tokensByTool.map(({ tool, tokens }) => ({ tool, tokens }))).map((row) => ({
        ...row,
        title: `${row.alias} (${row.raw.join(', ')})`,
      })),
    [tokensByTool],
  );

  const divergenceCount = useMemo(() => countDivergences(state.categories, state.tools), [state]);

  const toggleCategory = (id: CategoryId) => {
    const next = new Set(state.categories);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ categories: next, tools: state.tools });
  };

  const toggleTool = (alias: string) => {
    const next = new Set(state.tools);
    if (next.has(alias)) next.delete(alias);
    else next.add(alias);
    onChange({ categories: state.categories, tools: next });
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          color="idle"
          intensity="mid"
          size="sm"
          icon={<Filter aria-hidden />}
          aria-label="Open timeline filters"
        >
          <span>Filters</span>
          {divergenceCount > 0 && (
            <span
              data-testid="filters-badge"
              className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-foreground/15 px-1 font-mono text-[10px] leading-none text-foreground"
            >
              {divergenceCount}
            </span>
          )}
          <ChevronDown aria-hidden className="ml-0.5 size-3.5 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="flex flex-col">
          <FilterSection title="Categories">
            {CATEGORIES.map((c) => (
              <FilterRow
                key={c.id}
                id={`filter-cat-${c.id}`}
                label={c.label}
                checked={state.categories.has(c.id)}
                onToggle={() => toggleCategory(c.id)}
              />
            ))}
          </FilterSection>
          <div className="border-t border-border" />
          <FilterSection title="Tools">
            {aliasRows.length === 0 ? (
              <p className="px-3 py-2 font-mono text-xs italic text-muted-foreground">
                No tool usage yet.
              </p>
            ) : (
              aliasRows.map((row) => (
                <FilterRow
                  key={row.alias}
                  id={`filter-tool-${row.alias}`}
                  label={row.alias}
                  title={row.title}
                  checked={state.tools.has(row.alias)}
                  onToggle={() => toggleTool(row.alias)}
                />
              ))
            )}
          </FilterSection>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface FilterSectionProps {
  title: string;
  children: React.ReactNode;
}

function FilterSection({ title, children }: FilterSectionProps) {
  return (
    <section className="flex flex-col gap-0.5 p-2">
      <p className="px-2 pb-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </section>
  );
}

interface FilterRowProps {
  id: string;
  label: string;
  title?: string;
  checked: boolean;
  onToggle: () => void;
}

function FilterRow({ id, label, title, checked, onToggle }: FilterRowProps) {
  return (
    <label
      htmlFor={id}
      title={title}
      className="flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="size-3.5 accent-foreground"
      />
      <span className="font-mono text-xs">{label}</span>
    </label>
  );
}

function countDivergences(categories: ReadonlySet<CategoryId>, tools: ReadonlySet<string>): number {
  let diff = 0;
  for (const c of CATEGORIES) {
    const isOn = categories.has(c.id);
    if (isOn !== c.defaultVisible) diff += 1;
  }
  return diff + tools.size;
}
