import { test, expect } from '@playwright/test';

type Injector = (name: string, data: unknown) => void;

/**
 * The Runner page (CREW-245): a third top-level tab rendering the supervisor,
 * live processes, and the empty attention sections, with the live-process list
 * driven by the `runner.snapshot_changed` SSE event. The worktree stack has no
 * host runner, so the page starts empty; we fan a synthetic snapshot through
 * the same dispatcher real SSE messages use (the dev build exposes
 * `__crewTestInjectEvent`) to prove the snapshot wiring + cancel control.
 */
test.describe('Runner page (CREW-245)', () => {
  test('navigates to the Runner tab and renders the section stack', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Runner' }).click();

    await expect(page).toHaveURL(/#\/runner$/);
    await expect(page.getByRole('heading', { name: 'Runner' })).toBeVisible();
    // The supervisor card always renders (its status pill is down or running).
    await expect(page.getByText('Supervisor', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Live processes' })).toBeVisible();
    // Recently-ended + the Failed-to-start attention queue have no read
    // endpoint on the merged daemon yet, so recently-ended shows its empty
    // state and the attention queue stays hidden (CREW-245 scope decision).
    await expect(page.getByText('Nothing ended recently')).toBeVisible();
    await expect(page.getByText('Failed to start')).toBeHidden();
  });

  test('renders a live process from a snapshot SSE event and opens the cancel confirm', async ({
    page,
  }) => {
    await page.goto('/#/runner');
    await expect(page.getByRole('heading', { name: 'Runner' })).toBeVisible();

    await page.evaluate(() => {
      (window as unknown as { __crewTestInjectEvent: Injector }).__crewTestInjectEvent(
        'runner.snapshot_changed',
        {
          processes: [
            {
              agentKey: 'CREW-999',
              command: 'run',
              pid: 1,
              pgid: 1,
              actionRequestId: null,
              spawnedAt: new Date(Date.now() - 90_000).toISOString(),
              state: 'running',
              project: '~/code/crew',
            },
          ],
        },
      );
    });

    // The ProcessRow renders the tracked process with a Cancel control.
    await expect(page.getByText('CREW-999')).toBeVisible();
    const cancel = page.getByRole('button', { name: 'Cancel' });
    await expect(cancel).toBeVisible();

    // Cancel opens the soft-cancel confirm (AlertModal).
    await cancel.click();
    await expect(page.getByRole('button', { name: 'Cancel run' })).toBeVisible();
  });
});
