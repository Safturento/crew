import { useId, useState } from 'react';

import type { Agent, Project } from '../data/types.js';
import { sortAgentsByPriority } from '../data/state-meta.js';
import { MetricsTrendWidget } from './MetricsTrendWidget.js';
import { ProjectSection } from './ProjectSection.js';
import type { QuickActionKind } from './AgentRow.js';
import { Switch } from './ui/switch.js';

const HIDE_FINISHED_KEY = 'crew.dashboard.hideFinished';

function readHideFinished(): boolean {
  if (typeof localStorage === 'undefined') return true;
  return localStorage.getItem(HIDE_FINISHED_KEY) !== 'false';
}

function writeHideFinished(value: boolean): void {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem(HIDE_FINISHED_KEY, value ? 'true' : 'false');
}

interface AgentsListProps {
  projects: Project[];
  agents: Agent[];
  onSelectAgent: (key: string) => void;
  onAgentAction?: (kind: QuickActionKind, agent: Agent) => void;
  onOpenProject?: (name: string) => void;
  /** CREW-217: gates runner-dependent QuickActions on every row. */
  runnerOnline?: boolean;
}

export function AgentsList({
  projects,
  agents,
  onSelectAgent,
  onAgentAction,
  onOpenProject,
  runnerOnline = true,
}: AgentsListProps) {
  const [hideFinished, setHideFinished] = useState<boolean>(readHideFinished);
  const hideFinishedId = useId();

  const handleHideFinishedChange = (next: boolean) => {
    setHideFinished(next);
    writeHideFinished(next);
  };

  const visibleAgents = hideFinished ? agents.filter((a) => a.state !== 'finished') : agents;

  const byProject = new Map<string, Agent[]>();
  for (const agent of visibleAgents) {
    const list = byProject.get(agent.projectName) ?? [];
    list.push(agent);
    byProject.set(agent.projectName, list);
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-6">
      <MetricsTrendWidget />
      <div className="flex items-center justify-end">
        <span className="inline-flex items-center gap-1.5">
          <Switch
            id={hideFinishedId}
            aria-label="Hide finished"
            checked={hideFinished}
            onCheckedChange={handleHideFinishedChange}
          />
          <label
            htmlFor={hideFinishedId}
            className="cursor-pointer select-none font-mono text-xs leading-none text-muted-foreground"
          >
            Hide finished
          </label>
        </span>
      </div>
      <div className="flex flex-col gap-7">
        {projects
          .filter((p) => byProject.has(p.name))
          .map((project) => (
            <ProjectSection
              key={project.name}
              project={project}
              agents={sortAgentsByPriority(byProject.get(project.name) ?? [])}
              onSelectAgent={onSelectAgent}
              onAgentAction={onAgentAction}
              onOpenProject={onOpenProject}
              runnerOnline={runnerOnline}
            />
          ))}
      </div>
    </div>
  );
}
