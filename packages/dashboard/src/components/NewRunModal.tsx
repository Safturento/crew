import * as React from 'react';
import { ArrowLeft, ArrowRight, Search } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

import { FormField } from '@/components/FormField';
import { Modal } from '@/components/Modal';
import { ModalSelectionRow } from '@/components/ModalSelectionRow';
import { Stepper } from '@/components/Stepper';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { PillColor } from '@/lib/pill-variants';

import type { DaemonClient } from '../data/DaemonClient.js';
import type { Project } from '../data/types.js';
import type { PickerTicket, ProjectTicketsResponse } from 'crew-shared';

/**
 * CREW-279: the "+ New Run" stepper modal, now with a live Jira ticket picker
 * on step 2. Walks `1 · Project → 2 · Ticket → 3 · Confirm`; the Confirm step
 * is the confirm guard from the spec's security decision — nothing enqueues
 * until the operator reaches it and clicks "Spawn agent". Presentational: it
 * owns only the wizard's step/selection state + the two read queries
 * (`project-tickets`, `project-detail`) and calls `onConfirm`; the App owns the
 * enqueue mutation.
 *
 * Step 2 fetches the project's Ready-for-Development tickets, grouped by epic
 * with a runnable/blocked + active-agent overlay. When that list is unavailable
 * (`available: false` — no daemon Jira creds / Jira unreachable — or the fetch
 * errors) it degrades to the original manual ticket-key field.
 */

const STEPS = ['Project', 'Ticket', 'Confirm'];

/**
 * Jira priority → the state-pill color that reads it at a glance (Figma 362:2212).
 * Keyed on Jira's standard priority-scheme names (the CREW board's scheme). A
 * priority outside this set (custom schemes — `P1`, etc.) falls back to a neutral
 * `idle` badge that still shows the raw label — see the lookup in `TicketList`.
 */
const PRIORITY_COLOR: Record<string, PillColor> = {
  Highest: 'error',
  High: 'error',
  Medium: 'waiting',
  Low: 'initializing',
  Lowest: 'initializing',
};

export interface NewRunConfirm {
  project: string;
  ticketKey: string;
}

interface NewRunModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  onConfirm: (run: NewRunConfirm) => void;
  client: DaemonClient;
}

