import { test, expect } from '@playwright/test';

test.describe('Projects list', () => {
  test('renders heading + Register button + seeded projects', async ({ page }) => {
    await page.goto('/#/projects');
    await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /register project/i })).toBeVisible();

    // The seeded fixtures register two projects (`crew`, `recipes`); the table
    // should render a link per project. Name-agnostic count check survives a
    // future fixture rename.
    const rows = page.locator('a[href^="#/projects/"]');
    await expect(rows.first()).toBeVisible();
    expect(await rows.count()).toBeGreaterThanOrEqual(2);
  });

  test('clicking a row navigates to the project detail hash', async ({ page }) => {
    await page.goto('/#/projects');
    const firstRow = page.locator('a[href^="#/projects/"]').first();
    await firstRow.click();
    await expect(page).toHaveURL(/#\/projects\/[a-z0-9_-]+$/);
  });
});
