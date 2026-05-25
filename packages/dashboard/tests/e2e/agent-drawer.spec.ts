import { test, expect, type Page } from '@playwright/test';

const SEEDED_AGENT_KEY = 'CREW-101';

/**
 * Seeded agents have DB rows but no on-disk JSONL transcripts, so the
 * daemon's /timeline endpoint returns `{events: []}` for them. The five
 * timeline-content scenarios from CREW-109 need realistic event data;
 * `page.route` mocks the timeline response so the assertions are
 * deterministic without leaning on filesystem fixtures inside the
 * daemon container.
 */
async function mockTimeline(
  page: Page,
  agentKey: string,
  events: Array<Record<string, unknown>>,
): Promise<void> {
  await page.route(`**/api/agents/${agentKey}/timeline`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ events }),
    });
  });
}

const TOOL_USE_EVENT = {
  type: 'assistant',
  uuid: 'evt-tool-1',
  timestamp: '2026-05-04T10:05:00Z',
  message: {
    role: 'assistant',
    content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }],
  },
};

const ASSISTANT_TEXT_EVENT = {
  type: 'assistant',
  uuid: 'evt-text-1',
  timestamp: '2026-05-04T10:06:00Z',
  message: {
    role: 'assistant',
    content: [{ type: 'text', text: 'Wired the timeline into the drawer body.' }],
  },
};

