// Agent detail — drawer (and same content used by full-page route).

// ── Timeline filter catalog ───────────────────────────────────────────────
// The six event-type categories the operator filters by. Tool-name
// filtering (Bash / Read / Grep / …) is intentionally OUT of this iteration
// — it's a separate UX problem (long, dynamic list).
const EVENT_TYPES = [
  { id: 'tool',      label: 'Tool calls' },
  { id: 'assistant', label: 'Assistant prose' },
  { id: 'thinking',  label: 'Thinking' },
  { id: 'system',    label: 'System' },
  { id: 'hooks',     label: 'Hooks & skills' },
  { id: 'other',     label: 'Other' },
];
const EVENT_TYPE_IDS = EVENT_TYPES.map(e => e.id);
const TIMELINE_FILTERS_KEY = 'crew.dashboard.timelineFilters';

// Read/write the operator preference. Lives at a single global key so the
// preference persists across drawer opens and across agents — not per-agent.
// Implementer should swap into `useLocalStorage` or equivalent hook.
function readStoredTimelineFilters() {
  try {
    const raw = localStorage.getItem(TIMELINE_FILTERS_KEY);
    if (!raw) return new Set(EVENT_TYPE_IDS);
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set(EVENT_TYPE_IDS);
    return new Set(arr.filter(id => EVENT_TYPE_IDS.includes(id)));
  } catch { return new Set(EVENT_TYPE_IDS); }
}
function writeStoredTimelineFilters(set) {
  try { localStorage.setItem(TIMELINE_FILTERS_KEY, JSON.stringify([...set])); } catch {}
}

// Map a transcript entry to one of the six categories. The mock transcript
// only emits 'segment' + 'tool' rows today; production stream will carry
// `type` directly. Anything unrecognised falls into 'other'.
function entryEventType(e) {
  if (!e || e.type === 'segment') return null;
  if (e.type === 'tool') return 'tool';
  if (e.type === 'assistant' || e.type === 'prose') return 'assistant';
  if (e.type === 'thinking') return 'thinking';
  if (e.type === 'system') return 'system';
  if (e.type === 'hook' || e.type === 'skill') return 'hooks';
  return 'other';
}

// Counts shown next to each row. Implementer reads from the daemon's
// per-agent type index; the demo synthesises plausible numbers from the
// agent's transcript so the popover doesn't render with zeroes everywhere.
function eventTypeCounts(agent) {
  const t = agent.transcript || [];
  const tool = t.filter(e => e.type === 'tool').length;
  return {
    tool,
    assistant: Math.max(8, Math.round(tool * 0.42)),
    thinking:  Math.max(4, Math.round(tool * 0.31)),
    system:    Math.max(2, t.filter(e => e.type === 'segment').length),
    hooks:     Math.max(0, Math.round(tool * 0.08)),
    other:     2,
  };
}

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

// ── Filters: button + popover ─────────────────────────────────────────────
// Visual variants exposed as an explicit `state` prop. The implementer
// translates this into a `cva` variant on the production component.
function FilterButton({ state, hiddenCount, expanded, onClick, btnRef }) {
  return (
    <button
      ref={btnRef}
      type="button"
      className={`filter-btn filter-btn--${state}`}
      aria-haspopup="dialog"
      aria-expanded={expanded}
      onClick={onClick}
    >
      <span className="filter-btn__dot" aria-hidden="true" />
      <Icon.Funnel size={12} />
      <span className="filter-btn__label">Filters</span>
      {state === 'active' && (
        <span className="filter-btn__count mono">
          <span className="filter-btn__sep" aria-hidden="true">·</span>
          {hiddenCount} hidden
        </span>
      )}
      <Icon.Chevron dir={expanded ? 'up' : 'down'} size={10} />
    </button>
  );
}

