import { test, expect, type Page } from '@playwright/test';

/**
 * CREW-311: the Agents grid renders the two runner-rework states with their
 * inline actions — queued → Dequeue, orphaned → Reap, failed-start error
 * (startedAt '') → Restart + Inspect. `/api/agents` is mocked so the
 * assertions don't depend on whichever states the worktree DB happens to
 * hold, and nothing here mutates persisted state (we assert rendering, not
 * command effects — those are unit-covered).
 */
async function mockAgents(page: Page): Promise<void> {
  // Sections render only for projects the daemon reports, so the project
  // list is mocked alongside the agents.
  await page.route('**/api/projects', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        projects: [
          {
            name: 'kanban-api',
            repoPath: '~/code/kanban-api',
            branch: 'main',
            jiraKey: 'KAN',
            activeCount: 1,
          },
          { name: 'crew', repoPath: '~/code/crew', branch: 'main', jiraKey: 'CREW', activeCount: 1 },
          {
            name: 'home-assistant',
            repoPath: '~/code/home-assistant',
            branch: 'main',
            jiraKey: 'HAI',
            activeCount: 1,
          },
        ],
      }),
    });
  });
  // The chip badge reads the reconcile roll-up — mock it consistent with the
  // orphaned agent below.
  await page.route('**/api/runner/reconcile', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        queued: [
          {
            key: 'KAN-23',
            projectName: 'kanban-api',
            state: 'queued',
            since: '2026-06-30T10:00:00Z',
          },
        ],
        orphaned: [
          { key: 'CREW-11', projectName: 'crew', state: 'orphaned', since: '2026-06-30T09:00:00Z' },
        ],
      }),
    });
  });
  await page.route('**/api/agents', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        agents: [
          {
            key: 'KAN-23',
            projectName: 'kanban-api',
            ticketTitle: 'Reconnect should replay queued mutations',
            state: 'queued',
            startedAt: '',
            tokens: 0,
          },
          {
            key: 'CREW-11',
            projectName: 'crew',
            ticketTitle: 'process died without settling',
            state: 'orphaned',
            startedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
            tokens: 48_000,
          },
          {
            key: 'HAI-12',
            projectName: 'home-assistant',
            ticketTitle: 'worktree already exists · preflight aborted',
            state: 'error',
            startedAt: '',
            tokens: 0,
          },
        ],
      }),
    });
  });
}

test.describe('queued/orphaned grid rows (CREW-311)', () => {
  test('renders the new states with their inline actions', async ({ page }) => {
    await mockAgents(page);
    await page.goto('/');

    // Queued row: dim badge, Dequeue action, em-dash runtime (no run row).
    const queuedRow = page.getByRole('button', { name: /KAN-23/ });
    await expect(queuedRow).toBeVisible();
    await expect(queuedRow.getByRole('status')).toHaveAccessibleName('Queued');
    await expect(queuedRow.getByRole('button', { name: 'Dequeue' })).toBeVisible();
    await expect(queuedRow.getByText('—')).toBeVisible();

    // Orphaned row: attention-tinted badge + Reap.
    const orphanedRow = page.getByRole('button', { name: /CREW-11/ });
    await expect(orphanedRow.getByRole('status')).toHaveAccessibleName('Orphaned');
    await expect(orphanedRow.getByRole('button', { name: 'Reap' })).toBeVisible();

    // Failed-start error row (startedAt ''): Restart + Inspect, no Resume.
    const errorRow = page.getByRole('button', { name: /HAI-12/ });
    await expect(errorRow.getByRole('button', { name: 'Restart' })).toBeVisible();
    await expect(errorRow.getByRole('button', { name: 'Inspect' })).toBeVisible();
    await expect(errorRow.getByRole('button', { name: 'Resume' })).toHaveCount(0);

    // The runner chip carries the orphaned count from the reconcile roll-up.
    const chip = page.getByRole('button', { name: /Runner offline.*orphaned/i });
    await expect(chip).toBeVisible();
    await expect(chip).toHaveText(/1/);
  });
});