const TWO_GROUP_EVENTS = [TOOL_USE_EVENT, ASSISTANT_TEXT_EVENT];

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

  test('opens with timeline rendered (header + first transcript row visible)', async ({ page }) => {
    await mockTimeline(page, SEEDED_AGENT_KEY, TWO_GROUP_EVENTS);
    await page.goto(`/#/agent/${SEEDED_AGENT_KEY}`);

    await expect(page.getByTestId('drawer-header')).toBeVisible();
    await expect(page.getByTestId('transcript-row').first()).toBeVisible();
  });

  test('Filters popover toggle changes the rendered transcript-row count in DOM', async ({
    page,
  }) => {
    await mockTimeline(page, SEEDED_AGENT_KEY, TWO_GROUP_EVENTS);
    await page.goto(`/#/agent/${SEEDED_AGENT_KEY}`);

    const cards = page.getByTestId('transcript-row');
    await expect(cards).toHaveCount(2);

    // Open Filters and toggle Tools OFF — only the conversation card should remain.
    await page.getByRole('button', { name: /open timeline filters/i }).click();
    await page.getByLabel('Tools').click();
    await expect(cards).toHaveCount(1);
  });

  test('empty filter state — show empty copy + Show all link, then recover', async ({ page }) => {
    await mockTimeline(page, SEEDED_AGENT_KEY, TWO_GROUP_EVENTS);
    await page.goto(`/#/agent/${SEEDED_AGENT_KEY}`);

    await expect(page.getByTestId('transcript-row').first()).toBeVisible();

    // Open Filters and toggle every category checkbox that's currently on.
    await page.getByRole('button', { name: /open timeline filters/i }).click();
    for (const label of [
      'Conversation',
      'Tools',
      'Thinking',
      'Hooks',
      'Skills',
      'System',
      'Startup',
    ]) {
      const cb = page.getByLabel(label);
      if (await cb.isChecked()) await cb.click();
    }
    // Close the popover by clicking its trigger again so the empty-state CTA
    // beneath becomes interactive. (Escape would also close the drawer.)
    await page.getByRole('button', { name: /open timeline filters/i }).click();

    await expect(page.getByText(/No events match your filters/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Show all/i })).toBeVisible();
    await expect(page.getByTestId('transcript-row')).toHaveCount(0);

    await page.getByRole('button', { name: /Show all/i }).click();
    await expect(page.getByTestId('transcript-row').first()).toBeVisible();
  });

  test('full-page route /agent/:key/full renders timeline content; no drawer chrome', async ({
    page,
  }) => {
    await mockTimeline(page, SEEDED_AGENT_KEY, TWO_GROUP_EVENTS);
    await page.goto(`/#/agent/${SEEDED_AGENT_KEY}/full`);

    await expect(page.getByTestId('agent-body')).toBeVisible();
    await expect(page.getByTestId('transcript-row').first()).toBeVisible();
    await expect(page.getByTestId('drawer-backdrop')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /close drawer/i })).toHaveCount(0);
  });

  test('long section is fully scrollable inside the Timeline body (no clip)', async ({ page }) => {
    const manyEvents = Array.from({ length: 40 }, (_, i) => ({
      type: 'assistant',
      uuid: `evt-long-${i}`,
      timestamp: new Date(Date.parse('2026-05-04T10:00:00Z') + i * 1000).toISOString(),
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: `Long-section event ${i + 1}` }],
      },
    }));
    await mockTimeline(page, SEEDED_AGENT_KEY, manyEvents);
    await page.goto(`/#/agent/${SEEDED_AGENT_KEY}`);

    await expect(page.getByTestId('drawer-header')).toBeVisible();
    const firstRow = page.getByTestId('transcript-row').first();
    await expect(firstRow).toBeVisible();
    const lastRow = page.getByTestId('transcript-row').last();
    await lastRow.scrollIntoViewIfNeeded();
    await expect(lastRow).toBeVisible();
  });

  test('timeline toolbar stays in view while scrolling the body', async ({ page }) => {
    const manyEvents = Array.from({ length: 40 }, (_, i) => ({
      type: 'assistant',
      uuid: `evt-sticky-${i}`,
      timestamp: new Date(Date.parse('2026-05-04T10:00:00Z') + i * 1000).toISOString(),
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: `Sticky-toolbar event ${i + 1}` }],
      },
    }));
    await mockTimeline(page, SEEDED_AGENT_KEY, manyEvents);
    await page.goto(`/#/agent/${SEEDED_AGENT_KEY}`);

    const toolbar = page.getByTestId('timeline-toolbar');
    await expect(toolbar).toBeInViewport();
    await page.getByTestId('transcript-row').last().scrollIntoViewIfNeeded();
    await expect(toolbar).toBeInViewport();
  });

  test('clicking a minimap segment smooth-scrolls the Timeline body', async ({ page }) => {
    const manyEvents = Array.from({ length: 40 }, (_, i) => ({
      type: 'assistant',
      uuid: `evt-jump-${i}`,
      timestamp: new Date(Date.parse('2026-05-04T10:00:00Z') + i * 1000).toISOString(),
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: `Minimap-jump event ${i + 1}` }],
      },
    }));
    await mockTimeline(page, SEEDED_AGENT_KEY, manyEvents);
    await page.goto(`/#/agent/${SEEDED_AGENT_KEY}`);

    const segments = page.getByTestId('minimap-segment');
    await expect(segments.first()).toBeVisible();
    // First scroll to bottom so the segment-click actually has to move us.
    await page.getByTestId('transcript-row').last().scrollIntoViewIfNeeded();
    await segments.first().click();
    // Wait past JUMP_DURATION_MS (250) for smooth scroll to settle.
    await page.waitForTimeout(450);
    await expect(page.getByTestId('transcript-row').first()).toBeInViewport();
  });

  test('state badge flips on synthetic SSE event without page reload', async ({ page }) => {
    await mockTimeline(page, SEEDED_AGENT_KEY, []);
    await page.goto(`/#/agent/${SEEDED_AGENT_KEY}`);

    // Badge inside the drawer header (the agents list also renders a badge per row).
    const badge = page.locator('[role="dialog"] [role="status"]').first();
    await expect(badge).toBeVisible();
    const initial = await badge.textContent();

    await page.evaluate(
      ({ key }) => {
        const w = window as unknown as {
          __crewTestInjectEvent?: (n: string, d: unknown) => void;
        };
        if (!w.__crewTestInjectEvent) throw new Error('__crewTestInjectEvent not exposed');
        w.__crewTestInjectEvent('agent.state_changed', {
          key,
          from: 'running',
          to: 'pr_open',
          ts: Date.now(),
        });
      },
      { key: SEEDED_AGENT_KEY },
    );

    await expect(badge).not.toHaveText(initial ?? '');
  });
});
