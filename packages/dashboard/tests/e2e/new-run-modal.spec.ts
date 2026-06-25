import { test, expect, type Page } from '@playwright/test';

/**
 * CREW-286: the live (non-degraded) picker renders two-row `TicketRow`s. The
 * worktree daemon's Jira list degrades to manual entry in CI, so the row
 * rendering — and the `interactive` gating folded into it — is only reachable
 * by stubbing the tickets endpoint with a known shape that exercises every row
 * state (runnable, in-flight, interactive, blocked).
 */
async function mockTickets(page: Page): Promise<void> {
  await page.route('**/api/projects/*/tickets', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        available: true,
        groups: [
          {
            epicKey: 'CREW-30',
            epicSummary: 'Picker redesign',
            tickets: [
              {
                key: 'CREW-31',
                summary: 'Runnable picker ticket',
                priority: 'High',
                runnable: true,
                blockedBy: [],
                hasActiveAgent: false,
                interactive: false,
              },
              {
                key: 'CREW-32',
                summary: 'Interactive picker ticket',
                priority: 'Medium',
                runnable: true,
                blockedBy: [],
                hasActiveAgent: false,
                interactive: true,
              },
              {
                key: 'CREW-33',
                summary: 'Blocked picker ticket',
                priority: 'High',
                runnable: false,
                blockedBy: [{ key: 'CREW-31', summary: 'x' }],
                hasActiveAgent: false,
                interactive: false,
              },
            ],
          },
        ],
      }),
    });
  });
}

test.describe('New Run modal (CREW-218)', () => {
  test('walks project → ticket → confirm and enqueues a run', async ({ page }) => {
    // Force the degraded (manual ticket-key) branch deterministically — whether
    // the worktree daemon has Jira creds varies by environment, so stub the
    // list unavailable rather than depend on ambient degraded-ness.
    await page.route('**/api/projects/*/tickets', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ available: false, reason: 'no_credentials' }),
      });
    });
    await page.goto('/');
    await page.getByRole('button', { name: /New Run/ }).click();

    const dialog = page.getByRole('dialog');

    // Step 1 — pick a project. The seed registers a `crew` project; the row
    // is a ModalSelectionRow button.
    await expect(dialog.getByText('Pick a project')).toBeVisible();
    await dialog.getByRole('button', { name: /crew/ }).first().click();

    // Step 2 — the ticket key gates the Next button (the confirm guard can't
    // be reached without valid input).
    const next = dialog.getByRole('button', { name: 'Next' });
    await expect(next).toBeDisabled();
    await dialog.getByLabel(/ticket key/i).fill('CREW-999');
    await expect(next).toBeEnabled();
    await next.click();

    // Step 3 — the confirm step shows the resolved `crew run` command; Spawn
    // enqueues a run action and the success toast confirms the POST round-trip.
    await expect(dialog.getByText('crew run CREW-999')).toBeVisible();
    await dialog.getByRole('button', { name: /Spawn agent/ }).click();
    await expect(page.getByText('Run queued')).toBeVisible();
  });

  test('renders two-row picker rows and gates interactive + blocked tickets (CREW-286)', async ({
    page,
  }) => {
    await mockTickets(page);
    await page.goto('/');
    await page.getByRole('button', { name: /New Run/ }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /crew/ }).first().click();

    // Each row is title-led: the summary is the bold primary, the key sits in
    // the meta line below it (so the row's accessible name carries both).
    const runnable = dialog.getByRole('button', { name: /Runnable picker ticket.*CREW-31/ });
    await expect(runnable).toBeVisible();
    await expect(runnable).toBeEnabled();

    // Interactive + blocked rows carry their tinted reason and are non-selectable.
    const interactive = dialog.getByRole('button', { name: /Interactive picker ticket/ });
    await expect(interactive).toBeDisabled();
    await expect(dialog.getByText('interactive', { exact: true })).toBeVisible();

    const blocked = dialog.getByRole('button', { name: /Blocked picker ticket/ });
    await expect(blocked).toBeDisabled();
    await expect(dialog.getByText(/blocked by CREW-31/)).toBeVisible();

    // "Available only" hides interactive + blocked, leaving the runnable row.
    await dialog.getByRole('switch', { name: /Available only/ }).click();
    await expect(dialog.getByText('Interactive picker ticket')).toBeHidden();
    await expect(dialog.getByText('Blocked picker ticket')).toBeHidden();
    await expect(dialog.getByText('Runnable picker ticket')).toBeVisible();

    // A runnable row selects through to the confirm step.
    await dialog.getByRole('button', { name: /Runnable picker ticket/ }).click();
    await expect(dialog.getByText('crew run CREW-31')).toBeVisible();
  });
});
