const STATES = [
  { name: 'initializing', color: 'var(--color-state-initializing)' },
  { name: 'running', color: 'var(--color-state-running)' },
  { name: 'idle', color: 'var(--color-state-idle)' },
  { name: 'waiting', color: 'var(--color-state-waiting)' },
  { name: 'pr_open', color: 'var(--color-state-pr-open)' },
  { name: 'error', color: 'var(--color-state-error)' },
  { name: 'finished', color: 'var(--color-state-finished)' },
] as const;

export function App() {
  return (
    <div className="min-h-screen bg-canvas p-6">
      <div className="mx-auto max-w-3xl rounded-lg border border-border bg-bg p-8 shadow-2xl">
        <header className="flex items-baseline gap-2">
          <h1 className="text-xl font-semibold tracking-tight">crew</h1>
          <span className="mono text-text-3 text-xs">dashboard bootstrap</span>
        </header>

        <p className="text-text-2 mt-3 text-sm">
          Foundation only — Vite + React + Tailwind v4 + Vitest. The seven state-palette tokens
          render below.
        </p>

        <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {STATES.map((state) => (
            <li
              key={state.name}
              className="border-border bg-surface flex items-center gap-3 rounded-md border p-3"
            >
              <span
                aria-hidden="true"
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: state.color }}
              />
              <span className="mono text-text text-sm">{state.name}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
