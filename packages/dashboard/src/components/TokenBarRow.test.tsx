import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TokenBarRow } from './TokenBarRow.js';

describe('TokenBarRow', () => {
  it('renders tool, formatted tokens, and percent', () => {
    render(<TokenBarRow tool="Bash" tokens={18_400} percent={38.4} />);
    expect(screen.getByText('Bash')).toBeInTheDocument();
    expect(screen.getByText('18.4k')).toBeInTheDocument();
    expect(screen.getByText('38.4%')).toBeInTheDocument();
  });

  it('sets the bar width proportional to percent', () => {
    render(<TokenBarRow tool="Read" tokens={9_600} percent={20.1} />);
    const fill = screen.getByTestId('token-bar-fill');
    expect(fill).toHaveStyle({ width: '20.1%' });
  });

  it('clamps bar width between 0% and 100%', () => {
    const { rerender } = render(<TokenBarRow tool="Big" tokens={1000} percent={150} />);
    expect(screen.getByTestId('token-bar-fill')).toHaveStyle({ width: '100%' });
    rerender(<TokenBarRow tool="Neg" tokens={0} percent={-5} />);
    expect(screen.getByTestId('token-bar-fill')).toHaveStyle({ width: '0%' });
  });

  it('applies tabular-nums to the token cell', () => {
    render(<TokenBarRow tool="Edit" tokens={4_200} percent={8.8} />);
    expect(screen.getByText('4.2k').className).toMatch(/tabular-nums/);
  });

  it('applies tabular-nums to the percent cell', () => {
    render(<TokenBarRow tool="Read" tokens={1000} percent={12.3} />);
    expect(screen.getByText('12.3%').className).toMatch(/tabular-nums/);
  });

  it('formats whole-number percents with one decimal place', () => {
    render(<TokenBarRow tool="Glob" tokens={500} percent={20} />);
    expect(screen.getByText('20.0%')).toBeInTheDocument();
  });
});
