import { Command } from 'commander';
import pc from 'picocolors';
import {
  type AgentSummary,
  type CrewDaemonClient,
  crewDaemonClientFromEnv,
  discoverProjectConfig,
  fetchTicketSummary,
  type ProjectConfig,
} from '../lib/index.js';
import { readJiraSecrets } from './finish.js';

export interface BackfillTitlesDeps {
  config: ProjectConfig;
  daemonClient: CrewDaemonClient;
  jiraSecrets: { email: string; token: string } | null;
  log: (msg: string) => void;
  warn: (msg: string) => void;
}

export interface BackfillTitlesResult {
  ok: boolean;
  reason?: string;
  attempted: number;
  filled: number;
  skipped: number;
  failed: number;
}

/**
 * Walk every agent the daemon knows about, find the ones whose `ticketTitle`
 * is empty AND whose `projectName` matches the current project config
 * (the project's Jira instance is what we can authenticate against), fetch
 * each Jira summary, and PATCH the daemon. Idempotent — agents whose title
 * is already populated are skipped without a Jira call.
 */
export async function runBackfillTitles(deps: BackfillTitlesDeps): Promise<BackfillTitlesResult> {
  if (!deps.jiraSecrets) {
    return {
      ok: false,
      reason:
        'CREW_JIRA_EMAIL / CREW_JIRA_API_TOKEN not set — backfill needs Jira credentials',
      attempted: 0,
      filled: 0,
      skipped: 0,
      failed: 0,
    };
  }

  const list = await deps.daemonClient.listAgents();
  if (!('agents' in list)) {
    return {
      ok: false,
      reason: `daemon listAgents failed: ${list.reason}`,
      attempted: 0,
      filled: 0,
      skipped: 0,
      failed: 0,
    };
  }

  const projectName = deps.config.name;
  const candidates = list.agents.filter(
    (a: AgentSummary) => a.projectName === projectName && a.ticketTitle === '',
  );
  const skippedNonProject = list.agents.length - list.agents.filter((a) => a.projectName === projectName).length;
  const skippedAlreadyFilled = list.agents.length - candidates.length - skippedNonProject;

  deps.log(
    `found ${candidates.length} agent(s) needing a title in project '${projectName}' ` +
      `(skipping ${skippedAlreadyFilled} already-filled, ${skippedNonProject} from other projects)`,
  );

  let filled = 0;
  let failed = 0;
  for (const agent of candidates) {
    const title = await fetchTicketSummary({
      key: agent.key,
      jiraSite: deps.config.jira.site,
      email: deps.jiraSecrets.email,
      token: deps.jiraSecrets.token,
      warn: deps.warn,
    });
    if (title === '') {
      // fetchTicketSummary already warned about the reason.
      failed++;
      continue;
    }
    const result = await deps.daemonClient.updateTicketTitle(agent.key, title);
    if ('ok' in result && result.ok) {
      deps.log(`${agent.key} ← ${title}`);
      filled++;
    } else {
      deps.warn(
        `update ${agent.key}: ${('reason' in result ? result.reason : 'unknown')}`,
      );
      failed++;
    }
  }

  return {
    ok: true,
    attempted: candidates.length,
    filled,
    skipped: skippedAlreadyFilled + skippedNonProject,
    failed,
  };
}

export const backfillTitlesCommand = new Command('backfill-titles')
  .description(
    "fetch Jira summaries and fill missing ticket_title values on daemon-tracked agents in the current project",
  )
  .action(async () => {
    const cwd = process.cwd();
    const config = await discoverProjectConfig(cwd);
    if (!config) {
      console.error(pc.red('✗'), `no crew project config matches ${cwd}`);
      process.exit(1);
    }
    const result = await runBackfillTitles({
      config,
      daemonClient: crewDaemonClientFromEnv(process.env),
      jiraSecrets: readJiraSecrets(process.env),
      log: (msg) => console.log(pc.green('✓'), msg),
      warn: (msg) => console.log(pc.yellow('!'), msg),
    });
    if (!result.ok) {
      console.error(pc.red('✗'), result.reason ?? 'backfill failed');
      process.exit(1);
    }
    console.log(
      pc.green('✓'),
      `backfill done: ${result.filled} filled, ${result.failed} failed, ${result.skipped} skipped`,
    );
  });