export function NewRunModal({ open, onOpenChange, projects, onConfirm, client }: NewRunModalProps) {
  const [step, setStep] = React.useState(1);
  const [project, setProject] = React.useState<Project | null>(null);
  const [ticketKey, setTicketKey] = React.useState('');
  const [ticketTitle, setTicketTitle] = React.useState('');
  const [filter, setFilter] = React.useState('');
  const [availableOnly, setAvailableOnly] = React.useState(false);

  // Reset the wizard each time it opens so a re-triggered "+ New Run" always
  // starts on the project step.
  React.useEffect(() => {
    if (open) {
      setStep(1);
      setProject(null);
      setTicketKey('');
      setTicketTitle('');
      setFilter('');
      setAvailableOnly(false);
    }
  }, [open]);

  // Empty when no project is selected; the `enabled` guards keep the queries
  // from running until a project exists, so the empty slug is never fetched.
  const slug = project?.name ?? '';
  const queriesEnabled = open && step === 2 && slug !== '';

  const ticketsQuery = useQuery({
    queryKey: ['project-tickets', slug],
    queryFn: () => client.listProjectTickets(slug),
    enabled: queriesEnabled,
    // Opt out of the app-wide `throwOnError` + retry defaults: a fetch failure
    // here must degrade the modal to manual ticket-key entry (`isError` below),
    // not bubble to the global error boundary or retry-spin behind a spinner.
    throwOnError: false,
    retry: false,
  });

  // Project detail supplies the Jira `site` for the epic-key link's browse base.
  // Best-effort: a failure just leaves the epic key as plain (unlinked) text, so
  // it must never throw to the error boundary either.
  const detailQuery = useQuery({
    queryKey: ['project-detail', slug],
    queryFn: () => client.getProject(slug),
    enabled: queriesEnabled,
    throwOnError: false,
    retry: false,
  });
  const jiraBrowseBase = detailQuery.data?.project.jira.site
    ? `${detailQuery.data.project.jira.site.replace(/\/$/, '')}/browse`
    : null;

  const trimmedKey = ticketKey.trim();
  const canAdvanceTicket = trimmedKey.length > 0;
  const degraded = ticketsQuery.isError || (!!ticketsQuery.data && !ticketsQuery.data.available);

  function selectProject(p: Project) {
    setProject(p);
    setStep(2);
  }
  function selectTicket(t: PickerTicket) {
    setTicketKey(t.key);
    setTicketTitle(t.summary);
    setStep(3);
  }
  function advanceManual() {
    if (!canAdvanceTicket) return;
    setTicketTitle('');
    setStep(3);
  }
  function confirm() {
    if (!project || !canAdvanceTicket) return;
    onConfirm({ project: project.name, ticketKey: trimmedKey });
    onOpenChange(false);
  }

  return (
    <Modal title="New Run" open={open} onOpenChange={onOpenChange}>
      <div className="flex flex-col gap-4">
        <Stepper steps={STEPS} current={step} />

        {step === 1 && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-foreground">Pick a project</p>
            <div className="flex flex-col gap-2">
              {projects.map((p) => (
                <ModalSelectionRow
                  key={p.name}
                  primary={p.name}
                  secondary={p.repoPath}
                  meta={p.jiraKey}
                  badge={
                    <Badge color="finished" intensity="mid">
                      {p.activeCount} active
                    </Badge>
                  }
                  onClick={() => selectProject(p)}
                />
              ))}
            </div>
          </div>
        )}

        {step === 2 && project && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium text-foreground">
                Pick a ticket{' '}
                <span className="font-mono text-xs text-muted-foreground">· {project.jiraKey}</span>
              </p>
              {!degraded && (
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Switch checked={availableOnly} onCheckedChange={setAvailableOnly} />
                  Available only
                </label>
              )}
            </div>

            {degraded ? (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">
                  Live ticket list unavailable — enter a ticket key.
                </p>
                <FormField
                  label="Ticket key"
                  placeholder={`${project.jiraKey}-123`}
                  value={ticketKey}
                  autoFocus
                  onChange={(e) => setTicketKey(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') advanceManual();
                  }}
                />
              </div>
            ) : (
              <>
                <Input
                  leadingIcon={<Search />}
                  placeholder="Filter open tickets…"
                  value={filter}
                  autoFocus
                  onChange={(e) => setFilter(e.target.value)}
                />
                <TicketList
                  data={ticketsQuery.data}
                  loading={ticketsQuery.isLoading}
                  filter={filter}
                  availableOnly={availableOnly}
                  jiraBrowseBase={jiraBrowseBase}
                  onSelect={selectTicket}
                />
              </>
            )}

            <div className="flex items-center justify-between">
              <Button
                color="running"
                intensity="mid"
                size="sm"
                icon={<ArrowLeft aria-hidden />}
                onClick={() => setStep(1)}
              >
                Back
              </Button>
              {degraded && (
                <Button
                  color="white"
                  intensity="loud"
                  size="sm"
                  disabled={!canAdvanceTicket}
                  onClick={advanceManual}
                >
                  Next
                  <ArrowRight aria-hidden />
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 3 && project && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-foreground">Confirm</p>
            <dl className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
              <SummaryRow label="Project" value={project.name} />
              <SummaryRow label="Ticket" value={trimmedKey} mono />
              {ticketTitle && <SummaryRow label="Title" value={ticketTitle} />}
              <SummaryRow
                label="Worktree"
                value={`${project.repoPath}/.worktrees/${trimmedKey}`}
                mono
              />
              <SummaryRow label="Command" value={`crew run ${trimmedKey}`} mono />
            </dl>
            <div className="flex items-center justify-between">
              <Button
                color="running"
                intensity="mid"
                size="sm"
                icon={<ArrowLeft aria-hidden />}
                onClick={() => setStep(2)}
              >
                Back
              </Button>
              <Button color="white" intensity="loud" size="sm" onClick={confirm}>
                Spawn agent
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function TicketList({
  data,
  loading,
  filter,
  availableOnly,
  jiraBrowseBase,
  onSelect,
}: {
  data: ProjectTicketsResponse | undefined;
  loading: boolean;
  filter: string;
  availableOnly: boolean;
  jiraBrowseBase: string | null;
  onSelect: (t: PickerTicket) => void;
}) {
  if (loading) return <p className="text-xs text-muted-foreground">Loading tickets…</p>;
  if (!data || !data.available) return null;
  const q = filter.trim().toLowerCase();

  const groups = data.groups
    .map((g) => ({
      ...g,
      tickets: g.tickets.filter((t) => {
        // "Available only" hides anything not selectable (blocked or in-flight).
        if (availableOnly && (!t.runnable || t.hasActiveAgent)) return false;
        if (!q) return true;
        return t.key.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q);
      }),
    }))
    .filter((g) => g.tickets.length > 0);

  if (groups.length === 0)
    return <p className="text-xs text-muted-foreground">No tickets match.</p>;

  return (
    <div className="flex max-h-72 flex-col gap-3.5 overflow-y-auto">
      {groups.map((g) => (
        <div key={g.epicKey ?? '__ungrouped__'} className="flex flex-col gap-1">
          {/* Epic header: key-prefixed, uppercase muted; the KEY links to the Jira
              ticket when a browse base is known (from the project-detail endpoint).
              Parent-less group → "Ungrouped". */}
          <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
            {g.epicKey ? (
              <>
                {jiraBrowseBase ? (
                  <a
                    href={`${jiraBrowseBase}/${g.epicKey}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-400 underline underline-offset-2"
                  >
                    {g.epicKey}
                  </a>
                ) : (
                  <span className="text-blue-400">{g.epicKey}</span>
                )}{' '}
                · {g.epicSummary}
              </>
            ) : (
              'Ungrouped'
            )}
          </p>
          {g.tickets.map((t) => {
            const disabled = !t.runnable || t.hasActiveAgent;
            return (
              // Row anatomy (Figma NewRunStep2Content): primary=KEY, secondary=summary,
              // meta=blocker hint (blocked rows only, inline before the badge). `disabled`
              // dims (opacity-50) + blocks selection, covering blocked + in-flight rows.
              // In-flight swaps the badge to the running state badge; otherwise the badge
              // is the priority, colored to read at a glance.
              <ModalSelectionRow
                key={t.key}
                primary={t.key}
                secondary={t.summary}
                meta={
                  !t.runnable ? `blocked by ${t.blockedBy.map((b) => b.key).join(', ')}` : undefined
                }
                badge={
                  t.hasActiveAgent ? (
                    <Badge color="running" intensity="mid">
                      running
                    </Badge>
                  ) : t.priority ? (
                    <Badge color={PRIORITY_COLOR[t.priority] ?? 'idle'} intensity="mid">
                      {t.priority}
                    </Badge>
                  ) : undefined
                }
                disabled={disabled}
                onClick={disabled ? undefined : () => onSelect(t)}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[11px] text-muted-foreground uppercase">{label}</dt>
      <dd
        className={
          mono ? 'truncate font-mono text-xs text-foreground' : 'truncate text-sm text-foreground'
        }
      >
        {value}
      </dd>
    </div>
  );
}
