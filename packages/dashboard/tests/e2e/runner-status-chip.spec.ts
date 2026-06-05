import { test, expect } from '@playwright/test';

test.describe('runner health chip + log viewer (CREW-221)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('reads offline on a worktree stack, flips online on SSE, and opens the log viewer', async ({
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

    // Clicking the chip opens the log viewer. The worktree has no runner log,
    // so it shows the empty state rather than an error.
    await onlineChip.click();
    await expect(page.getByRole('heading', { name: 'Runner logs' })).toBeVisible();
    await expect(page.getByText(/no runner logs/i)).toBeVisible();
  });
});
