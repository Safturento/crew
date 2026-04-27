// New Run modal — pick project → pick ticket → confirm.

function NewRunModal({ onClose, onConfirm }) {
  const [step, setStep] = React.useState(1);
  const [project, setProject] = React.useState(null);
  const [ticket, setTicket] = React.useState(null);
  const [filter, setFilter] = React.useState('');

  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const tickets = project ? (MOCK_TICKETS[project.jira_project_key] || []) : [];
  const filtered = tickets.filter(t =>
    !filter || t.key.toLowerCase().includes(filter.toLowerCase()) ||
    t.title.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <header className="modal__hd">
          <div className="modal__steps">
            <span className={`modal__step ${step >= 1 ? 'on' : ''}`}>1 · Project</span>
            <span className="modal__step-sep">›</span>
            <span className={`modal__step ${step >= 2 ? 'on' : ''}`}>2 · Ticket</span>
            <span className="modal__step-sep">›</span>
            <span className={`modal__step ${step >= 3 ? 'on' : ''}`}>3 · Confirm</span>
          </div>
          <button className="icon-btn" onClick={onClose}><Icon.Close /></button>
        </header>

        {step === 1 && (
          <div className="modal__body">
            <h2 className="modal__title">Pick a project</h2>
            <div className="modal__list">
              {MOCK_PROJECTS.map(p => (
                <button key={p.name} className="modal__list-item" onClick={() => { setProject(p); setStep(2); }}>
                  <div className="modal__list-main">
                    <span className="mono">{p.name}</span>
                    <span className="dim mono">{p.repo_path}</span>
                  </div>
                  <div className="modal__list-meta">
                    <span className="dim mono">{p.jira_project_key}</span>
                    {p.activeRuns > 0 && <span className="badge-sm">{p.activeRuns} active</span>}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="modal__body">
            <h2 className="modal__title">
              Pick a ticket <span className="dim mono">· {project.jira_project_key}</span>
            </h2>
            <div className="modal__search">
              <Icon.Search />
              <input autoFocus placeholder="Filter open tickets…" value={filter} onChange={e => setFilter(e.target.value)} />
            </div>
            <div className="modal__list modal__list--scroll">
              {filtered.map(t => (
                <button key={t.key} className="modal__list-item" onClick={() => { setTicket(t); setStep(3); }}>
                  <div className="modal__list-main">
                    <span className="mono ticket-key">{t.key}</span>
                    <span>{t.title}</span>
                  </div>
                  <div className="modal__list-meta">
                    <span className={`prio prio--${t.priority.toLowerCase()}`}>{t.priority}</span>
                  </div>
                </button>
              ))}
              {filtered.length === 0 && <div className="empty-row">No matching tickets</div>}
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={() => setStep(1)}>← Back</button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="modal__body">
            <h2 className="modal__title">Confirm</h2>
            <div className="confirm">
              <div className="confirm__row">
                <span className="dim">Project</span>
                <span className="mono">{project.name}</span>
              </div>
              <div className="confirm__row">
                <span className="dim">Ticket</span>
                <span className="mono">{ticket.key}</span>
              </div>
              <div className="confirm__row">
                <span className="dim">Title</span>
                <span>{ticket.title}</span>
              </div>
              <div className="confirm__row">
                <span className="dim">Worktree</span>
                <span className="mono">{project.repo_path}/.worktrees/{ticket.key}</span>
              </div>
              <div className="confirm__row">
                <span className="dim">Command</span>
                <span className="mono">crew run {ticket.key}</span>
              </div>
            </div>
            <div className="modal__footer">
              <button className="btn btn--ghost" onClick={() => setStep(2)}>← Back</button>
              <button className="btn btn--accent" onClick={() => onConfirm(project, ticket)}>
                Spawn agent →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

window.NewRunModal = NewRunModal;
