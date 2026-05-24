import { test, expect, type Page } from '@playwright/test';

const SEEDED_AGENT_KEY = 'CREW-101';

/**
 * The drawer redesign (CREW-177 Epic) shipped four surfaces this spec
 * exercises end-to-end against the live daemon + dashboard:
 *   - DrawerHeader meta pills (app_url, jira_url, worktree_path)
 *   - TokensByTool composite (`region` "Tokens by tool" with row + footer)
 *   - Timeline state-grouped sections (one per `to_state`)
 *   - Collapse-all toolbar action
 *   - X close pill (replaces the prior Unicode "✕")
 *
 * Both /agents/:key and /timeline are mocked so the assertions don't depend
 * on whichever fixtures the worktree happens to have seeded. The agent body
 * still renders against real React Query / SSE plumbing.
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
        tokens_by_tool: [
          {
            tool: 'Bash',
            tokens: { input: 0, output: 18_400, cacheCreation: 0, cacheRead: 0 },
            totalTokens: 18_400,
          },
          {
            tool: 'Read',
            tokens: { input: 0, output: 12_100, cacheCreation: 0, cacheRead: 0 },
            totalTokens: 12_100,
          },
          {
            tool: 'Edit',
            tokens: { input: 0, output: 9_600, cacheCreation: 0, cacheRead: 0 },
            totalTokens: 9_600,
          },
        ],
        model: 'claude-sonnet-4-6',
        runs: [
          {
            id: 'r1',
            command: 'run',
            started_at: '2026-05-22T14:30:00Z',
            completed_at: null,
            doc_load_coverage_pct: null,
            cleanliness_pass: null,
            pr_claim_input_tokens: null,
            parity_violations: null,
          },
        ],
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

async function mockTimeline(page: Page, agentKey: string): Promise<void> {
  await page.route(`**/api/agents/${agentKey}/timeline`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        events: [
          {
            type: 'assistant',
            uuid: 'evt-1',
            timestamp: '2026-05-22T14:30:30Z',
            message: {
              role: 'assistant',
              content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }],
            },
          },
          {
            type: 'assistant',
            uuid: 'evt-2',
            timestamp: '2026-05-22T14:35:00Z',
            message: {
              role: 'assistant',
              content: [{ type: 'text', text: 'Bootstrapped the worktree.' }],
            },
          },
        ],
      }),
    });
  });
}

async function mockStateHistory(page: Page, agentKey: string): Promise<void> {
  await page.route(`**/api/agents/${agentKey}/state-history`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        transitions: [
          { from: null, to: 'init', ts: Date.parse('2026-05-22T14:30:00Z') },
          { from: 'init', to: 'running', ts: Date.parse('2026-05-22T14:33:00Z') },
        ],
      }),
    });
  });
}

test.describe('Agent drawer — 2026-05-22 redesign', () => {
  test.beforeEach(async ({ page }) => {
    await mockAgentDetail(page, SEEDED_AGENT_KEY);
    await mockTimeline(page, SEEDED_AGENT_KEY);
    await mockStateHistory(page, SEEDED_AGENT_KEY);
  });

  test('DrawerHeader renders the three meta-row pills (app, jira, worktree)', async ({ page }) => {
    await page.goto(`/#/agent/${SEEDED_AGENT_KEY}`);
    const drawer = page.getByRole('dialog', { name: 'Agent detail' });

    await expect(drawer.getByRole('link', { name: /localhost:7421/ })).toBeVisible();
    await expect(drawer.locator('a[href*="atlassian.net/browse/CREW-101"]')).toBeVisible();
    await expect(drawer.getByText(/\.worktrees\/CREW-101/)).toBeVisible();
  });

  test('TokensByTool renders the section header, rows, and total footer', async ({ page }) => {
    await page.goto(`/#/agent/${SEEDED_AGENT_KEY}`);
    const region = page.getByRole('region', { name: 'Tokens by tool' });

    await expect(region).toBeVisible();
    await expect(region.getByText('Bash')).toBeVisible();
    await expect(region.getByText('Read')).toBeVisible();
    await expect(region.getByText('Edit')).toBeVisible();
    await expect(region.getByTestId('tokens-by-tool-footer')).toContainText('Total');
  });

  // CREW-195: each row carries a cost cell weighted by the agent's model;
  // the panel footer surfaces the grand total. Bash row = 18.4k output on
  // claude-sonnet-4-6 → 18.4k × ($15 / 1M) = $0.276, formatted as "$0.28".
  test('TokensByTool surfaces per-row cost + grand total weighted by model', async ({ page }) => {
    await page.goto(`/#/agent/${SEEDED_AGENT_KEY}`);
    const region = page.getByRole('region', { name: 'Tokens by tool' });

    const rowCosts = region.getByTestId('tokens-by-tool-row-cost');
    await expect(rowCosts).toHaveCount(3);
    await expect(rowCosts.nth(0)).toHaveText('$0.28');
    // Grand total = (18.4 + 12.1 + 9.6)k × $15/M ≈ $0.6015, formatted as "$0.60".
    await expect(region.getByTestId('tokens-by-tool-grand-cost')).toHaveText('$0.60');
    // Tooltip exposes the per-category breakdown without dedicated UI.
    await expect(rowCosts.nth(0)).toHaveAttribute(
      'title',
      /input.*output.*cache-write.*cache-read/i,
    );
  });

  test('Timeline renders a leading initial-state section plus one per transition', async ({
    page,
  }) => {
    // CREW-196: groupEventsByState prepends a leading section for the agent's
    // initial state. With 2 mocked transitions (null→init, init→running) the
    // timeline renders 3 sections: leading 'initializing' (from null fallback),
    // 'initializing' (from to:'init'), and 'running'.
    await page.goto(`/#/agent/${SEEDED_AGENT_KEY}`);
    const sections = page.getByTestId('timeline-section');
    await expect(sections).toHaveCount(3);
    await expect(
      page.locator('[data-testid="timeline-section"][data-state="initializing"]'),
    ).toHaveCount(2);
    await expect(
      page.locator('[data-testid="timeline-section"][data-state="running"]'),
    ).toHaveCount(1);
  });

  test('Collapse-all hides every section body in one click', async ({ page }) => {
    await page.goto(`/#/agent/${SEEDED_AGENT_KEY}`);
    await expect(page.getByTestId('transcript-row').first()).toBeVisible();

    await page.getByRole('button', { name: 'Collapse all' }).click();

    await expect(page.getByTestId('transcript-row')).toHaveCount(0);
    const toggles = page.getByRole('button', { name: /^Toggle .* section$/ });
    const count = await toggles.count();
    for (let i = 0; i < count; i += 1) {
      await expect(toggles.nth(i)).toHaveAttribute('aria-expanded', 'false');
    }
  });

  test('X close pill dismisses the drawer', async ({ page }) => {
    await page.goto(`/#/agent/${SEEDED_AGENT_KEY}`);
    await expect(page.getByTestId('drawer-header')).toBeVisible();

    await page.getByRole('button', { name: 'Close drawer' }).click();

    await expect(page.getByTestId('drawer-header')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/?$/);
  });
});
