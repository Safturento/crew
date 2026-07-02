import { test, expect, type Page, type Request } from '@playwright/test';

type Injector = (name: string, data: unknown) => void;

/**
 * Supervisor Stop/Restart/Start controls (CREW-293 / CREW-312). The controls
 * live in the supervisor drawer — opened from the header runner chip now that
 * the standalone Runner page is retired. Online → Restart + Stop enqueue
 * queue-level `runner_commands` (null agentKey) the host worker drains to stop
 * or respawn the runner; cold Start can't be enqueued (nothing drains the
 * queue once the supervisor is down) so it shows a `crew runner start` CLI hint
 * instead. The worktree stack has no host runner, so we drive the supervisor's
 * online/offline state through the same SSE dispatcher real status edges use
 * (`__crewTestInjectEvent`), and mock the command POST so no real runner
 * command is persisted.
 */
test.describe('Supervisor controls (CREW-293 / CREW-312)', () => {
  test.beforeEach(async ({ page }) => {
    // Empty log + reconcile so the drawer's non-control sections are
    // deterministic and don't depend on host-runner history.
    await page.route('**/api/runner/supervisor-log*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ lines: [] }),
      });
    });
    await page.route('**/api/runner/reconcile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ queued: [], orphaned: [] }),
      });
    });
    // Intercept the command enqueue so the assertions observe the request
    // without mutating the worktree daemon's `runner_commands`.
    await page.route('**/api/runner/commands', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          agentKey: null,
          kind: 'reap',
          payload: null,
          status: 'pending',
          error: null,
          createdAt: '2026-07-02T00:00:00Z',
          updatedAt: '2026-07-02T00:00:00Z',
        }),
      });
    });
    await page.goto('/');
  });

  async function setOnline(page: Page, online: boolean): Promise<void> {
    await page.evaluate((isOnline) => {
      (window as unknown as { __crewTestInjectEvent: Injector }).__crewTestInjectEvent(
        'runner.status_changed',
        { online: isOnline, lastSeen: Date.now() },
      );
    }, online);
  }

  async function openDrawer(page: Page): Promise<void> {
    await page.getByRole('button', { name: /open supervisor/i }).click();
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: 'Supervisor', exact: true }),
    ).toBeVisible();
  }

  test('Stop enqueues a supervisor_stop command when the supervisor is online', async ({
    page,
  }) => {
    await setOnline(page, true);
    await openDrawer(page);
    const drawer = page.getByRole('dialog');

    await expect(drawer.getByRole('button', { name: /stop supervisor/i })).toBeEnabled();
    await expect(drawer.getByRole('button', { name: /restart supervisor/i })).toBeEnabled();

    const [request] = await Promise.all([
      page.waitForRequest(
        (req: Request) => req.url().includes('/api/runner/commands') && req.method() === 'POST',
      ),
      drawer.getByRole('button', { name: /stop supervisor/i }).click(),
    ]);
    expect(JSON.parse(request.postData() ?? '{}')).toMatchObject({
      agentKey: null,
      kind: 'supervisor_stop',
    });
  });

  test('Restart enqueues a supervisor_restart command when online', async ({ page }) => {
    await setOnline(page, true);
    await openDrawer(page);
    const drawer = page.getByRole('dialog');

    const [request] = await Promise.all([
      page.waitForRequest(
        (req: Request) => req.url().includes('/api/runner/commands') && req.method() === 'POST',
      ),
      drawer.getByRole('button', { name: /restart supervisor/i }).click(),
    ]);
    expect(JSON.parse(request.postData() ?? '{}')).toMatchObject({
      agentKey: null,
      kind: 'supervisor_restart',
    });
  });

  test('offline shows a cold-Start control instead of Stop/Restart', async ({ page }) => {
    await setOnline(page, false);
    await openDrawer(page);
    const drawer = page.getByRole('dialog');

    await expect(drawer.getByRole('button', { name: /start supervisor/i })).toBeVisible();
    await expect(drawer.getByRole('button', { name: /stop supervisor/i })).toHaveCount(0);
    await expect(drawer.getByRole('button', { name: /restart supervisor/i })).toHaveCount(0);
  });
});
