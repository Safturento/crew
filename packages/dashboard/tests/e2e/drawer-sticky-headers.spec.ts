import { test, expect, type Page } from '@playwright/test';

const SEEDED_AGENT_KEY = 'CREW-101';

/**
 * Drawer sticky headers (CREW-239): the agent body scrolls as a single
 * container; once the full DrawerHeader scrolls out of view a condensed
 * header (key · title · state badge · ✕) overlays the top and the timeline
 * toolbar stays pinned directly below it. jsdom mocks IntersectionObserver
 * and position:sticky away, so this spec locks the behavior in against a
 * real browser.
 *
 * /agents/:key and /timeline are mocked so the scroll height doesn't depend
 * on whichever fixtures the worktree happens to have seeded.
 */
async function mockAgentDetail(page: Page, agentKey: string): Promise<void> {
  await page.route(`**/api/agents/${agentKey}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        key: agentKey,
        project: 'kanban-api',
        ticket_key: agentKey,
        ticket_title: 'Drag-and-drop reordering keeps stale board state',
        state: 'running',
        worktree_path: '/repos/kanban-api/.worktrees/CREW-101',
        pr_url: null,
        app_url: 'http://localhost:7421',
        jira_url: 'https://safturento.atlassian.net/browse/CREW-101',
        tokens_by_tool: [],
        model: '',
        runs: [],
        tokens: {
          total: 48_000,
          input: 30_000,
          output: 5_000,
          cache_read: 10_000,
          cache_creation: 3_000,
        },
        tool_call_count: 12,
      }),
    });
  });
}

async function mockLongTimeline(page: Page, agentKey: string): Promise<void> {
  // Enough rows that the timeline always overflows the drawer viewport.
  const events = Array.from({ length: 40 }, (_, i) => ({
    type: 'assistant',
    uuid: `evt-${i}`,
    timestamp: `2026-05-22T14:${String(30 + Math.floor(i / 60)).padStart(2, '0')}:${String(i % 60).padStart(2, '0')}Z`,
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: `step ${i}: reorder board column` }],
    },
  }));
  await page.route(`**/api/agents/${agentKey}/timeline`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ events }),
    });
  });
  await page.route(`**/api/agents/${agentKey}/state-history`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ transitions: [] }),
    });
  });
}

const scrollBody = async (page: Page, top: number): Promise<void> => {
  await page.getByTestId('agent-scroll-container').evaluate((el, t) => {
    el.scrollTop = t;
  }, top);
};

test.describe('Drawer sticky headers (CREW-239)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAgentDetail(page, SEEDED_AGENT_KEY);
    await mockLongTimeline(page, SEEDED_AGENT_KEY);
  });

  test('condensed header appears on scroll and the toolbar stays pinned below it', async ({
    page,
  }) => {
    await page.goto(`/#/agent/${SEEDED_AGENT_KEY}`);
    await expect(page.getByTestId('drawer-header')).toBeVisible();

    // At rest the condensed header is absent.
    await expect(page.getByTestId('condensed-header')).toHaveCount(0);

    await scrollBody(page, 600);
    const condensed = page.getByTestId('condensed-header');
    await expect(condensed).toBeVisible();
    await expect(condensed).toContainText('CREW-101');
    await expect(condensed).toContainText('Drag-and-drop reordering keeps stale board state');
    await expect(condensed.getByRole('status', { name: 'Running' })).toBeVisible();
    await expect(condensed.getByRole('button', { name: 'Close drawer' })).toBeVisible();

    // The toolbar is pinned at the condensed header's bottom edge — its
    // filters/search stay usable without scrolling back up. 44 mirrors
    // CONDENSED_HEADER_PX (not imported: the component module would drag
    // React/lucide into the Playwright node transform).
    const toolbarTop = await page
      .getByTestId('timeline-toolbar')
      .evaluate(
        (el) =>
          el.getBoundingClientRect().top -
          el.closest('[data-testid="agent-scroll-container"]')!.getBoundingClientRect().top,
      );
    expect(toolbarTop).toBe(44);
    await expect(page.getByRole('button', { name: /open timeline filters/i })).toBeVisible();

    // Scrolling back to the top dismisses the condensed header.
    await scrollBody(page, 0);
    await expect(page.getByTestId('condensed-header')).toHaveCount(0);
  });

  test('full-page view pins the same chrome without a close button', async ({ page }) => {
    await page.goto(`/#/agent/${SEEDED_AGENT_KEY}/full`);
    await expect(page.getByTestId('drawer-header')).toBeVisible();

    await scrollBody(page, 600);
    const condensed = page.getByTestId('condensed-header');
    await expect(condensed).toBeVisible();
    await expect(condensed.getByRole('button', { name: 'Close drawer' })).toHaveCount(0);
  });
});
