import { test, expect, type Page, type Request } from '@playwright/test';

type Injector = (name: string, data: unknown) => void;

/**
 * Supervisor Stop/Restart controls (CREW-293). The SupervisorCard's lifecycle
 * buttons enqueue queue-level `runner_commands` (null agentKey) the host worker
 * drains to stop or respawn the runner; cold Start can't be enqueued (nothing
 * drains the queue once the supervisor is down) so it shows a `crew runner
 * start` CLI hint instead. The worktree stack has no host runner, so we drive
 * the supervisor's online/offline state through the same SSE dispatcher real
 * status edges use (`__crewTestInjectEvent`).
 */
test.describe('Supervisor controls (CREW-293)', () => {
  async function setOnline(page: Page, online: boolean): Promise<void> {
    await page.evaluate((isOnline) => {
      (window as unknown as { __crewTestInjectEvent: Injector }).__crewTestInjectEvent(
        'runner.status_changed',
        { online: isOnline, lastSeen: Date.now() },
      );
    }, online);
  }

  test('Stop enqueues a supervisor_stop command when the supervisor is online', async ({
    page,
  }) => {
    await page.goto('/#/runner');
    await expect(page.getByRole('heading', { name: 'Runner' })).toBeVisible();
    await setOnline(page, true);

    await expect(page.getByRole('button', { name: 'Stop' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Restart' })).toBeEnabled();

    const [request] = await Promise.all([
      page.waitForRequest(
        (req: Request) => req.url().includes('/api/runner/commands') && req.method() === 'POST',
      ),
      page.getByRole('button', { name: 'Stop' }).click(),
    ]);
    expect(JSON.parse(request.postData() ?? '{}')).toMatchObject({
      agentKey: null,
      kind: 'supervisor_stop',
    });
  });

  test('Restart enqueues a supervisor_restart command when online', async ({ page }) => {
    await page.goto('/#/runner');
    await expect(page.getByRole('heading', { name: 'Runner' })).toBeVisible();
    await setOnline(page, true);

    const [request] = await Promise.all([
      page.waitForRequest(
        (req: Request) => req.url().includes('/api/runner/commands') && req.method() === 'POST',
      ),
      page.getByRole('button', { name: 'Restart' }).click(),
    ]);
    expect(JSON.parse(request.postData() ?? '{}')).toMatchObject({
      agentKey: null,
      kind: 'supervisor_restart',
    });
  });

  test('cold Start shows the CLI hint and enqueues nothing when offline', async ({ page }) => {
    await page.goto('/#/runner');
    await expect(page.getByRole('heading', { name: 'Runner' })).toBeVisible();
    // Force offline (a prior heartbeat may still read online within the staleness window).
    await setOnline(page, false);

    let enqueued = false;
    page.on('request', (req) => {
      if (req.url().includes('/api/runner/commands') && req.method() === 'POST') enqueued = true;
    });

    const start = page.getByRole('button', { name: 'Start' });
    await expect(start).toBeEnabled();
    await start.click();

    await expect(page.getByText('crew runner start')).toBeVisible();
    expect(enqueued).toBe(false);
  });
});
