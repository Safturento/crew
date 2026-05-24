import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TimelineSection } from './TimelineSection.js';

describe('TimelineSection', () => {
  const baseProps = {
    state: 'running' as const,
    startedAt: Date.parse('2026-05-22T14:30:24Z'),
    elapsedMs: 8 * 60 * 1000 + 12 * 1000,
    eventCount: 14,
    tokenSum: 24_000,
    isOpen: true,
    onToggle: vi.fn(),
  };

  it('renders the state pill, timestamp, elapsed, event count, token sum', () => {
    render(
      <TimelineSection {...baseProps}>
        <div data-testid="body" />
      </TimelineSection>,
    );
    expect(screen.getByText('Running')).toBeInTheDocument();
    expect(screen.getByText('14:30:24')).toBeInTheDocument();
    expect(screen.getByText('8m 12s')).toBeInTheDocument();
    expect(screen.getByText(/14 events/)).toBeInTheDocument();
    expect(screen.getByText(/24\.0k tokens/)).toBeInTheDocument();
  });

  it('shows the body when isOpen=true', () => {
    render(
      <TimelineSection {...baseProps} isOpen={true}>
        <div data-testid="body" />
      </TimelineSection>,
    );
    expect(screen.getByTestId('body')).toBeInTheDocument();
  });

  it('hides the body when isOpen=false', () => {
    render(
      <TimelineSection {...baseProps} isOpen={false}>
        <div data-testid="body" />
      </TimelineSection>,
    );
    expect(screen.queryByTestId('body')).not.toBeInTheDocument();
  });

  it('calls onToggle when the header is clicked', () => {
    const onToggle = vi.fn();
    render(
      <TimelineSection {...baseProps} onToggle={onToggle}>
        <div />
      </TimelineSection>,
    );
    fireEvent.click(screen.getByRole('button', { name: /toggle/i }));
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it('pluralizes the event count correctly for one event', () => {
    render(
      <TimelineSection {...baseProps} eventCount={1}>
        <div />
      </TimelineSection>,
    );
    expect(screen.getByText(/^1 event$/)).toBeInTheDocument();
  });

  it('renders the section state on a data attribute for styling', () => {
    render(
      <TimelineSection {...baseProps} state="waiting">
        <div />
      </TimelineSection>,
    );
    expect(screen.getByTestId('timeline-section')).toHaveAttribute('data-state', 'waiting');
  });

  it('does not clip its children with overflow-hidden (scroll lives on the Timeline body now)', () => {
    render(
      <TimelineSection {...baseProps}>
        <div data-testid="body" />
      </TimelineSection>,
    );
    const section = screen.getByTestId('timeline-section');
    expect(section.className).not.toMatch(/\boverflow-hidden\b/);
  });
});
