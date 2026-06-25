import { describe, it, expect, vi } from 'vitest';
import pino from 'pino';
import { GithubWebhookService } from './GithubWebhookService.js';
import { pullRequestClosedPayload, pingPayload, signPayload } from './github/webhook-fixtures.js';

const SECRET = 'top-secret';
const HOOK_ID = '999';
const REPO = 'Owner/repo';

function makeService(
  over: Partial<{ markMerged: any; resolve: any; hookId: string | null; secret: string }> = {},
) {
  const markMerged = over.markMerged ?? vi.fn().mockResolvedValue({ changed: true });
  const resolveOpenPrAgentByUrl = over.resolve ?? vi.fn().mockResolvedValue('CREW-1');
  const projectsService = {
    findByRepo: vi.fn().mockReturnValue(
      over.hookId === null
        ? { github: { repo: REPO } }
        : { github: { repo: REPO, webhook_hook_id: over.hookId ?? HOOK_ID } },
    ),
  };
  const secrets = new Map<string, string>([[REPO.toLowerCase(), over.secret ?? SECRET]]);
  const svc = new GithubWebhookService({
    projectsService: projectsService as any,
    secrets,
    prTransitions: { markMerged, resolveOpenPrAgentByUrl } as any,
    logger: pino({ level: 'silent' }),
  });
  return { svc, markMerged, resolveOpenPrAgentByUrl, projectsService };
}

function rawOf(payload: object): Buffer {
  return Buffer.from(JSON.stringify(payload));
}
const hdr = (event: string, sig: string, hookId = HOOK_ID) => ({
  'x-github-event': event,
  'x-github-hook-id': hookId,
  'x-hub-signature-256': sig,
  'content-type': 'application/json',
});

describe('GithubWebhookService.handle', () => {
  it('204s a non-pull_request, non-ping event', async () => {
    const { svc } = makeService();
    const r = await svc.handle({ headers: { 'x-github-event': 'push' }, rawBody: rawOf({}) });
    expect(r.status).toBe(204);
  });

  it('404s an unknown repo', async () => {
    const { svc, projectsService } = makeService();
    projectsService.findByRepo.mockReturnValue(null);
    const raw = rawOf(pullRequestClosedPayload({ repo: 'who/what' }));
    const r = await svc.handle({ headers: hdr('pull_request', signPayload(raw, SECRET)), rawBody: raw });
    expect(r.status).toBe(404);
  });

  it('401s on a bad signature', async () => {
    const { svc, markMerged } = makeService();
    const raw = rawOf(pullRequestClosedPayload({ repo: REPO }));
    const r = await svc.handle({ headers: hdr('pull_request', 'sha256=deadbeef'), rawBody: raw });
    expect(r.status).toBe(401);
    expect(markMerged).not.toHaveBeenCalled();
  });

  it('401s on a hook-id mismatch even with a valid signature', async () => {
    const { svc } = makeService();
    const raw = rawOf(pullRequestClosedPayload({ repo: REPO }));
    const r = await svc.handle({
      headers: hdr('pull_request', signPayload(raw, SECRET), 'WRONG'),
      rawBody: raw,
    });
    expect(r.status).toBe(401);
  });

  it('401s when the configured project has no webhook_hook_id', async () => {
    const { svc } = makeService({ hookId: null });
    const raw = rawOf(pullRequestClosedPayload({ repo: REPO }));
    const r = await svc.handle({ headers: hdr('pull_request', signPayload(raw, SECRET)), rawBody: raw });
    expect(r.status).toBe(401);
  });

  it('200s a verified ping without changing state', async () => {
    const { svc, markMerged } = makeService();
    const raw = rawOf(pingPayload({ repo: REPO }));
    const r = await svc.handle({ headers: hdr('ping', signPayload(raw, SECRET)), rawBody: raw });
    expect(r.status).toBe(200);
    expect(markMerged).not.toHaveBeenCalled();
  });

  it('200s + no-ops a verified pull_request whose action is not closed', async () => {
    const { svc, markMerged } = makeService();
    const raw = rawOf(pullRequestClosedPayload({ repo: REPO, action: 'synchronize' }));
    const r = await svc.handle({ headers: hdr('pull_request', signPayload(raw, SECRET)), rawBody: raw });
    expect(r.status).toBe(200);
    expect(markMerged).not.toHaveBeenCalled();
  });

  it('200s + no-ops a verified closed PR with no matching pr_open agent', async () => {
    const { svc, markMerged } = makeService({ resolve: vi.fn().mockResolvedValue(null) });
    const raw = rawOf(pullRequestClosedPayload({ repo: REPO }));
    const r = await svc.handle({ headers: hdr('pull_request', signPayload(raw, SECRET)), rawBody: raw });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ matched: false });
    expect(markMerged).not.toHaveBeenCalled();
  });

  it('calls markMerged (source: webhook) for a verified closed PR matching a pr_open agent', async () => {
    const { svc, markMerged, resolveOpenPrAgentByUrl } = makeService();
    const raw = rawOf(
      pullRequestClosedPayload({ repo: REPO, htmlUrl: `https://github.com/${REPO}/pull/7` }),
    );
    const r = await svc.handle({ headers: hdr('pull_request', signPayload(raw, SECRET)), rawBody: raw });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ matched: true, changed: true });
    expect(resolveOpenPrAgentByUrl).toHaveBeenCalledWith(`https://github.com/${REPO}/pull/7`);
    expect(markMerged).toHaveBeenCalledWith('CREW-1', { source: 'webhook' });
  });

  it('401s when the repo has no configured secret', async () => {
    const svc = new GithubWebhookService({
      projectsService: {
        findByRepo: () => ({ github: { repo: REPO, webhook_hook_id: HOOK_ID } }),
      } as any,
      secrets: new Map(), // no secret for this repo
      prTransitions: { markMerged: vi.fn(), resolveOpenPrAgentByUrl: vi.fn() } as any,
      logger: pino({ level: 'silent' }),
    });
    const raw = rawOf(pullRequestClosedPayload({ repo: REPO }));
    const r = await svc.handle({ headers: hdr('pull_request', signPayload(raw, SECRET)), rawBody: raw });
    expect(r.status).toBe(401);
  });
});
