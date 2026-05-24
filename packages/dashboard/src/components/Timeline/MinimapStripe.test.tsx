import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { MinimapStripe, MIN_SEG_PX, STRIPE_WIDTH } from './MinimapStripe.js';
import { STATE_CLASSES } from '../../data/state-meta.js';

const noop = (): void => {};

const baseProps = {
  sections: [
    {
      state: 'running' as const,
      startedAt: Date.parse('2026-05-23T14:30:00Z'),
      eventCount: 9,
      height: 270,
    },
    {
      state: 'waiting' as const,
      startedAt: Date.parse('2026-05-23T14:42:00Z'),
      eventCount: 2,
      height: 60,
    },
    {
      state: 'error' as const,
      startedAt: Date.parse('2026-05-23T14:43:00Z'),
      eventCount: 1,
      height: 30,
    },
  ],
  stripeHeight: 360,
  onSectionJump: noop,
};

describe('MinimapStripe', () => {
  it('renders one segment per section', () => {
    render(<MinimapStripe {...baseProps} />);
    expect(screen.getAllByTestId('minimap-segment')).toHaveLength(3);
  });

  it('applies the state color class to each segment', () => {
    render(<MinimapStripe {...baseProps} />);
    const segments = screen.getAllByTestId('minimap-segment');
    expect(segments[0].className).toContain(STATE_CLASSES.running.solidBg);
    expect(segments[1].className).toContain(STATE_CLASSES.waiting.solidBg);
    expect(segments[2].className).toContain(STATE_CLASSES.error.solidBg);
  });

  it('clamps small segments to MIN_SEG_PX and normalizes total to stripe height', () => {
    render(<MinimapStripe {...baseProps} />);
    const segments = screen.getAllByTestId('minimap-segment');
    const heights = segments.map((el) => parseFloat((el as HTMLElement).style.height));
    expect(heights[2]).toBeGreaterThanOrEqual(MIN_SEG_PX);
    const total = heights.reduce((a, b) => a + b, 0);
    expect(Math.round(total)).toBe(360);
  });

  it('has stripe width === STRIPE_WIDTH px', () => {
    const { container } = render(<MinimapStripe {...baseProps} />);
    const stripe = container.querySelector('[data-testid="minimap-stripe"]') as HTMLElement;
    expect(stripe).not.toBeNull();
    expect(stripe.style.width).toBe(`${STRIPE_WIDTH}px`);
  });

  it('renders nothing when sections is empty', () => {
    const { container } = render(<MinimapStripe {...baseProps} sections={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
