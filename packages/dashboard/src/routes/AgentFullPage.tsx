import { AgentBody } from '../components/AgentBody.js';

interface AgentFullPageProps {
  agentKey: string;
}

export function AgentFullPage({ agentKey }: AgentFullPageProps) {
  return (
    <div
      data-testid="agent-page-container"
      className="flex h-full justify-center overflow-y-auto pt-8"
    >
      <div className="flex h-full w-[1056px] min-w-0 flex-col">
        <AgentBody agentKey={agentKey} mode="full" />
      </div>
    </div>
  );
}
