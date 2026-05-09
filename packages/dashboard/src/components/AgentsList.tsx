import { useState } from 'react';

import type { Agent, Project } from '../data/types.js';
import { sortAgentsByPriority } from '../data/state-meta.js';
import { ProjectSection } from './ProjectSection.js';

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
}

export function AgentsList({ projects, agents, onSelectAgent }: AgentsListProps) {
  const [hideFinished, setHideFinished] = useState<boolean>(readHideFinished);

  const toggleHideFinished = () => {
    setHideFinished((prev) => {
      const next = !prev;
      writeHideFinished(next);
      return next;
    });
  };

  const visibleAgents = hideFinished ? agents.filter((a) => a.state !== 'finished') : agents;

  const byProject = new Map<string, Agent[]>();
  for (const agent of visibleAgents) {
    const list = byProject.get(agent.projectName) ?? [];
    list.push(agent);
    byProject.set(agent.projectName, list);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-4 p-6">
      <div className="flex items-center justify-end">
        <button
          type="button"
          role="switch"
          aria-checked={hideFinished}
          aria-label="Hide finished"
          onClick={toggleHideFinished}
          className={[
            'inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2 font-mono text-[11px] leading-none transition-opacity hover:opacity-80',
            hideFinished
              ? 'border-white/30 bg-white/10 text-text'
              : 'border-white/10 bg-transparent text-text-3',
          ].join(' ')}
        >
          Hide finished
        </button>
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
            />
          ))}
      </div>
    </div>
  );
}
