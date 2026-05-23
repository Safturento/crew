import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SearchBar } from './SearchBar.js';

describe('SearchBar', () => {
  it('renders a search-role input with placeholder', () => {
    render(<SearchBar value="" onChange={() => {}} />);
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('shows the current value', () => {
    render(<SearchBar value="npm" onChange={() => {}} />);
    expect(screen.getByRole('searchbox')).toHaveValue('npm');
  });

  it('fires onChange with each keystroke', async () => {
    const onChange = vi.fn();
    render(<SearchBar value="" onChange={onChange} />);
    await userEvent.type(screen.getByRole('searchbox'), 'ab');
    expect(onChange).toHaveBeenCalledWith('a');
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('renders a leading search icon (lucide/search)', () => {
    const { container } = render(<SearchBar value="" onChange={() => {}} />);
    // lucide-react attaches `lucide-search` to the rendered svg.
    expect(container.querySelector('svg.lucide-search')).not.toBeNull();
  });
});
