import { useQuery } from '@tanstack/react-query';

import { ProjectConfigBlock } from '../components/ProjectConfigBlock.js';
import { ProjectHeader } from '../components/ProjectHeader.js';
import { ProjectSection } from '../components/ProjectSection.js';
import { defaultClient, useProject } from '../data/queries.js';
import { navigate } from '../routing/useHashRoute.js';

interface ProjectDetailPageProps {
  slug: string;
}

export function ProjectDetailPage({ slug }: ProjectDetailPageProps) {
  const detailQuery = useProject(slug);
  const agentsQuery = useQuery({
    queryKey: ['agents'],
    queryFn: () => defaultClient.listAgents(),
    refetchInterval: 2000,
  });

  if (detailQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-7xl p-6 text-sm text-muted-foreground">
        Loading project…
      </div>
    );
  }

  if (detailQuery.error || !detailQuery.data) {
    return (
      <div className="mx-auto w-full max-w-7xl p-6 text-sm text-muted-foreground">
        Project not found.
      </div>
    );
  }

  const { project, configPath } = detailQuery.data;
  const filteredAgents = (agentsQuery.data ?? []).filter((a) => a.projectName === project.name);
  const total = filteredAgents.length;
  const active = filteredAgents.filter((a) => a.state !== 'finished').length;

  return (
    <div className="mx-auto w-full max-w-7xl p-6">
      <ProjectHeader name={project.name} configPath={configPath} />
      <ProjectConfigBlock config={project} />
      <div className="mt-8 mb-2 flex items-center gap-2">
        <h2 className="font-mono text-xs uppercase tracking-wide text-muted-foreground">AGENTS</h2>
        <span className="text-xs text-muted-foreground">
          {active} active · {total} total
        </span>
      </div>
      <ProjectSection
        project={{
          name: project.name,
          repoPath: project.repo_path,
          branch: project.default_branch,
          jiraKey: project.jira.project_key,
          activeCount: active,
        }}
        agents={filteredAgents}
        onSelectAgent={(key) => navigate(`/agent/${encodeURIComponent(key)}`)}
        showHeader={false}
      />
    </div>
  );
}
