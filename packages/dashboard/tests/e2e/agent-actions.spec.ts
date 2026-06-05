import { test, expect } from '@playwright/test';

test.describe('runner-aware agent actions (CREW-217)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Finish degrades with no runner, enables on runner.status_changed, then enqueues', async ({
    page,
  }) => {
    // The worktree stack has no host runner connected, so the enqueue-able
    // QuickActions degrade to disabled ("Waiting for runner") rather than
    // queueing work nothing can drain. The seed has pr_open / pr_merged
    // agents whose only enqueue-able action is Finish.
    const finish = page.getByRole('button', { name: 'Finish' }).first();
    await expect(finish).toBeDisabled();

    // A runner.status_changed SSE ping flips the gate live — no refetch. The
    // dev build exposes __crewTestInjectEvent to fan synthetic events through
    // the same dispatcher real SSE messages use.
    await page.evaluate(() => {
      (
        window as unknown as { __crewTestInjectEvent: (n: string, d: unknown) => void }
      ).__crewTestInjectEvent('runner.status_changed', { online: true, lastSeen: Date.now() });
    });
    await expect(finish).toBeEnabled();

    // Clicking the now-enabled action enqueues it; the success toast confirms
    // the POST /api/actions round-trip.
    await finish.click();
    await expect(page.getByText('Finish queued')).toBeVisible();
  });
});
