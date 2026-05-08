import { AgentBody } from '../components/AgentBody.js';

interface AgentFullPageProps {
  agentKey: string;
}

export function AgentFullPage({ agentKey }: AgentFullPageProps) {
  return (
    <div className="mx-auto flex h-full w-full max-w-[1240px] flex-col">
      <AgentBody agentKey={agentKey} mode="full" />
    </div>
  );
}
