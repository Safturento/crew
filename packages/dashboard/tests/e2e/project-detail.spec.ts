import { test, expect } from '@playwright/test';

test.describe('project detail route', () => {
  test('renders header, config TOML, and AGENTS section for a seeded slug', async ({ page }) => {
    // The daemon's dev seed registers `crew` and `recipes` as project
    // TOMLs — assert on shape rather than agent content so the test
    // survives fixture renames.
    await page.goto('/#/projects/crew');

    await expect(page.getByRole('heading', { name: 'crew' })).toBeVisible();
    await expect(page.getByText(/crew\.toml/)).toBeVisible();
    await expect(page.getByTestId('project-config-toml')).toContainText('name = "crew"');
    await expect(page.getByText('AGENTS', { exact: true })).toBeVisible();
  });

  test('the back link returns to the projects list', async ({ page }) => {
    await page.goto('/#/projects/crew');
    await page.getByRole('link', { name: '← Projects' }).click();
    await expect(page).toHaveURL(/#\/projects$/);
  });

  test('keeps the Projects tab active while on a detail page', async ({ page }) => {
    await page.goto('/#/projects/crew');
    await expect(page.getByRole('link', { name: 'Projects' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});
