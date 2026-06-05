import * as React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

import { FormField } from '@/components/FormField';
import { Modal } from '@/components/Modal';
import { ModalSelectionRow } from '@/components/ModalSelectionRow';
import { Stepper } from '@/components/Stepper';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import type { Project } from '../data/types.js';

/**
 * CREW-218 (Task T6): the "+ New Run" stepper modal. Walks
 * `1 · Project → 2 · Ticket → 3 · Confirm`; the Confirm step is the
 * confirm guard from the spec's security decision — nothing enqueues until
 * the operator reaches it and clicks "Spawn agent". Presentational: it owns
 * only the wizard's step/selection state and calls `onConfirm`; the App owns
 * the enqueue mutation (`useEnqueueAction`).
 *
 * Step 2 is a ticket-key text entry rather than a live open-ticket picker —
 * no daemon endpoint serves open Jira tickets in v1 (see the plan's T6 step 2
 * and `docs/tickets/CREW-218.md`).
 */

const STEPS = ['Project', 'Ticket', 'Confirm'];

export interface NewRunConfirm {
  project: string;
  ticketKey: string;
}

interface NewRunModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: Project[];
  onConfirm: (run: NewRunConfirm) => void;
}

export function NewRunModal({ open, onOpenChange, projects, onConfirm }: NewRunModalProps) {
  const [step, setStep] = React.useState(1);
  const [project, setProject] = React.useState<Project | null>(null);
  const [ticketKey, setTicketKey] = React.useState('');

  // Reset the wizard each time it opens so a re-triggered "+ New Run" always
  // starts on the project step.
  React.useEffect(() => {
    if (open) {
      setStep(1);
      setProject(null);
      setTicketKey('');
    }
  }, [open]);

  const trimmedKey = ticketKey.trim();
  const canAdvanceTicket = trimmedKey.length > 0;

  function selectProject(p: Project) {
    setProject(p);
    setStep(2);
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
            <p className="text-sm font-medium text-foreground">
              Pick a ticket{' '}
              <span className="font-mono text-xs text-muted-foreground">· {project.jiraKey}</span>
            </p>
            <FormField
              label="Ticket key"
              placeholder={`${project.jiraKey}-123`}
              value={ticketKey}
              autoFocus
              onChange={(e) => setTicketKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canAdvanceTicket) setStep(3);
              }}
            />
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
              <Button
                color="white"
                intensity="loud"
                size="sm"
                disabled={!canAdvanceTicket}
                onClick={() => setStep(3)}
              >
                Next
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && project && (
          <div className="flex flex-col gap-3">
            <p className="text-sm font-medium text-foreground">Confirm</p>
            <dl className="flex flex-col gap-2 rounded-md border border-border bg-card p-3">
              <SummaryRow label="Project" value={project.name} />
              <SummaryRow label="Ticket" value={trimmedKey} mono />
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
