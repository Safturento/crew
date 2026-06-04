import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Stepper } from './Stepper';

describe('Stepper', () => {
  it('renders all step labels with their 1-based indices', () => {
    render(<Stepper steps={['Project', 'Ticket', 'Confirm']} current={1} />);
    expect(screen.getByText('1 · Project')).toBeInTheDocument();
    expect(screen.getByText('2 · Ticket')).toBeInTheDocument();
    expect(screen.getByText('3 · Confirm')).toBeInTheDocument();
  });

  it('marks only the current step with data-active=true', () => {
    render(<Stepper steps={['A', 'B', 'C']} current={2} />);
    expect(screen.getByText('2 · B')).toHaveAttribute('data-active', 'true');
    expect(screen.getByText('1 · A')).toHaveAttribute('data-active', 'false');
    expect(screen.getByText('3 · C')).toHaveAttribute('data-active', 'false');
  });

  it('renders a chevron separator between steps but not after the last', () => {
    render(<Stepper steps={['A', 'B']} current={1} />);
    expect(screen.getAllByText('›')).toHaveLength(1);
  });
});
