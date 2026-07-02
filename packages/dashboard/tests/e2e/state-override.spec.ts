import { test, expect, type Page } from '@playwright/test';

const AGENT_KEY = 'CREW-101';

/**
 * The drawer state-override control (CREW-260): a secondary icon button beside
 * the header state badge → popover of all 10 states (current disabled) →
 * AlertModal confirm → `POST /api/agents/:key/state`. This spec locks the
 * popover → confirm-modal wiring against a real browser. `/api/agents/:key` is
 * mocked to a known `running` state so the assertions don't depend on whichever
 * fixture state the worktree DB happens to hold, and we exercise the Cancel
 * path so the test never mutates persisted state.
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
        tool_call_count: 0,
      }),
    });
  });
}

test.describe('Drawer state-override control (CREW-260)', () => {
  test('opens the state popover and routes a selection through the confirm modal', async ({
    page,
  }) => {
    await mockAgentDetail(page, AGENT_KEY);
    await page.goto(`/#/agent/${AGENT_KEY}`);
    await expect(page.getByTestId('drawer-header')).toBeVisible();

    // Open the override popover.
    await page.getByRole('button', { name: 'Override state' }).click();

    // All 10 states are offered (in the labelled group); current (running)
    // disabled. CREW-311 added queued + orphaned.
    const group = page.getByRole('group', { name: 'Override state' });
    await expect(group.getByRole('button')).toHaveCount(10);
    await expect(group.getByRole('button', { name: /running/i })).toBeDisabled();

    // Selecting a different state raises the AlertModal naming both states.
    await group.getByRole('button', { name: 'Finished' }).click();
    const dialog = page.getByRole('alertdialog', { name: 'Override agent state' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/from "Running" to "Finished"/i);

    // Cancel leaves the agent untouched — badge still reads Running.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('drawer-header').getByRole('status')).toHaveAttribute(
      'aria-label',
      /running/i,
    );
  });
});
