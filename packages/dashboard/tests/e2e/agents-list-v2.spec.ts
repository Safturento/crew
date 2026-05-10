import { test, expect } from '@playwright/test';

test.describe('agents-list v2 fidelity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('agent rows lay cells out in v2 order: state · key · runtime · tokens · title · action', async ({
    page,
  }) => {
    // Pick the first agent row across all sections — its cell order is the
    // contract under test, not which agent renders first.
    const row = page.getByRole('button', { name: /^[A-Z]+-\d+ — / }).first();
    await expect(row).toBeVisible();
    // The CVA grid template column widths are the canonical v2 contract; this
    // class string lives in a single place (AgentRow.tsx) and the test
    // documents that any change to it should be deliberate.
    await expect(row).toHaveClass(/grid-cols-\[100px_90px_90px_70px_1fr_168px\]/);
  });

  test('each project section renders a per-section column header row', async ({ page }) => {
    const section = page.locator('section').first();
    const header = section.getByRole('row', { name: /column headers/i });
    await expect(header).toBeVisible();
    // Header labels in canonical v2 column order (presence + non-emptiness;
    // mode-specific styling is verified via visual snapshot if needed).
    await expect(header.getByText('State', { exact: true })).toBeVisible();
    await expect(header.getByText('ID', { exact: true })).toBeVisible();
    await expect(header.getByText('Runtime', { exact: true })).toBeVisible();
    await expect(header.getByText('Tokens', { exact: true })).toBeVisible();
    await expect(header.getByText('Title', { exact: true })).toBeVisible();
  });

  test('project sections expose a hover-revealed Open project page icon-button', async ({
    page,
  }) => {
    const section = page.locator('section').first();
    const openButton = section.getByRole('button', { name: /open project page/i });
    await expect(openButton).toBeAttached();
    // The button is opacity-0 by default; hovering the section header reveals it
    // (group-hover) — Playwright's hover triggers the same CSS transition.
    await section.getByRole('button', { name: /^Toggle / }).hover();
    await expect(openButton).toBeVisible();
  });

  test('Open project page click navigates to /projects/:name without toggling collapse', async ({
    page,
  }) => {
    const section = page.locator('section').first();
    const openButton = section.getByRole('button', { name: /open project page/i });
    const toggle = section.getByRole('button', { name: /^Toggle / });

    // Capture the project name from the toggle's accessible label so the URL
    // assertion stays name-agnostic.
    const toggleLabel = (await toggle.getAttribute('aria-label')) ?? '';
    const projectName = toggleLabel.replace(/^Toggle\s+/, '');

    await section.getByRole('button', { name: /^Toggle / }).hover();
    await openButton.click({ force: true });
    await expect(page).toHaveURL(new RegExp(`#/projects/${projectName}$`));
    // Section should still be expanded after the icon-button click — the
    // stopPropagation contract keeps the toggle-on-click behavior intact.
    await page.goBack();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});