// Closed by default; trigger opens. Designed to map cleanly onto
// Radix `Popover` — trigger → portal → content with focus trap +
// click-outside + escape. Reference markup uses semantic equivalents so the
// implementer swaps the wrapper without rewriting the body.
function FiltersPopover({ counts, selected, onChange, onClose, anchorRef }) {
  const popoverRef = React.useRef(null);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
    };
    const onMouse = (e) => {
      if (popoverRef.current?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return;
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onMouse);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onMouse);
    };
  }, [onClose, anchorRef]);

  // Focus first checkbox so keyboard users can tab through immediately.
  React.useEffect(() => {
    const first = popoverRef.current?.querySelector('input[type="checkbox"]');
    first?.focus();
  }, []);

  const allOn  = EVENT_TYPE_IDS.every(id => selected.has(id));
  const allOff = selected.size === 0;

  const toggle = (id) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    onChange(next);
  };
  const selectAll = () => onChange(new Set(EVENT_TYPE_IDS));
  const clearAll  = () => onChange(new Set());

  return (
    <div
      ref={popoverRef}
      className="filter-popover"
      role="dialog"
      aria-label="Timeline filters"
    >
      <div className="filter-popover__hd">
        <span className="filter-popover__hd-label">Show events</span>
        <div className="filter-popover__hd-actions">
          <button
            type="button"
            className="filter-popover__link"
            onClick={selectAll}
            disabled={allOn}
          >Select all</button>
          <span className="filter-popover__hd-sep" aria-hidden="true">·</span>
          <button
            type="button"
            className="filter-popover__link"
            onClick={clearAll}
            disabled={allOff}
          >Clear all</button>
        </div>
      </div>
      <ul className="filter-popover__list" role="group" aria-label="Event types">
        {EVENT_TYPES.map(et => {
          const checked = selected.has(et.id);
          const count = counts[et.id] ?? 0;
          return (
            <li key={et.id}>
              <label className={`filter-row${checked ? ' filter-row--on' : ''}`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(et.id)}
                />
                <span className="filter-row__check" aria-hidden="true">
                  {checked && <Icon.Check size={11} />}
                </span>
                <span className="filter-row__label">{et.label}</span>
                <span className="filter-row__count mono">{count.toLocaleString()}</span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Timeline({ agent, density, liveDemo, maxEventsPerSegment }) {
  const [search, setSearch] = React.useState('');
  const [live, setLive] = React.useState(true);
  const [expanded, setExpanded] = React.useState(new Set());
  const [streamedExtra, setStreamedExtra] = React.useState([]);
  const [newPending, setNewPending] = React.useState(0);
  // Initialised from localStorage so the operator's preference is visible at
  // mount; the implementer wraps this in a `useLocalStorage('crew.dashboard.timelineFilters')`
  // hook in the real codebase.
  const [filters, setFilters] = React.useState(() => readStoredTimelineFilters());
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const filterBtnRef = React.useRef(null);
  const scrollerRef = React.useRef(null);
  const segRefs = React.useRef({});

  const counts = React.useMemo(() => eventTypeCounts(agent), [agent]);
  const hiddenCount = EVENT_TYPE_IDS.length - filters.size;
  const allFiltersOff = filters.size === 0;
  const filterButtonState = filters.size === EVENT_TYPE_IDS.length ? 'default' : 'active';

  const updateFilters = (next) => {
    setFilters(next);
    writeStoredTimelineFilters(next);
  };

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
      const et = entryEventType(e);
      if (et && !filters.has(et)) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      if (s.startsWith('error:')) return e.output && e.output.toLowerCase().includes('error');
      return (e.name || '').toLowerCase().includes(s) || (e.summary || '').toLowerCase().includes(s);
    }),
  }));

  return (
    <div className="timeline">
      <div className="timeline__controls">
        <div className="timeline__filter-wrap">
          <FilterButton
            state={filterButtonState}
            hiddenCount={hiddenCount}
            expanded={filtersOpen}
            onClick={() => setFiltersOpen(v => !v)}
            btnRef={filterBtnRef}
          />
          {filtersOpen && (
            <FiltersPopover
              counts={counts}
              selected={filters}
              onChange={updateFilters}
              onClose={() => setFiltersOpen(false)}
              anchorRef={filterBtnRef}
            />
          )}
        </div>
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
        {allFiltersOff ? (
          <div className="timeline__empty timeline__empty--all-filtered">
            <div className="timeline__empty-msg">No event types selected.</div>
            <button
              type="button"
              className="timeline__empty-link"
              onClick={() => updateFilters(new Set(EVENT_TYPE_IDS))}
            >Show all</button>
          </div>
        ) : (
          <>
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
          </>
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

Object.assign(window, { AgentDetail, FilterButton, FiltersPopover, EVENT_TYPES });
