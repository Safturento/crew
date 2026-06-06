import { useAgent } from '../data/queries.js';
import { useFinishSteps } from '../data/useFinishSteps.js';
import { DrawerHeader } from './DrawerHeader.js';
import { FinishSteps } from './FinishSteps.js';
import { TokensByTool } from './TokensByTool.js';
import { Timeline } from './Timeline/Timeline.js';

export type AgentBodyMode = 'drawer' | 'full';

interface AgentBodyProps {
  agentKey: string;
  mode: AgentBodyMode;
  onClose?: () => void;
}

export function AgentBody({ agentKey, mode, onClose }: AgentBodyProps) {
  const { data, isLoading, error } = useAgent(agentKey);
  const finishSteps = useFinishSteps(agentKey);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Loading agent…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        Failed to load agent.
      </div>
    );
  }

  return (
    <div data-testid="agent-body" className="flex h-full min-h-0 flex-col">
      <DrawerHeader
        detail={data}
        showCloseButton={mode === 'drawer'}
        showOpenAsPage={mode === 'drawer'}
        onClose={onClose}
      />
      <div
        data-testid="agent-body-container"
        className="flex min-h-0 flex-1 flex-col gap-7 px-6 pb-8 pt-5"
      >
        <TokensByTool
          tokensByTool={data.tokens_by_tool}
          total={data.tokens.total}
          model={data.model}
        />
        <FinishSteps steps={finishSteps} />
        <div className="min-h-0 flex-1">
          <Timeline
            key={agentKey}
            agentKey={agentKey}
            agentState={data.state}
            tokensByTool={data.tokens_by_tool}
          />
        </div>
      </div>
    </div>
  );
}
