import { test, expect } from '@playwright/test';

test.describe('agents-list v2 fidelity', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('project sections expose a hover-revealed Open project page icon-button', async ({
    page,
  }) => {
    const section = page.getByTestId('project-section').first();
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
    const section = page.getByTestId('project-section').first();
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
