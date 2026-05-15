import { test, expect } from '@playwright/test';

test.describe('metrics trend widget', () => {
  test('renders the agent-docs metrics card on the agents landing page', async ({ page }) => {
    await page.goto('/');

    // Shape, not specific numbers: the daemon's seeded runs may or may not
    // carry measured metrics, so assert the widget's labels render — that is
    // the dashboard contract, independent of fixture values.
    const widget = page.getByRole('heading', { name: /agent docs — metrics/i });
    await expect(widget).toBeVisible();

    await expect(page.getByText('Doc-load coverage')).toBeVisible();
    await expect(page.getByText('Cleanliness pass')).toBeVisible();
    await expect(page.getByText('Context at PR-claim')).toBeVisible();
    await expect(page.getByText('Parity violations')).toBeVisible();
  });

  test('shows a run-metrics panel on the agent detail page', async ({ page }) => {
    await page.goto('/');

    // Open the first agent's full page via its row button.
    const firstAgent = page
      .locator('section')
      .first()
      .getByRole('button', { name: /^[A-Z]+-\d+ — / })
      .first();
    const label = await firstAgent.getAttribute('aria-label');
    const key = label?.match(/^([A-Z]+-\d+)/)?.[1];
    expect(key).toBeTruthy();

    await page.goto(`/#/agent/${key}/full`);
    await expect(page.getByRole('heading', { name: /run metrics/i })).toBeVisible();
  });
});
