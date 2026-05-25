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

  // Re-enable once RunMetrics has a new home. The 2026-05-22 drawer redesign
  // dropped <RunMetrics> from AgentBody and no other route renders it yet —
  // see docs/followups.md `2026-05-22 — Layer-1 RunMetrics widget loses its
  // drawer home in the redesign`. The widget itself still works; the gap is
  // placement, not implementation.
  test.skip('shows a run-metrics panel on the agent detail page', async ({ page }) => {
    await page.goto('/');

    // Open the first agent's full page via its row button. Scope by
    // `data-testid="project-section"` so the MetricsTrendWidget's `<section>`
    // above the project list doesn't get picked up by a generic `section.first()`.
    const firstAgent = page
      .getByTestId('project-section')
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
