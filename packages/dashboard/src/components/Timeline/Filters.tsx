import { ChevronDown, ChevronRight, Filter } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';

import type { AgentDetailTokensByTool } from '../../data/types.js';
import { aggregateByAlias } from '../../format/tool-alias.js';
import { useOverlayGuard } from '../../routes/overlay-guard.js';
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
  const guard = useOverlayGuard();

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
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          guard.setOverlayOpen(true);
        } else {
          // Radix closes on pointerdown-outside, firing this BEFORE the
          // backdrop's click. Defer clearing the flag to the next tick so the
          // synchronous backdrop click still sees the overlay as open and
          // doesn't dismiss the drawer along with the popover.
          setTimeout(() => guard.setOverlayOpen(false), 0);
        }
      }}
    >
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
            <span data-testid="filters-badge" className="ml-1">
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
                <FilterRow
                  key="tools"
                  id="filter-cat-tools"
                  testId="filter-row-tools"
                  label="Tools"
                  checked={toolsChecked}
                  onToggle={() => onChange(toggleCategory(state, 'tools'))}
                  expanded={toolsExpanded}
                  onToggleExpanded={() => setToolsExpanded((e) => !e)}
                  count={{ visible: visibleToolCount, total: knownAliases.length }}
                >
                  <ToolsSubtree
                    aliasRows={aliasRows}
                    state={state}
                    knownAliases={knownAliases}
                    onChange={onChange}
                    masterOn={toolsChecked}
                  />
                </FilterRow>
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
  testId?: string;
  /** Visible/total count rendered before the disclosure chevron. */
  count?: { visible: number; total: number };
  /** When set, the row carries a disclosure chevron toggling this callback. */
  onToggleExpanded?: () => void;
  /** Current disclosure state — drives the chevron glyph + aria-label. */
  expanded?: boolean;
  /** Subtree rendered after the row when `expanded` is true. */
  children?: React.ReactNode;
}
function FilterRow({
  id,
  label,
  title,
  checked,
  disabled,
  onToggle,
  indent,
  testId,
  count,
  onToggleExpanded,
  expanded,
  children,
}: FilterRowProps) {
  // Note on `disabled`: in the Tools subtree, master-off children render
  // visually disabled but stay clickable so toggleTool's auto-enable branch
  // can fire on a single click. We can't use Radix Checkbox's `disabled` prop
  // for that because it blocks the click entirely. The `opacity-35` class
  // mirrors the disabled-state visual from the Checkbox primitive itself.
  //
  // The <label> only wraps the Checkbox + label text so that the row's
  // accessible name resolves cleanly to `label` (testing-library queries +
  // SR readout). The optional count + disclosure chevron live as siblings
  // inside the row container, not inside the label.
  return (
    <Fragment>
      <div
        data-testid={testId}
        title={title}
        className={`flex items-center gap-2 rounded-sm py-1.5 text-sm text-foreground hover:bg-accent ${
          indent ? 'pl-7 pr-2' : 'px-2'
        } ${disabled ? 'opacity-35' : ''}`}
      >
        <Checkbox
          id={id}
          checked={checked}
          aria-disabled={disabled || undefined}
          onCheckedChange={() => onToggle()}
        />
        <label htmlFor={id} className="flex-1 cursor-pointer select-none font-mono text-xs">
          {label}
        </label>
        {count && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {count.visible} / {count.total}
          </span>
        )}
        {onToggleExpanded && (
          <button
            type="button"
            data-testid={id === 'filter-cat-tools' ? 'tools-disclosure' : undefined}
            aria-label={expanded ? 'Collapse' : 'Expand'}
            onClick={onToggleExpanded}
            className="grid size-4 place-items-center text-muted-foreground hover:text-foreground"
          >
            {expanded ? (
              <ChevronDown className="size-3" aria-hidden />
            ) : (
              <ChevronRight className="size-3" aria-hidden />
            )}
          </button>
        )}
      </div>
      {expanded && children}
    </Fragment>
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
