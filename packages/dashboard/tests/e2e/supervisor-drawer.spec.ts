import { test, expect, type Page } from '@playwright/test';

type Injector = (name: string, data: unknown) => void;

/**
 * Supervisor drawer (CREW-292). Clicking the SupervisorCard opens a right-
 * anchored drawer that tails the supervisor's process-management log
 * (`GET /api/runner/supervisor-log`). The worktree stack runs no host runner,
 * so `runner.log` is absent and the drawer shows its empty state — what we
 * assert here. The supervisor's online state is driven through the same SSE
 * dispatcher real status edges use (`__crewTestInjectEvent`).
 */
test.describe('Supervisor drawer (CREW-292)', () => {
  async function setOnline(page: Page, online: boolean): Promise<void> {
    await page.evaluate((isOnline) => {
      (window as unknown as { __crewTestInjectEvent: Injector }).__crewTestInjectEvent(
        'runner.status_changed',
        { online: isOnline, lastSeen: Date.now() },
      );
    }, online);
  }

  test('clicking the supervisor card opens a drawer tailing the management log', async ({
    page,
  }) => {
    // The management log reads whatever `~/.crew/runner.log` the host has
    // accumulated — mock it empty so the empty-state assertion is
    // deterministic regardless of past host-runner activity.
    await page.route('**/api/runner/supervisor-log*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ lines: [] }),
      });
    });
    await page.goto('/#/runner');
    await expect(page.getByRole('heading', { name: 'Runner' })).toBeVisible();
    await setOnline(page, true);

    await page.getByRole('button', { name: 'Open supervisor detail' }).click();

    const drawer = page.getByRole('dialog');
    await expect(drawer.getByRole('heading', { name: 'Supervisor', exact: true })).toBeVisible();
    await expect(drawer.getByText('Management log', { exact: true })).toBeVisible();
    // No host runner on a worktree stack → the management-log empty state.
    await expect(drawer.getByText(/no runner is running here/i)).toBeVisible();
  });

  test('the lifecycle buttons do not open the drawer', async ({ page }) => {
    await page.goto('/#/runner');
    await expect(page.getByRole('heading', { name: 'Runner' })).toBeVisible();
    await setOnline(page, true);

    await page.getByRole('button', { name: 'Restart' }).click();

    // Restart enqueues a command but must not open the drawer.
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});
