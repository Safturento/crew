import { test, expect } from '@playwright/test';

type Injector = (name: string, data: unknown) => void;

/**
 * The Runner page (CREW-245): the supervisor, live processes, and the empty
 * attention sections, with the live-process list driven by the
 * `runner.snapshot_changed` SSE event. The worktree stack has no host runner,
 * so the page starts empty; we fan a synthetic snapshot through the same
 * dispatcher real SSE messages use (the dev build exposes
 * `__crewTestInjectEvent`) to prove the snapshot wiring + cancel control.
 *
 * CREW-311 removed the Runner nav tab (the grid is the single lifecycle
 * surface), so these specs enter via the direct hash route — which survives
 * until ticket F deletes the page wholesale, and these specs with it.
 */
test.describe('Runner page (CREW-245)', () => {
  test('renders the section stack at the direct #/runner route', async ({ page }) => {
    await page.goto('/#/runner');

    await expect(page.getByRole('heading', { name: 'Runner' })).toBeVisible();
    // The supervisor card always renders (its status pill is down or running).
    await expect(page.getByText('Supervisor', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Live processes' })).toBeVisible();
    // CREW-291: Recently-ended is now wired to GET /api/runner/page, so the
    // seed's terminal runs render real rows (no longer the empty state).
    await expect(page.getByRole('heading', { name: 'Recently ended' })).toBeVisible();
    await expect(page.getByText('Nothing ended recently')).toBeHidden();
  });

  // CREW-291: every run row is clickable → the run drawer (header + meta +
  // console output). Driven off an SSE-injected live process so the assertion
  // doesn't depend on whatever terminal runs the worktree happens to seed.
  test('clicking a live-process row opens the run drawer', async ({ page }) => {
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
              pid: 4242,
              pgid: 4242,
              actionRequestId: null,
              spawnedAt: new Date(Date.now() - 90_000).toISOString(),
              state: 'running',
              project: 'crew',
            },
          ],
        },
      );
    });

    await page.getByRole('button', { name: 'Open run drawer for CREW-999' }).click();

    // The drawer renders the header (key heading + running pill), the live
    // console indicator, and — with no captured startup log — the empty body.
    await expect(page.getByRole('heading', { name: 'CREW-999', exact: true })).toBeVisible();
    await expect(page.getByText('Console output')).toBeVisible();
    await expect(page.getByText('No output captured.')).toBeVisible();
    await expect(page.getByText('pgid')).toBeVisible();
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

    // The ProcessRow renders the tracked process with a Cancel control. The
    // locator is scoped to the row (a bare getByText('CREW-999') collides
    // with whatever pending action_requests the worktree DB accumulates).
    await expect(page.getByRole('button', { name: 'Open run drawer for CREW-999' })).toBeVisible();
    const cancel = page.getByRole('button', { name: 'Cancel' });
    await expect(cancel).toBeVisible();

    // Cancel opens the soft-cancel confirm (AlertModal).
    await cancel.click();
    await expect(page.getByRole('button', { name: 'Cancel run' })).toBeVisible();
  });
});
