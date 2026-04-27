// Agent detail — drawer (and same content used by full-page route).

function CopyButton({ value }) {
  const [copied, setCopied] = React.useState(false);
  const onClick = (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button className="copy-btn" onClick={onClick} title="Copy">
      {copied ? <Icon.Check /> : <Icon.Copy />}
    </button>
  );
}

function TokenTable({ rows }) {
  const [sort, setSort] = React.useState({ key: 'count', dir: 'desc' });
  const sorted = [...rows].sort((a, b) => {
    const v = (a[sort.key] - b[sort.key]) * (sort.dir === 'asc' ? 1 : -1);
    return v;
  });
  const total = rows.reduce((s, r) => s + r.count, 0);
  const max = Math.max(...rows.map(r => r.count));
  const click = (k) => setSort(s => ({ key: k, dir: s.key === k && s.dir === 'desc' ? 'asc' : 'desc' }));

  return (
    <div className="ttbl">
      <div className="ttbl__hd">
        <div>Tool</div>
        <div className="ttbl__num clickable" onClick={() => click('count')}>
          Tokens {sort.key === 'count' ? (sort.dir === 'desc' ? '↓' : '↑') : ''}
        </div>
        <div className="ttbl__num clickable" onClick={() => click('share')}>
          Share {sort.key === 'share' ? (sort.dir === 'desc' ? '↓' : '↑') : ''}
        </div>
      </div>
      {sorted.map(r => (
        <div className="ttbl__row" key={r.tool}>
          <div className="ttbl__tool mono">{r.tool}</div>
          <div className="ttbl__num mono">{formatTokens(r.count)}</div>
          <div className="ttbl__share">
            <div className="ttbl__bar"><div className="ttbl__bar-fill" style={{ width: `${(r.count / max) * 100}%` }}/></div>
            <span className="mono">{r.share.toFixed(1)}%</span>
          </div>
        </div>
      ))}
      <div className="ttbl__total">
        <div className="dim">Total</div>
        <div className="mono">{formatTokens(total)}</div>
        <div></div>
      </div>
    </div>
  );
}

function StateHistory({ transcript, onJump }) {
  const segments = transcript.filter(t => t.type === 'segment');
  return (
    <div className="state-history">
      {segments.map((s, i) => (
        <React.Fragment key={i}>
          <button className="state-history__chip" onClick={() => onJump(s.startedAt)}>
            <StateBadge state={s.state} size="sm" />
            <span className="mono dim">{s.startedAt}</span>
          </button>
          {i < segments.length - 1 && <span className="state-history__arrow"><Icon.ArrowRight /></span>}
        </React.Fragment>
      ))}
    </div>
  );
}

function ToolCallCard({ entry, expanded, onToggle, density }) {
  const tag = `[${entry.name}]`;
  const dCls = `tcc tcc--${density}` + (expanded ? ' tcc--open' : '');
  return (
    <div className={dCls}>
      <button className="tcc__hd" onClick={onToggle}>
        <span className="tcc__line1 mono">
          <span className={`tcc__tag tcc__tag--${entry.name.toLowerCase()}`}>{tag}</span>
          <span className="tcc__summary">{entry.summary}</span>
        </span>
        <span className="tcc__line2 mono dim">
          <span>{entry.ts}</span>
          <span className="tcc__sep">·</span>
          <span>{formatTokens(entry.tokens)} tok</span>
        </span>
      </button>
      {expanded && entry.output && (
        <pre className="tcc__output mono">{entry.output}</pre>
      )}
    </div>
  );
}

