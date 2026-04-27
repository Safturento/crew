import type { Agent, Project } from '../data/types.js';
import { sortAgentsByPriority } from '../data/state-meta.js';
import { ProjectSection } from './ProjectSection.js';

interface AgentsListProps {
  projects: Project[];
  agents: Agent[];
  onSelectAgent: (key: string) => void;
}

export function AgentsList({ projects, agents, onSelectAgent }: AgentsListProps) {
  const byProject = new Map<string, Agent[]>();
  for (const agent of agents) {
    const list = byProject.get(agent.projectName) ?? [];
    list.push(agent);
    byProject.set(agent.projectName, list);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-7 p-6">
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
  );
}
