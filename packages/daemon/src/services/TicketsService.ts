import type { Logger } from 'pino';
import {
  JiraClient,
  type JiraIssue,
  type ProjectConfig,
  type ProjectTicketsResponse,
  type TicketGroup,
  type PickerTicket,
} from 'crew-shared';
import type { AgentsService } from './AgentsService.js';

const SEARCH_FIELDS = ['summary', 'status', 'parent', 'issuetype', 'priority', 'issuelinks'];
const UNGROUPED = '__ungrouped__';

export interface TicketsServiceDeps {
  jiraEmail: string;
  jiraToken: string;
  agentsService: Pick<AgentsService, 'activeTicketKeys'>;
  logger: Logger;
}

/**
 * Serves the New Run picker: the project's Ready-for-Development tickets,
 * grouped by parent Epic, each classified runnable-vs-blocked from its
 * `is blocked by` links, with an overlay of which already have a live agent.
 * One Jira search call suffices — blockers' statuses come back inline on
 * `issuelinks[].inwardIssue.fields.status`. Degrades (200 + available:false)
 * when creds are missing or Jira is unreachable.
 */
export class TicketsService {
  constructor(private readonly deps: TicketsServiceDeps) {}

  /** Overridable seam for tests. */
  protected makeClient(site: string): Pick<JiraClient, 'searchIssues'> {
    return new JiraClient({ site, email: this.deps.jiraEmail, token: this.deps.jiraToken });
  }

  async listProjectTickets(project: ProjectConfig): Promise<ProjectTicketsResponse> {
    if (!this.deps.jiraEmail || !this.deps.jiraToken) {
      return { available: false, reason: 'no_credentials' };
    }

    const jql = `project = "${project.jira.project_key}" AND status = "${project.jira.ready_status}" ORDER BY created ASC`;
    let issues: JiraIssue[];
    try {
      issues = await this.makeClient(project.jira.site).searchIssues(jql, SEARCH_FIELDS);
    } catch (err) {
      this.deps.logger.warn({ err, project: project.name }, 'New Run ticket search failed');
      return { available: false, reason: 'jira_unreachable' };
    }

    const activeKeys = await this.deps.agentsService.activeTicketKeys(project.name);

    const groups = new Map<string, TicketGroup>();
    const order: string[] = [];
    for (const issue of issues) {
      const ticket = toPickerTicket(issue, activeKeys);
      const epicKey = issue.fields.parent?.key ?? null;
      const groupId = epicKey ?? UNGROUPED;
      let group = groups.get(groupId);
      if (!group) {
        group = {
          epicKey,
          epicSummary: issue.fields.parent?.fields?.summary ?? null,
          tickets: [],
        };
        groups.set(groupId, group);
        order.push(groupId);
      }
      group.tickets.push(ticket);
    }

    return { available: true, groups: order.map((id) => groups.get(id)!) };
  }
}

function toPickerTicket(issue: JiraIssue, activeKeys: Set<string>): PickerTicket {
  const blockedBy = (issue.fields.issuelinks ?? [])
    .filter((l) => l.type?.inward === 'is blocked by' && l.inwardIssue)
    .map((l) => l.inwardIssue!)
    .filter((b) => b.fields?.status?.statusCategory?.key !== 'done')
    .map((b) => ({ key: b.key, summary: b.fields?.summary ?? '' }));

  return {
    key: issue.key,
    summary: issue.fields.summary ?? '',
    priority: issue.fields.priority?.name ?? null,
    runnable: blockedBy.length === 0,
    blockedBy,
    hasActiveAgent: activeKeys.has(issue.key),
  };
}
