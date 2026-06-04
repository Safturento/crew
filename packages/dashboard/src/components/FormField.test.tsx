import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FormField } from './FormField.js';

describe('FormField', () => {
  it('associates the label with the input via htmlFor/id', () => {
    render(<FormField label="Project name" placeholder="my-project" />);
    const label = screen.getByText('Project name');
    const input = screen.getByPlaceholderText('my-project');
    expect(label).toBeInTheDocument();
    expect(input).toBeInTheDocument();
    expect((label as HTMLLabelElement).htmlFor).toBe(input.id);
    expect(input.id).not.toBe('');
  });

  it('honors an explicit id over the generated one', () => {
    render(<FormField label="Name" id="custom-id" placeholder="x" />);
    expect(screen.getByPlaceholderText('x').id).toBe('custom-id');
    expect((screen.getByText('Name') as HTMLLabelElement).htmlFor).toBe('custom-id');
  });

  it('passes value + onChange through to the Input', async () => {
    const onChange = vi.fn();
    render(<FormField label="Name" defaultValue="" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText('Name'), 'a');
    expect(onChange).toHaveBeenCalled();
  });
});
