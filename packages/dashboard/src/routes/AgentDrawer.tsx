import { AgentBody } from '../components/AgentBody.js';
import { Drawer } from '../components/Drawer.js';

interface AgentDrawerProps {
  agentKey: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AgentDrawer({ agentKey, open, onOpenChange }: AgentDrawerProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Agent detail">
      <AgentBody agentKey={agentKey} mode="drawer" onClose={() => onOpenChange(false)} />
    </Drawer>
  );
}
