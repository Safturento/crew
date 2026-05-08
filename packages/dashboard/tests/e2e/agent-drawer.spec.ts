import { test, expect } from '@playwright/test';

const SEEDED_AGENT_KEY = 'CREW-101';

test.describe('Agent drawer', () => {
  test('opens at /#/agent/:key with header populated by useAgent', async ({ page }) => {
    await page.goto(`/#/agent/${SEEDED_AGENT_KEY}`);
    await expect(page.getByTestId('drawer-header')).toBeVisible();
    await expect(page.getByText(SEEDED_AGENT_KEY).first()).toBeVisible();
  });

  test('closes on Escape and returns to the agents list', async ({ page }) => {
    await page.goto(`/#/agent/${SEEDED_AGENT_KEY}`);
    await expect(page.getByTestId('drawer-header')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByTestId('drawer-header')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/?$/);
  });

  test('closes when the backdrop is clicked', async ({ page }) => {
    await page.goto(`/#/agent/${SEEDED_AGENT_KEY}`);
    await expect(page.getByTestId('drawer-header')).toBeVisible();

    // Click the upper-left of the backdrop — the drawer panel is right-aligned
    // and the backdrop's center sits underneath it on default viewports.
    await page.getByTestId('drawer-backdrop').click({ position: { x: 50, y: 50 } });

    await expect(page.getByTestId('drawer-header')).toHaveCount(0);
  });

  test('Open as page navigates to /agent/:key/full without drawer chrome', async ({ page }) => {
    await page.goto(`/#/agent/${SEEDED_AGENT_KEY}`);
    await page.getByRole('link', { name: /open as page/i }).click();

    await expect(page).toHaveURL(new RegExp(`#/agent/${SEEDED_AGENT_KEY}/full$`));
    await expect(page.getByTestId('drawer-header')).toBeVisible();
    await expect(page.getByTestId('drawer-backdrop')).toHaveCount(0);
  });

  test('clicking an agent row in the list opens the drawer', async ({ page }) => {
    await page.goto('/');
    const row = page.getByRole('button', { name: /^[A-Z]+-\d+ — / }).first();
    await row.click();

    await expect(page.getByTestId('drawer-header')).toBeVisible();
    await expect(page).toHaveURL(/#\/agent\/[A-Z]+-\d+$/);
  });
});
