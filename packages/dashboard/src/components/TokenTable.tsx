import { useMemo, useState } from 'react';

import { formatTokens } from '../format/tokens.js';

export interface TokenTableRow {
  tool: string;
  tokens: number;
}

interface TokenTableProps {
  rows: TokenTableRow[];
}

type SortColumn = 'tool' | 'tokens';
type SortDirection = 'asc' | 'desc';
interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

const DEFAULT_SORT: SortState = { column: 'tokens', direction: 'desc' };

const DEFAULT_DIRECTION: Record<SortColumn, SortDirection> = {
  tool: 'asc',
  tokens: 'desc',
};

function compareRows(a: TokenTableRow, b: TokenTableRow, sort: SortState): number {
  const sign = sort.direction === 'asc' ? 1 : -1;
  if (sort.column === 'tool') {
    return a.tool.localeCompare(b.tool) * sign;
  }
  return (a.tokens - b.tokens) * sign;
}

export function TokenTable({ rows }: TokenTableProps) {
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);

  const total = useMemo(() => rows.reduce((sum, r) => sum + r.tokens, 0), [rows]);
  const sorted = useMemo(() => [...rows].sort((a, b) => compareRows(a, b, sort)), [rows, sort]);

  const onHeaderClick = (column: SortColumn) => {
    setSort((prev) =>
      prev.column === column
        ? { column, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column, direction: DEFAULT_DIRECTION[column] },
    );
  };

  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-text-3">
          <SortableHeader
            column="tool"
            label="Tool"
            sort={sort}
            onClick={onHeaderClick}
            align="left"
          />
          <SortableHeader
            column="tokens"
            label="Tokens"
            sort={sort}
            onClick={onHeaderClick}
            align="right"
          />
          <th scope="col" className="px-3 py-2 text-right font-mono">
            Share
          </th>
        </tr>
      </thead>
      <tbody>
        {sorted.length === 0 ? (
          <tr>
            <td colSpan={3} className="px-3 py-6 text-center text-xs italic text-text-3">
              No tool calls yet.
            </td>
          </tr>
        ) : (
          sorted.map((row) => {
            const share = total > 0 ? Math.round((row.tokens / total) * 100) : 0;
            return (
              <tr key={row.tool} className="border-b border-white/5 last:border-0">
                <td className="px-3 py-2 font-mono text-text">{row.tool}</td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-text">
                  {formatTokens(row.tokens)}
                </td>
                <td className="px-3 py-2 text-right font-mono tabular-nums text-text-2">
                  {share}%
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

interface SortableHeaderProps {
  column: SortColumn;
  label: string;
  sort: SortState;
  onClick: (column: SortColumn) => void;
  align: 'left' | 'right';
}

function SortableHeader({ column, label, sort, onClick, align }: SortableHeaderProps) {
  const active = sort.column === column;
  const ariaSort: 'ascending' | 'descending' | 'none' = active
    ? sort.direction === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none';
  const indicator = active ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : '';
  return (
    <th
      scope="col"
      aria-sort={ariaSort}
      onClick={() => onClick(column)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(column);
        }
      }}
      tabIndex={0}
      className={`cursor-pointer select-none px-3 py-2 font-mono hover:text-text ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${active ? 'text-text' : ''}`}
    >
      {label}
      {indicator}
    </th>
  );
}
