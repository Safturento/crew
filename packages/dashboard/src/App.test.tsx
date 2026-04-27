import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

describe('App', () => {
  it('renders the crew brand mark', () => {
    render(<App />);
    expect(screen.getByText('crew')).toBeInTheDocument();
  });

  it('demonstrates that the seven state-palette tokens are addressable', () => {
    render(<App />);
    for (const label of [
      'initializing',
      'running',
      'idle',
      'waiting',
      'pr_open',
      'error',
      'finished',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});
