import type { FallbackProps } from 'react-error-boundary';

export function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 p-6">
      <div
        role="alert"
        className="rounded-[14px] border border-state-error/40 bg-state-error/10 px-6 py-8"
      >
        <p className="font-mono text-xs text-state-error">DASHBOARD ERROR</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-text">Something went wrong</p>
        <p className="mt-3 break-words text-sm text-text-2">{message}</p>
        <button
          type="button"
          onClick={resetErrorBoundary}
          className="mt-5 rounded-md border border-white/10 bg-surface-2 px-3 py-1.5 text-xs font-medium text-text hover:opacity-90"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
