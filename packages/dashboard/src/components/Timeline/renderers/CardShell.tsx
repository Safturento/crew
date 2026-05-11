import { useState, type ReactNode } from 'react';

interface CardShellProps {
  lineOne: ReactNode;
  lineTwo?: ReactNode;
  expanded?: ReactNode;
  errorTone?: boolean;
}

export function CardShell({ lineOne, lineTwo, expanded, errorTone }: CardShellProps) {
  const [open, setOpen] = useState(false);
  const hasExpand = expanded !== undefined && expanded !== null;
  return (
    <div
      data-testid="event-card"
      className={`border-b border-white/5 px-3 py-2 font-mono text-xs ${
        errorTone ? 'text-red-400' : 'text-muted-foreground'
      }`}
    >
      <button
        type="button"
        data-testid="card-line-1"
        onClick={() => hasExpand && setOpen((v) => !v)}
        aria-expanded={hasExpand ? open : undefined}
        className={`block w-full truncate text-left ${
          hasExpand ? 'cursor-pointer hover:text-foreground' : 'cursor-default'
        }`}
      >
        {lineOne}
      </button>
      {lineTwo ? (
        <div data-testid="card-line-2" className="text-muted-foreground">
          {lineTwo}
        </div>
      ) : null}
      {hasExpand && open ? (
        <pre
          data-testid="card-expanded"
          className="mt-2 overflow-x-auto rounded-sm bg-black/30 p-2 text-xs whitespace-pre-wrap text-foreground"
        >
          {expanded}
        </pre>
      ) : null}
    </div>
  );
}
