import { test, expect } from '@playwright/test';

test.describe('runner-aware agent actions (CREW-217)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('Finish degrades with no runner, enables on runner.status_changed, then enqueues', async ({
    page,
  }) => {
    // The worktree stack has no host runner connected, so the enqueue-able
    // QuickActions degrade to disabled ("Waiting for runner") rather than
    // queueing work nothing can drain. CREW-220 also gates Finish on the
    // agent being pr_merged — so scope to the pr_merged agent (the one whose
    // Finish flips on runner status), not just any Finish in the list.
    const mergedRow = page
      .getByRole('button')
      .filter({ has: page.getByRole('status', { name: 'PR merged' }) })
      .first();
    const finish = mergedRow.getByRole('button', { name: 'Finish' });
    await expect(finish).toBeDisabled();

    // A runner.status_changed SSE ping flips the gate live — no refetch. The
    // dev build exposes __crewTestInjectEvent to fan synthetic events through
    // the same dispatcher real SSE messages use.
    await page.evaluate(() => {
      (
        window as unknown as { __crewTestInjectEvent: (n: string, d: unknown) => void }
      ).__crewTestInjectEvent('runner.status_changed', { online: true, lastSeen: Date.now() });
    });
    await expect(finish).toBeEnabled();

    // Clicking the now-enabled action enqueues it; the success toast confirms
    // the POST /api/actions round-trip.
    await finish.click();
    await expect(page.getByText('Finish queued')).toBeVisible();
  });

  test('Finish stays disabled until pr_merged ("Available after the PR is merged")', async ({
    page,
  }) => {
    // CREW-220: on a pr_open agent the Finish action carries the merge gate,
    // not the runner gate — it can never enqueue until the PR merges.
    const prOpenRow = page
      .getByRole('button')
      .filter({ has: page.getByRole('status', { name: 'PR open' }) })
      .first();
    const finish = prOpenRow.getByRole('button', { name: 'Finish' });
    await expect(finish).toBeDisabled();
    await expect(finish).toHaveAttribute('title', /merged/i);
  });

  // CREW-219: Fix PR can't fire on click — it opens a comment modal first, and
  // the enqueued fix_pr action carries the typed comment.
  test('Fix PR opens the comment modal and enqueues fix_pr with the comment', async ({ page }) => {
    // Like Finish, the row's Fix PR degrades to disabled with no runner.
    const rowFixPr = page.getByRole('button', { name: 'Fix PR' }).first();
    await expect(rowFixPr).toBeDisabled();

    await page.evaluate(() => {
      (
        window as unknown as { __crewTestInjectEvent: (n: string, d: unknown) => void }
      ).__crewTestInjectEvent('runner.status_changed', { online: true, lastSeen: Date.now() });
    });
    await expect(rowFixPr).toBeEnabled();
    await rowFixPr.click();

    // The modal opens; submit stays disabled until a non-empty comment exists.
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const submit = dialog.getByRole('button', { name: 'Fix PR' });
    await expect(submit).toBeDisabled();

    await dialog.getByRole('textbox', { name: 'Comment' }).fill('please rebase on main');
    await expect(submit).toBeEnabled();
    await submit.click();

    // Modal closes and the enqueue success toast confirms the round-trip.
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Fix PR queued')).toBeVisible();
  });
});

test.describe('finish-step checklist (CREW-220)', () => {
  test('the agent drawer renders the live finish-step checklist from the API', async ({ page }) => {
    await page.goto('/');

    // Seed a few finish steps through the same-origin API the dashboard
    // proxies, then open that agent's drawer. A unique marker per run keeps
    // the assertion idempotent against the persisted worktree DB.
    const marker = `e2e-${Date.now()}`;
    const key = await page.evaluate(async (m) => {
      const res = await fetch('/api/agents');
      const { agents } = (await res.json()) as { agents: Array<{ key: string }> };
      const agentKey = agents[0]!.key;
      const steps = [
        { index: 0, label: `git branch -D ${agentKey}`, status: 'ok', ts: Date.now() },
        {
          index: 1,
          label: `jira ${agentKey} → Done`,
          status: 'skip',
          detail: 'already Done',
          ts: Date.now(),
        },
        {
          index: 2,
          label: `git push ${m}`,
          status: 'error',
          detail: `remote rejected ${m}`,
          ts: Date.now(),
        },
      ];
      for (const s of steps) {
        await fetch(`/api/agents/${encodeURIComponent(agentKey)}/finish-step`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(s),
        });
      }
      return agentKey;
    }, marker);

    await page.goto(`/#/agent/${key}`);

    const region = page.getByRole('region', { name: 'Finish steps' });
    await expect(region).toBeVisible();
    // The seeded error step renders with its detail (proves render + detail +
    // GET round-trip). A unique marker survives re-runs against the same DB.
    await expect(region.getByText(`remote rejected ${marker}`)).toBeVisible();
    // ok / skip / error rows are each marked with their status for styling.
    await expect(region.locator('li[data-status="ok"]').first()).toBeVisible();
    await expect(region.locator('li[data-status="error"]').first()).toBeVisible();
  });
});
