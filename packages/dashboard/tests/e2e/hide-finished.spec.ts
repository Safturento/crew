import { test, expect, type Page } from '@playwright/test';

const FINISHED_AGENT_KEY = 'KAN-202';

async function clearHideFinishedPref(page: Page): Promise<void> {
  await page.goto('/');
  await page.evaluate(() => window.localStorage.removeItem('crew.dashboard.hideFinished'));
}

test.describe('Hide finished toggle', () => {
  test('hides the seeded finished agent by default and reveals it when toggled off', async ({
    page,
  }) => {
    await clearHideFinishedPref(page);
    await page.reload();

    const toggle = page.getByRole('switch', { name: /hide finished/i });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-checked', 'true');

    const finishedRow = page.getByRole('button', { name: new RegExp(`^${FINISHED_AGENT_KEY} — `) });
    await expect(finishedRow).toHaveCount(0);

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');
    await expect(finishedRow).toBeVisible();
  });

  test('persists the off state across reloads via localStorage', async ({ page }) => {
    await clearHideFinishedPref(page);
    await page.reload();

    const toggle = page.getByRole('switch', { name: /hide finished/i });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    const stored = await page.evaluate(() =>
      window.localStorage.getItem('crew.dashboard.hideFinished'),
    );
    expect(stored).toBe('false');

    await page.reload();

    const reloadedToggle = page.getByRole('switch', { name: /hide finished/i });
    await expect(reloadedToggle).toHaveAttribute('aria-checked', 'false');
    await expect(
      page.getByRole('button', { name: new RegExp(`^${FINISHED_AGENT_KEY} — `) }),
    ).toBeVisible();
  });
});
