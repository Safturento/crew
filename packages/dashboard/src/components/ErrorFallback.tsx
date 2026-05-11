import type { FallbackProps } from 'react-error-boundary';

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-6">
      <div
        role="alert"
        className="rounded-lg border border-state-error/40 bg-state-error/10 px-6 py-8"
      >
        <p className="font-mono text-xs text-state-error">DASHBOARD ERROR</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
          Something went wrong
        </p>
        <p className="mt-3 break-words text-sm text-muted-foreground">{message}</p>
        <button
          type="button"
          onClick={resetErrorBoundary}
          className="mt-5 rounded-md border border-white/10 bg-popover px-3 py-1.5 text-xs font-medium text-foreground hover:opacity-90"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
