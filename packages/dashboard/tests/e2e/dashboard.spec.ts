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

  test('renders a project section per registered project that has agents', async ({ page }) => {
    // Shape, not specific names: the daemon's seeded fixtures pin specific
    // project names today (`crew`, `recipes`), but the dashboard's contract
    // is "group agents by project," not "render these two strings." A
    // name-agnostic check survives any future fixture rename.
    const toggles = page.getByRole('button', { name: /^Toggle / });
    await expect(toggles.first()).toBeVisible();
    expect(await toggles.count()).toBeGreaterThanOrEqual(2);
  });

  test('collapses and expands a project section when its header is clicked', async ({ page }) => {
    // Scope to the first project section so the agent-row visibility check
    // tracks *that* section's collapse state, not whichever section happens
    // to render an agent row first across the page.
    const section = page.locator('section').first();
    const toggle = section.getByRole('button', { name: /^Toggle / });
    const firstAgent = section.getByRole('button', { name: /^[A-Z]+-\d+ — / }).first();

    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(firstAgent).toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(firstAgent).toBeHidden();

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(firstAgent).toBeVisible();
  });

  test('navigates to the Projects list', async ({ page }) => {
    await page.getByRole('link', { name: 'Projects' }).click();
    await expect(page.getByRole('link', { name: 'Projects' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: /register project/i })).toBeVisible();
  });
});
