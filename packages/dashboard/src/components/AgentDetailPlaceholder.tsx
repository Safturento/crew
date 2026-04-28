import { navigate } from '../routing/useHashRoute.js';

export function AgentDetailPlaceholder({ agentKey }: { agentKey: string }) {
  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 p-6">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="self-start rounded-md border border-white/10 px-3 py-1.5 text-xs text-text-2 hover:bg-surface-2"
      >
        ← Back to agents
      </button>
      <div className="rounded-[14px] border border-white/10 bg-surface px-6 py-8">
        <p className="font-mono text-xs text-text-3">AGENT</p>
        <p className="mt-1 text-2xl font-semibold tracking-tight text-text">{agentKey}</p>
        <p className="mt-3 text-sm text-text-2">
          The agent detail drawer ships in a follow-up plan.
        </p>
      </div>
    </div>
  );
}
