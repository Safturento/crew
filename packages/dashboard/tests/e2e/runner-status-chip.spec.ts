import { test, expect } from '@playwright/test';

test.describe('runner health chip + supervisor drawer (CREW-221 / CREW-311)', () => {
  test.beforeEach(async ({ page }) => {
    // The management log reads whatever `~/.crew/runner.log` the host has
    // accumulated — mock it empty so the drawer's empty state is
    // deterministic regardless of past host-runner activity.
    await page.route('**/api/runner/supervisor-log*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ lines: [] }),
      });
    });
    await page.goto('/');
  });

  test('reads offline on a worktree stack, flips online on SSE, and opens the supervisor drawer', async ({
    page,
  }) => {
    // The worktree stack runs no host runner, so the chip seeds unhealthy.
    const chip = page.getByRole('button', { name: /Runner offline/i });
    await expect(chip).toBeVisible();
    await expect(chip).toHaveAttribute('data-online', 'false');

    // A runner.status_changed SSE ping flips the chip live — no refetch. The
    // dev build exposes __crewTestInjectEvent to fan synthetic events through
    // the same dispatcher real SSE messages use.
    await page.evaluate(() => {
      (
        window as unknown as { __crewTestInjectEvent: (n: string, d: unknown) => void }
      ).__crewTestInjectEvent('runner.status_changed', { online: true, lastSeen: Date.now() });
    });
    const onlineChip = page.getByRole('button', { name: /Runner online/i });
    await expect(onlineChip).toBeVisible();
    await expect(onlineChip).toHaveAttribute('data-online', 'true');

    // CREW-311: clicking the chip opens the supervisor drawer (the Runner
    // page and its raw log viewer retire with the runner rework). The
    // worktree has no runner log, so the management log shows its empty
    // state rather than an error.
    await onlineChip.click();
    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('heading', { name: 'Supervisor', exact: true })).toBeVisible();
    await expect(drawer.getByText('Management log', { exact: true })).toBeVisible();
    await expect(drawer.getByText(/no runner is running here/i)).toBeVisible();
  });

  test('shows the live-process count while the runner supervises work', async ({ page }) => {
    await page.evaluate(() => {
      const inject = (
        window as unknown as { __crewTestInjectEvent: (n: string, d: unknown) => void }
      ).__crewTestInjectEvent;
      inject('runner.status_changed', { online: true, lastSeen: Date.now() });
      inject('runner.snapshot_changed', {
        processes: [
          {
            agentKey: 'CREW-901',
            command: 'run',
            pid: 4242,
            pgid: 4242,
            actionRequestId: null,
            spawnedAt: new Date(Date.now() - 60_000).toISOString(),
            state: 'running',
            project: 'crew',
          },
        ],
      });
    });

    await expect(page.getByRole('button', { name: /Runner online/i })).toHaveText(
      /Runner · 1 live/,
    );
  });

  test('the Runner nav tab is gone (CREW-311)', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Agents' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Projects' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Runner' })).toHaveCount(0);
  });
});
