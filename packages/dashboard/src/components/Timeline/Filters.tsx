import { ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { useMemo, useState } from 'react';

import type { AgentDetailTokensByTool } from '../../data/types.js';
import { aggregateByAlias } from '../../format/tool-alias.js';
import { Button } from '../ui/button.js';
import { Checkbox } from '../ui/checkbox.js';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover.js';
import { CATEGORIES } from './eventClassification.js';
import {
  clear,
  computeTotalLeaves,
  computeVisibleLeaves,
  isToolVisible,
  selectAll,
  toggleCategory,
  toggleTool,
  type TimelineFilterState,
} from './filter-state.js';

export { defaultTimelineFilterState, type TimelineFilterState } from './filter-state.js';

interface FiltersProps {
  state: TimelineFilterState;
  onChange: (next: TimelineFilterState) => void;
  /** Used to derive the Tools section rows, alias-aggregated descending. */
  tokensByTool: AgentDetailTokensByTool[];
}

export function Filters({ state, onChange, tokensByTool }: FiltersProps) {
  const [open, setOpen] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(false);

  const aliasRows = useMemo(
    () =>
      aggregateByAlias(
        tokensByTool.map(({ tool, totalTokens }) => ({ tool, tokens: totalTokens })),
      ).map((row) => ({
        ...row,
        title: `${row.alias} (${row.raw.join(', ')})`,
      })),
    [tokensByTool],
  );
  const knownAliases = useMemo(() => aliasRows.map((r) => r.alias), [aliasRows]);

  const visible = computeVisibleLeaves(state, knownAliases);
  const total = computeTotalLeaves(knownAliases);
  const showBadge = visible < total;

  const toolsChecked = state.categories.has('tools');
  const visibleToolCount = toolsChecked
    ? knownAliases.filter((a) => isToolVisible(a, state.tools)).length
    : 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          color="idle"
          intensity="mid"
          size="sm"
          icon={<Filter aria-hidden />}
          aria-label="Open timeline filters"
        >
          <span>Filters</span>
          {showBadge && (
            <span
              data-testid="filters-badge"
              className="ml-1 inline-flex h-4 items-center justify-center rounded-full bg-foreground/15 px-1.5 font-mono text-[10px] leading-none text-foreground"
            >
              {visible} / {total}
            </span>
          )}
          <ChevronDown aria-hidden className="ml-0.5 size-3.5 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <div className="flex flex-col">
          <PopoverHeader
            onSelectAll={() => onChange(selectAll())}
            onClear={() => onChange(clear())}
          />
          <div className="border-t border-border" />
          <div className="flex flex-col gap-0.5 p-2">
            {CATEGORIES.map((c) =>
              c.id === 'tools' ? (
                <ToolsParentRow
                  key="tools"
                  checked={toolsChecked}
                  expanded={toolsExpanded}
                  onToggleExpanded={() => setToolsExpanded((e) => !e)}
                  onToggleChecked={() => onChange(toggleCategory(state, 'tools'))}
                  visibleCount={visibleToolCount}
                  totalCount={knownAliases.length}
                />
              ) : (
                <FilterRow
                  key={c.id}
                  id={`filter-cat-${c.id}`}
                  label={c.label}
                  checked={state.categories.has(c.id)}
                  onToggle={() => onChange(toggleCategory(state, c.id))}
                />
              ),
            )}
            {toolsExpanded && (
              <ToolsSubtree
                aliasRows={aliasRows}
                state={state}
                knownAliases={knownAliases}
                onChange={onChange}
                masterOn={toolsChecked}
              />
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

interface PopoverHeaderProps {
  onSelectAll: () => void;
  onClear: () => void;
}
function PopoverHeader({ onSelectAll, onClear }: PopoverHeaderProps) {
  return (
    <div className="flex items-center gap-1 px-3 py-2.5">
      <p className="flex-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        Filters
      </p>
      <Button color="idle" intensity="ghost" size="xs" onClick={onSelectAll}>
        Select all
      </Button>
      <Button color="idle" intensity="ghost" size="xs" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}

interface FilterRowProps {
  id: string;
  label: string;
  title?: string;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  indent?: boolean;
}
function FilterRow({ id, label, title, checked, disabled, onToggle, indent }: FilterRowProps) {
  // Note on `disabled`: in the Tools subtree, master-off children render
  // visually disabled but stay clickable so toggleTool's auto-enable branch
  // can fire on a single click. We can't use Radix Checkbox's `disabled` prop
  // for that because it blocks the click entirely. The `opacity-35` class
  // mirrors the disabled-state visual from the Checkbox primitive itself.
  return (
    <label
      htmlFor={id}
      title={title}
      className={`flex cursor-pointer select-none items-center gap-2 rounded-sm py-1.5 text-sm text-foreground hover:bg-accent ${
        indent ? 'pl-7 pr-2' : 'px-2'
      } ${disabled ? 'opacity-35' : ''}`}
    >
      <Checkbox
        id={id}
        checked={checked}
        aria-disabled={disabled || undefined}
        onCheckedChange={() => onToggle()}
      />
      <span className="font-mono text-xs">{label}</span>
    </label>
  );
}

interface ToolsParentRowProps {
  checked: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleChecked: () => void;
  visibleCount: number;
  totalCount: number;
}
function ToolsParentRow({
  checked,
  expanded,
  onToggleExpanded,
  onToggleChecked,
  visibleCount,
  totalCount,
}: ToolsParentRowProps) {
  return (
    <div
      data-testid="filter-row-tools"
      className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-accent"
    >
      <Checkbox id="filter-cat-tools" checked={checked} onCheckedChange={() => onToggleChecked()} />
      <label
        htmlFor="filter-cat-tools"
        className="flex-1 cursor-pointer select-none font-mono text-xs"
      >
        Tools
      </label>
      <span className="font-mono text-[10px] text-muted-foreground">
        {visibleCount} / {totalCount}
      </span>
      <button
        type="button"
        data-testid="tools-disclosure"
        aria-label={expanded ? 'Collapse tools' : 'Expand tools'}
        onClick={onToggleExpanded}
        className="grid size-4 place-items-center text-muted-foreground hover:text-foreground"
      >
        {expanded ? (
          <ChevronDown className="size-3" aria-hidden />
        ) : (
          <ChevronRight className="size-3" aria-hidden />
        )}
      </button>
    </div>
  );
}

interface ToolsSubtreeProps {
  aliasRows: Array<{ alias: string; raw: string[]; tokens: number; title: string }>;
  state: TimelineFilterState;
  knownAliases: string[];
  onChange: (next: TimelineFilterState) => void;
  masterOn: boolean;
}
function ToolsSubtree({ aliasRows, state, knownAliases, onChange, masterOn }: ToolsSubtreeProps) {
  if (aliasRows.length === 0) {
    return (
      <p className="px-7 py-1.5 font-mono text-xs italic text-muted-foreground">
        No tool usage yet.
      </p>
    );
  }
  return (
    <>
      {aliasRows.map((row) => (
        <FilterRow
          key={row.alias}
          id={`filter-tool-${row.alias}`}
          label={row.alias}
          title={row.title}
          checked={masterOn ? isToolVisible(row.alias, state.tools) : false}
          disabled={!masterOn}
          indent
          onToggle={() => onChange(toggleTool(state, row.alias, knownAliases))}
        />
      ))}
    </>
  );
}