function StateSegmentGroup({ segment, items, density, expandedSet, onToggleEntry, segRef, maxEvents }) {
  const m = STATE_META[segment.state];
  const [collapsed, setCollapsed] = React.useState(false);
  const overflowing = maxEvents > 0 && items.length > maxEvents;
  return (
    <div className={`segment segment--${m.color}`} ref={segRef}>
      <header className="segment__hd" onClick={() => setCollapsed(c => !c)}>
        <Icon.Chevron dir={collapsed ? 'right' : 'down'} />
        <StateBadge state={segment.state} size="sm" />
        <span className="mono dim">started {segment.startedAt}</span>
        <span className="segment__count dim">· {items.length} {items.length === 1 ? 'event' : 'events'}{overflowing ? ` · scroll for all` : ''}</span>
      </header>
      {!collapsed && (
        <div
          className={`segment__items${overflowing ? ' segment__items--scroll' : ''}`}
          style={overflowing ? { maxHeight: `calc(var(--seg-row-h, 64px) * ${maxEvents})` } : undefined}
        >
          {items.map((e, i) => (
            <ToolCallCard
              key={i}
              entry={e}
              expanded={expandedSet.has(`${segment.startedAt}-${i}`)}
              onToggle={() => onToggleEntry(`${segment.startedAt}-${i}`)}
              density={density}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Timeline({ agent, density, liveDemo, maxEventsPerSegment }) {
  const [search, setSearch] = React.useState('');
  const [live, setLive] = React.useState(true);
  const [expanded, setExpanded] = React.useState(new Set());
  const [streamedExtra, setStreamedExtra] = React.useState([]);
  const [newPending, setNewPending] = React.useState(0);
  const scrollerRef = React.useRef(null);
  const segRefs = React.useRef({});

  const toggleEntry = (id) => setExpanded(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // Group transcript into segments
  const groups = React.useMemo(() => {
    const allEntries = [...agent.transcript, ...streamedExtra];
    const result = [];
    let current = null;
    for (const t of allEntries) {
      if (t.type === 'segment') {
        current = { segment: t, items: [] };
        result.push(current);
      } else if (current) {
        current.items.push(t);
      }
    }
    return result;
  }, [agent, streamedExtra]);

  // Live-mode demo: synth-stream new events
  React.useEffect(() => {
    if (!liveDemo || agent.state !== 'running') return;
    const samples = [
      { type: 'tool', name: 'Read', summary: 'src/index.ts', tokens: 420 },
      { type: 'tool', name: 'Grep', summary: "'export' in src/", tokens: 180 },
      { type: 'tool', name: 'Edit', summary: 'src/index.ts (+4 −1)', tokens: 380 },
      { type: 'tool', name: 'Bash', summary: 'pnpm typecheck', tokens: 240 },
      { type: 'tool', name: 'Read', summary: 'src/utils/parse.ts', tokens: 320 },
    ];
    let i = 0;
    const id = setInterval(() => {
      const s = samples[i % samples.length];
      const now = new Date();
      const ts = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}`;
      setStreamedExtra(prev => [...prev, { ...s, ts }]);
      if (!live) setNewPending(n => n + 1);
      i++;
    }, 2200);
    return () => clearInterval(id);
  }, [liveDemo, agent.state, live]);

  // Auto-scroll when live
  React.useEffect(() => {
    if (live && scrollerRef.current) {
      scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
      setNewPending(0);
    }
  }, [streamedExtra, live]);

  const filtered = groups.map(g => ({
    ...g,
    items: g.items.filter(e => {
      if (!search) return true;
      const s = search.toLowerCase();
      if (s.startsWith('error:')) return e.output && e.output.toLowerCase().includes('error');
      return (e.name || '').toLowerCase().includes(s) || (e.summary || '').toLowerCase().includes(s);
    }),
  }));

  return (
    <div className="timeline">
      <div className="timeline__controls">
        <div className="timeline__search">
          <Icon.Search />
          <input
            placeholder="Search tool, input, or error:…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <label className="live-toggle">
          <input type="checkbox" checked={live} onChange={e => { setLive(e.target.checked); if (e.target.checked) setNewPending(0); }} />
          <span className="live-toggle__pill"><span className={`live-toggle__dot ${live ? 'live' : ''}`} /></span>
          <span>Live</span>
        </label>
      </div>
      <div className="timeline__scroll" ref={scrollerRef}>
        {filtered.map((g, i) => (
          <StateSegmentGroup
            key={i}
            segment={g.segment}
            items={g.items}
            density={density}
            expandedSet={expanded}
            onToggleEntry={toggleEntry}
            segRef={el => { if (el) segRefs.current[g.segment.startedAt] = el; }}
            maxEvents={maxEventsPerSegment}
          />
        ))}
        {filtered.every(g => g.items.length === 0) && search && (
          <div className="timeline__empty">No events match "{search}"</div>
        )}
      </div>
      {!live && newPending > 0 && (
        <button className="new-events-pill" onClick={() => { setLive(true); }}>
          <Icon.ArrowUp /> {newPending} new event{newPending === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
}

function AgentDetail({ agent, onClose, onAction, asPage, tweaks }) {
  const m = STATE_META[agent.state];
  const project = MOCK_PROJECTS.find(p => p.name === agent.project);

  React.useEffect(() => {
    if (asPage) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [asPage, onClose]);

  const primaryAction = (() => {
    switch (agent.state) {
      case 'idle': return <button className="btn" onClick={() => onAction('resume', agent)}>Resume</button>;
      case 'waiting': return <button className="btn btn--accent" onClick={() => onAction('resume', agent)}>Provide input</button>;
      case 'pr_open': return <a className="btn" href={agent.pr} target="_blank" rel="noreferrer">View PR <Icon.External /></a>;
      case 'error': return <button className="btn btn--danger" onClick={() => onAction('retry', agent)}>Retry</button>;
      case 'finished': return null;
      default: return <button className="btn btn--ghost" onClick={() => onAction('pause', agent)}>Pause</button>;
    }
  })();

  return (
    <div className={`drawer ${asPage ? 'drawer--page' : 'drawer--overlay'}`}>
      <header className="drawer__hd">
        <div className="drawer__hd-top">
          <div className="drawer__crumb">
            <span className="dim">{project?.name}</span>
            <span className="dim">/</span>
            <span className="mono">{agent.key}</span>
          </div>
          <div className="drawer__hd-actions">
            {!asPage && <a className="btn btn--ghost btn--sm" href={`#/agent/${agent.key}/full`}>↗ Open as page</a>}
            {primaryAction}
            {!asPage && <button className="icon-btn" onClick={onClose} aria-label="Close"><Icon.Close /></button>}
          </div>
        </div>
        <h1 className="drawer__title">{agent.title}</h1>
        <div className="drawer__meta">
          <StateBadge state={agent.state} />
          <span className="meta-sep" />
          <span className="mono dim">runtime</span>
          <span className="mono">{agent.runtime}</span>
          <span className="meta-sep" />
          <span className="mono dim">tokens</span>
          <span className="mono">{formatTokens(agent.tokens)}</span>
          <span className="meta-sep" />
          <span className="mono dim">started</span>
          <span className="mono">{agent.started}</span>
        </div>
        <div className="drawer__links">
          <span className="link-row">
            <Icon.Folder />
            <span className="mono">{agent.worktree}</span>
            <CopyButton value={agent.worktree} />
          </span>
          {agent.docker && (
            <a className="link-row" href={agent.docker} target="_blank" rel="noreferrer">
              <span className="dim mono">docker</span>
              <span className="mono">{agent.docker}</span>
              <Icon.External />
            </a>
          )}
          {agent.pr && (
            <a className="link-row" href={agent.pr} target="_blank" rel="noreferrer">
              <span className="dim mono">PR</span>
              <span className="mono">#{agent.prNumber}</span>
              <Icon.External />
            </a>
          )}
        </div>
      </header>
      <div className="drawer__body">
        <section className="drawer__section">
          <h2 className="drawer__section-title">Tokens by tool</h2>
          <TokenTable rows={agent.tokenTable} />
        </section>
        <section className="drawer__section">
          <h2 className="drawer__section-title">State history</h2>
          <StateHistory transcript={agent.transcript} onJump={() => {}} />
        </section>
        <section className="drawer__section drawer__section--timeline">
          <h2 className="drawer__section-title">Timeline</h2>
          <Timeline agent={agent} density={tweaks.timelineDensity} liveDemo={tweaks.liveDemo} maxEventsPerSegment={tweaks.maxEventsPerSegment} />
        </section>
      </div>
    </div>
  );
}

Object.assign(window, { AgentDetail });
