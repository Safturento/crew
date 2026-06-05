import { test, expect } from '@playwright/test';

test.describe('New Run modal (CREW-218)', () => {
  test('walks project → ticket → confirm and enqueues a run', async ({ page }) => {
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
});
