import { test, expect, type Page, type Request } from '@playwright/test';

/**
 * Supervisor drawer reconcile roll-up (CREW-312). The drawer — opened from the
 * header runner chip now that the standalone Runner page is retired —
 * consolidates every queued + orphaned run across all projects from
 * `GET /api/runner/reconcile`, each with a Dequeue (queued) / Reap (orphaned)
 * control that enqueues a runner reverse-queue command. The roll-up + command
 * POST are mocked so the assertions don't depend on the worktree DB's live
 * state and nothing is persisted.
 */
test.describe('Supervisor drawer — reconcile roll-up (CREW-312)', () => {
  async function mockReconcile(page: Page, body: unknown): Promise<void> {
    await page.route('**/api/runner/reconcile', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
    });
  }

  test.beforeEach(async ({ page }) => {
    // Empty management log so the console empty-state is deterministic.
    await page.route('**/api/runner/supervisor-log*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ lines: [] }),
      });
    });
    // Intercept the command enqueue so Dequeue / Reap don't mutate the
    // worktree daemon's `runner_commands`.
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
  });

  async function openDrawer(page: Page): Promise<void> {
    await page.getByRole('button', { name: /open supervisor/i }).click();
    await expect(
      page.getByRole('dialog').getByRole('heading', { name: 'Supervisor', exact: true }),
    ).toBeVisible();
  }

  test('lists queued + orphaned runs and enqueues Dequeue / Reap commands', async ({ page }) => {
    await mockReconcile(page, {
      queued: [
        { key: 'CREW-9', projectName: 'crew', state: 'queued', since: '2026-06-30T10:00:00Z' },
      ],
      orphaned: [
        { key: 'CREW-11', projectName: 'crew', state: 'orphaned', since: '2026-06-30T09:00:00Z' },
      ],
    });
    await page.goto('/');
    await openDrawer(page);
    const drawer = page.getByRole('dialog');

    // Both housekeeping refs surface under the counted Reconcile header.
    await expect(drawer.getByRole('heading', { name: /reconcile · 2/i })).toBeVisible();
    await expect(drawer.getByText('CREW-9', { exact: true })).toBeVisible();
    await expect(drawer.getByText('CREW-11', { exact: true })).toBeVisible();

    // The queued ref dequeues; the orphaned ref reaps.
    const [dequeueReq] = await Promise.all([
      page.waitForRequest(
        (req: Request) => req.url().includes('/api/runner/commands') && req.method() === 'POST',
      ),
      drawer.getByRole('button', { name: /dequeue CREW-9/i }).click(),
    ]);
    expect(JSON.parse(dequeueReq.postData() ?? '{}')).toMatchObject({
      agentKey: 'CREW-9',
      kind: 'dequeue',
    });

    const [reapReq] = await Promise.all([
      page.waitForRequest(
        (req: Request) => req.url().includes('/api/runner/commands') && req.method() === 'POST',
      ),
      drawer.getByRole('button', { name: /reap CREW-11/i }).click(),
    ]);
    expect(JSON.parse(reapReq.postData() ?? '{}')).toMatchObject({
      agentKey: 'CREW-11',
      kind: 'reap',
    });
  });

  test('shows the empty reconcile + management-log states with nothing to sweep', async ({
    page,
  }) => {
    await mockReconcile(page, { queued: [], orphaned: [] });
    await page.goto('/');
    await openDrawer(page);
    const drawer = page.getByRole('dialog');

    await expect(drawer.getByText(/nothing to reconcile/i)).toBeVisible();
    await expect(drawer.getByText('Management log', { exact: true })).toBeVisible();
    await expect(drawer.getByText(/no runner is running here/i)).toBeVisible();
  });
});
