import { test, expect } from '@playwright/test';

test.describe('dashboard shell', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('renders the top nav with Agents tab active by default', async ({ page }) => {
    await expect(page.getByRole('link', { name: 'Agents' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('link', { name: 'Projects' })).not.toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('lists project sections from the mock daemon client', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Toggle kanban-api' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Toggle recipes-app' })).toBeVisible();
  });

  test('collapses and expands a project section when its header is clicked', async ({ page }) => {
    const toggle = page.getByRole('button', { name: 'Toggle kanban-api' });
    const firstAgent = page.getByRole('button', {
      name: /^KAN-\d+ — /,
    });

    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(firstAgent.first()).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(firstAgent.first()).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(firstAgent.first()).toBeVisible();
  });

  test('navigates to the Projects placeholder', async ({ page }) => {
    await page.getByRole('link', { name: 'Projects' }).click();
    await expect(page.getByRole('link', { name: 'Projects' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByText('The projects route ships in a follow-up plan.')).toBeVisible();
  });
});
