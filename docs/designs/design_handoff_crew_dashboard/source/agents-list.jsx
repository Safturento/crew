// Agents list — home route. Project sections, carded rows.

const STATE_META = {
  initializing: { label: 'Initializing', color: 'blue', attention: false },
  running:      { label: 'Running',      color: 'neutral', attention: false },
  idle:         { label: 'Idle',         color: 'gray', attention: false },
  waiting:      { label: 'Waiting',      color: 'yellow', attention: true },
  pr_open:      { label: 'PR open',      color: 'purple', attention: true },
  error:        { label: 'Error',        color: 'red', attention: true },
  finished:     { label: 'Finished',     color: 'green', attention: false },
};

function StateBadge({ state, size = 'md', intensity = 'mid' }) {
  const m = STATE_META[state] || STATE_META.running;
  const cls = `state-pill state-pill--${m.color} state-pill--${size} state-pill--${intensity}`;
  return (
    <span className={cls}>
      <span className="state-pill__dot">
        {state === 'running' || state === 'initializing' ? <Icon.Pulse /> : <Icon.Dot />}
      </span>
      <span className="state-pill__label">{m.label}</span>
    </span>
  );
}

function QuickAction({ agent, onAction }) {
  const stop = (e) => e.stopPropagation();
  switch (agent.state) {
    case 'idle':
      return (
        <div className="qa-group" onClick={stop}>
          <button className="btn btn--sm" onClick={() => onAction('resume', agent)}>Resume</button>
          <button className="btn btn--sm btn--ghost" onClick={() => onAction('finish', agent)}>Finish</button>
        </div>
      );
    case 'waiting':
      return <button className="btn btn--sm btn--accent" onClick={(e) => { stop(e); onAction('resume', agent); }}>Provide input</button>;
    case 'pr_open':
      return (
        <div className="qa-group" onClick={stop}>
          <a className="btn btn--sm" href={agent.pr} target="_blank" rel="noreferrer">View PR <Icon.External /></a>
          <button className="btn btn--sm btn--ghost" onClick={() => onAction('finish', agent)}>Finish</button>
        </div>
      );
    case 'error':
      return <button className="btn btn--sm btn--danger" onClick={(e) => { stop(e); onAction('inspect', agent); }}>Inspect</button>;
    default:
      return null;
  }
}

function AgentRow({ agent, onOpen, onAction, intensity, attentionTreatment, density, texture }) {
  const m = STATE_META[agent.state];
  const attention = m.attention;
  const tinted = attention && attentionTreatment !== 'subtle';
  const cls = [
    'agent-row',
    `agent-row--density-${density}`,
    `agent-row--state-${m.color}`,
    texture && texture !== 'none' && `agent-row--tex-${texture}`,
    tinted && `agent-row--tint-${m.color}`,
    attention && attentionTreatment === 'strong' && 'agent-row--strong',
  ].filter(Boolean).join(' ');

  return (
    <div className={cls} onClick={() => onOpen(agent.key)} role="button" tabIndex={0}
         onKeyDown={(e) => { if (e.key === 'Enter') onOpen(agent.key); }}>
      <div className="agent-row__state">
        <StateBadge state={agent.state} intensity={intensity} />
      </div>
      <div className="agent-row__key mono">{agent.key}</div>
      <div className="agent-row__title">{agent.title}</div>
      <div className="agent-row__runtime mono">
        {agent.state === 'running' || agent.state === 'initializing' ? (
          <span className="runtime-live">{agent.runtime}</span>
        ) : agent.runtime}
      </div>
      <div className="agent-row__tokens mono">{formatTokens(agent.tokens)}</div>
      <div className="agent-row__action">
        <QuickAction agent={agent} onAction={onAction} />
      </div>
    </div>
  );
}

function ProjectSection({ project, agents, onOpen, onAction, tweaks, collapsed, onToggle, onOpenProject }) {
  const activeCount = agents.filter(a => a.state !== 'finished').length;
  return (
    <section className="project-section">
      <header className="project-section__hd" onClick={onToggle}>
        <div className="project-section__title">
          <Icon.Chevron dir={collapsed ? 'right' : 'down'} />
          <span className="project-section__name">{project.name}</span>
          {onOpenProject && (
            <button
              className="icon-btn icon-btn--ghost project-section__open"
              title="Open project page"
              onClick={(e) => { e.stopPropagation(); onOpenProject(project.name); }}
            >
              <Icon.External />
            </button>
          )}
          <span className="project-section__count">
            {activeCount} active <span className="dim">· {agents.length} total</span>
          </span>
        </div>
        <div className="project-section__path mono dim">{project.repo_path}</div>
      </header>
      {!collapsed && (
        <div className="project-section__rows">
          {agents.length === 0 ? (
            <div className="empty-row">No agents yet — start one with <kbd>+ New Run</kbd></div>
          ) : agents.map(a => (
            <AgentRow
              key={a.key}
              agent={a}
              onOpen={onOpen}
              onAction={onAction}
              intensity={tweaks.stateIntensity}
              attentionTreatment={tweaks.attentionTreatment}
              density={tweaks.rowDensity}
              texture={tweaks.rowTexture}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AgentsList({ onOpen, onAction, onNewRun, tweaks, projectFilter, onOpenProject }) {
  const grouped = agentsByProject();
  // Sort: attention states first, then by start time desc
  const stateOrder = { waiting: 0, error: 1, pr_open: 2, running: 3, initializing: 4, idle: 5, finished: 6 };
  const sortAgents = (arr) => [...arr].sort((a, b) => {
    const so = stateOrder[a.state] - stateOrder[b.state];
    if (so !== 0) return so;
    return b.started.localeCompare(a.started);
  });

  const [collapsed, setCollapsed] = React.useState({});
  const toggle = (name) => setCollapsed(c => ({ ...c, [name]: !c[name] }));

  const projectsToRender = projectFilter
    ? MOCK_PROJECTS.filter(p => p.name === projectFilter)
    : MOCK_PROJECTS;

  return (
    <div className="agents-list">
      <div className="agents-list__inner">
        {projectsToRender.map(p => (
          <ProjectSection
            key={p.name}
            project={p}
            agents={sortAgents(grouped[p.name] || [])}
            onOpen={onOpen}
            onAction={onAction}
            tweaks={tweaks}
            collapsed={!!collapsed[p.name]}
            onToggle={() => toggle(p.name)}
            onOpenProject={projectFilter ? null : onOpenProject}
          />
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { AgentsList, StateBadge, STATE_META });
