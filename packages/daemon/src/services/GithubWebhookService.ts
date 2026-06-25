import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Logger } from 'pino';
import type { ProjectsService } from './ProjectsService.js';
import type { PrTransitionService } from './PrTransitionService.js';

export interface WebhookResult {
  status: number;
  body?: unknown;
}

export interface GithubWebhookDeps {
  projectsService: ProjectsService;
  secrets: Map<string, string>;
  prTransitions: PrTransitionService;
  logger: Logger;
}

interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody: Buffer;
}

function header(headers: WebhookRequest['headers'], name: string): string | undefined {
  const v = headers[name];
  return Array.isArray(v) ? v[0] : v;
}

/** Constant-time compare of the X-Hub-Signature-256 header against the body. */
function signatureValid(rawBody: Buffer, secret: string, sig: string | undefined): boolean {
  if (!sig) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Verifies + dispatches a GitHub webhook delivery for PR-merge detection.
 * Verification order (cheapest/most-decisive first): event filter → repo
 * resolve → HMAC (per-repo secret) → hook-id pin → event handling. HMAC +
 * hook-id are the identity boundary; together they reject any other GitHub
 * webhook on the internet pointed at the path-scoped Funnel URL. A valid
 * delivery with nothing to do (ping, non-closed action, no matching pr_open
 * agent) returns 200 so GitHub does not retry.
 *
 * Secrets and signatures never enter a log line — only `repository.full_name`
 * and the failing check name on rejection.
 */
export class GithubWebhookService {
  private readonly projects: ProjectsService;
  private readonly secrets: Map<string, string>;
  private readonly prTransitions: PrTransitionService;
  private readonly logger: Logger;

  constructor(deps: GithubWebhookDeps) {
    this.projects = deps.projectsService;
    this.secrets = deps.secrets;
    this.prTransitions = deps.prTransitions;
    this.logger = deps.logger;
  }

  async handle(req: WebhookRequest): Promise<WebhookResult> {
    const event = header(req.headers, 'x-github-event');
    if (event !== 'pull_request' && event !== 'ping') return { status: 204 };

    let payload: {
      action?: string;
      pull_request?: { html_url?: string };
      repository?: { full_name?: string };
    };
    try {
      payload = JSON.parse(req.rawBody.toString('utf8'));
    } catch {
      return { status: 400, body: { error: 'invalid_json' } };
    }

    const repo = payload.repository?.full_name;
    if (!repo) return { status: 400, body: { error: 'missing_repository' } };

    const project = this.projects.findByRepo(repo);
    if (!project) {
      this.logger.warn({ repo }, 'webhook: unknown repo');
      return { status: 404, body: { error: 'unknown_repo' } };
    }

    const secret = this.secrets.get(repo.toLowerCase());
    if (!secret) {
      this.logger.warn({ repo }, 'webhook: no configured secret for repo');
      return { status: 401, body: { error: 'unauthorized' } };
    }
    if (!signatureValid(req.rawBody, secret, header(req.headers, 'x-hub-signature-256'))) {
      this.logger.warn({ repo, check: 'hmac' }, 'webhook: signature verification failed');
      return { status: 401, body: { error: 'unauthorized' } };
    }

    const expectedHookId = project.github.webhook_hook_id;
    const gotHookId = header(req.headers, 'x-github-hook-id');
    if (!expectedHookId || gotHookId !== expectedHookId) {
      this.logger.warn({ repo, check: 'hook_id' }, 'webhook: hook-id pin mismatch');
      return { status: 401, body: { error: 'unauthorized' } };
    }

    if (event === 'ping') return { status: 200, body: { ok: true } };

    if (payload.action !== 'closed') return { status: 200, body: { ignored: payload.action } };

    const prUrl = payload.pull_request?.html_url;
    if (!prUrl) return { status: 200, body: { ignored: 'no_html_url' } };

    const agentKey = await this.prTransitions.resolveOpenPrAgentByUrl(prUrl);
    if (!agentKey) {
      this.logger.info({ repo, prUrl }, 'webhook: no pr_open agent for delivery (no-op)');
      return { status: 200, body: { matched: false } };
    }
    const { changed } = await this.prTransitions.markMerged(agentKey, { source: 'webhook' });
    return { status: 200, body: { matched: true, changed } };
  }
}
