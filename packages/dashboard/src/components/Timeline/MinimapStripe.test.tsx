import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

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

  it('shows a tooltip on hover with the section label, timestamp, and event count', async () => {
    const user = userEvent.setup();
    render(<MinimapStripe {...baseProps} />);
    const segments = screen.getAllByTestId('minimap-segment');
    await user.hover(segments[1]);
    const tooltip = await screen.findByTestId('minimap-tooltip');
    expect(tooltip).toHaveTextContent(/Waiting/);
    expect(tooltip).toHaveTextContent(/14:42:00/);
    expect(tooltip).toHaveTextContent(/2 events/);
  });

  it('hides the tooltip when the pointer leaves the segment', async () => {
    const user = userEvent.setup();
    render(<MinimapStripe {...baseProps} />);
    const segments = screen.getAllByTestId('minimap-segment');
    await user.hover(segments[0]);
    expect(screen.queryByTestId('minimap-tooltip')).toBeInTheDocument();
    await user.unhover(segments[0]);
    expect(screen.queryByTestId('minimap-tooltip')).not.toBeInTheDocument();
  });

  it('pluralizes "1 event" / "N events" correctly', async () => {
    const user = userEvent.setup();
    render(<MinimapStripe {...baseProps} />);
    const segments = screen.getAllByTestId('minimap-segment');
    await user.hover(segments[2]);
    const tooltip = await screen.findByTestId('minimap-tooltip');
    expect(tooltip).toHaveTextContent(/1 event(?!s)/);
  });

  it('calls onSectionJump(idx) when a segment is clicked', async () => {
    const user = userEvent.setup();
    const onSectionJump = vi.fn();
    render(<MinimapStripe {...baseProps} onSectionJump={onSectionJump} />);
    const segments = screen.getAllByTestId('minimap-segment');
    await user.click(segments[1]);
    expect(onSectionJump).toHaveBeenCalledTimes(1);
    expect(onSectionJump).toHaveBeenCalledWith(1);
  });

  it('is keyboard focusable and moves between sections with arrow keys', async () => {
    const user = userEvent.setup();
    const onSectionJump = vi.fn();
    render(<MinimapStripe {...baseProps} onSectionJump={onSectionJump} />);
    const stripe = screen.getByTestId('minimap-stripe');
    expect(stripe).toHaveAttribute('tabindex', '0');
    stripe.focus();
    await user.keyboard('{ArrowDown}');
    expect(onSectionJump).toHaveBeenLastCalledWith(0);
    await user.keyboard('{ArrowDown}');
    expect(onSectionJump).toHaveBeenLastCalledWith(1);
    await user.keyboard('{ArrowDown}');
    expect(onSectionJump).toHaveBeenLastCalledWith(2);
    await user.keyboard('{ArrowDown}');
    // At last section already, no further movement.
    expect(onSectionJump).toHaveBeenCalledTimes(3);
    await user.keyboard('{ArrowUp}');
    expect(onSectionJump).toHaveBeenLastCalledWith(1);
  });

  it('first ArrowUp from initial state jumps to the last section (listbox convention)', async () => {
    const user = userEvent.setup();
    const onSectionJump = vi.fn();
    render(<MinimapStripe {...baseProps} onSectionJump={onSectionJump} />);
    const stripe = screen.getByTestId('minimap-stripe');
    stripe.focus();
    await user.keyboard('{ArrowUp}');
    expect(onSectionJump).toHaveBeenLastCalledWith(2);
  });

  it('Home/End jump to first/last section', async () => {
    const user = userEvent.setup();
    const onSectionJump = vi.fn();
    render(<MinimapStripe {...baseProps} onSectionJump={onSectionJump} />);
    const stripe = screen.getByTestId('minimap-stripe');
    stripe.focus();
    await user.keyboard('{End}');
    expect(onSectionJump).toHaveBeenLastCalledWith(2);
    await user.keyboard('{Home}');
    expect(onSectionJump).toHaveBeenLastCalledWith(0);
  });

  it('exposes accessible role + label for assistive tech', () => {
    render(<MinimapStripe {...baseProps} />);
    const stripe = screen.getByTestId('minimap-stripe');
    // role=group fits a tabbable container of related <button> controls
    // (listbox would expect role=option children, not buttons).
    expect(stripe).toHaveAttribute('role', 'group');
    expect(stripe).toHaveAccessibleName(/timeline minimap/i);
  });
});
