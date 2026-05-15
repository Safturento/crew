import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';

import { renderWithProviders } from '../test/renderWithProviders.js';
import { defaultClient } from '../data/queries.js';
import type { AggregateMetrics } from '../data/types.js';
import { MetricsTrendWidget } from './MetricsTrendWidget.js';

const CURRENT: AggregateMetrics = {
  runCount: 8,
  avgDocLoadCoverage: 72,
  cleanlinessPassRate: 0.875,
  avgPrClaimInputTokens: 41000,
  parityViolationRate: 0.125,
};

const BASELINE: AggregateMetrics = {
  runCount: 5,
  avgDocLoadCoverage: null,
  cleanlinessPassRate: 0.6,
  avgPrClaimInputTokens: 88000,
  parityViolationRate: 0,
};

function mockMetrics(): void {
  vi.spyOn(defaultClient, 'getMetrics').mockImplementation((baseline: boolean) =>
    Promise.resolve(baseline ? BASELINE : CURRENT),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MetricsTrendWidget', () => {
  it('shows a loading state while the metrics queries are pending', () => {
    vi.spyOn(defaultClient, 'getMetrics').mockReturnValue(new Promise(() => {}));
    renderWithProviders(<MetricsTrendWidget />);
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('renders the current cohort metrics once loaded', async () => {
    mockMetrics();
    renderWithProviders(<MetricsTrendWidget />);

    expect(await screen.findByText('72%')).toBeInTheDocument();
    // Cleanliness pass rate, current cohort.
    expect(screen.getByText('88%')).toBeInTheDocument();
  });

  it('renders the baseline alongside the current value for comparison', async () => {
    mockMetrics();
    renderWithProviders(<MetricsTrendWidget />);

    // Baseline cleanliness pass rate (0.6) surfaces next to the current one.
    expect(await screen.findByText(/baseline 60%/i)).toBeInTheDocument();
  });

  it('renders an error state when the metrics request fails', async () => {
    vi.spyOn(defaultClient, 'getMetrics').mockRejectedValue(new Error('boom'));
    renderWithProviders(<MetricsTrendWidget />);
    await waitFor(() => {
      expect(screen.getByText(/couldn’t load metrics/i)).toBeInTheDocument();
    });
  });
});
