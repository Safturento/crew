import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FixPrModal } from './FixPrModal';

describe('FixPrModal', () => {
  it('renders the agent key in the title and a comment field when open', () => {
    render(<FixPrModal agentKey="CREW-212" open onOpenChange={() => {}} onSubmit={() => {}} />);
    expect(screen.getByText(/CREW-212/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /comment/i })).toBeInTheDocument();
  });

  it('disables submit while the comment is empty', () => {
    render(<FixPrModal agentKey="CREW-212" open onOpenChange={() => {}} onSubmit={() => {}} />);
    expect(screen.getByRole('button', { name: 'Fix PR' })).toBeDisabled();
  });

  it('keeps submit disabled when the comment is only whitespace', async () => {
    const user = userEvent.setup();
    render(<FixPrModal agentKey="CREW-212" open onOpenChange={() => {}} onSubmit={() => {}} />);
    await user.type(screen.getByRole('textbox', { name: /comment/i }), '   ');
    expect(screen.getByRole('button', { name: 'Fix PR' })).toBeDisabled();
  });

  it('enables submit once a non-empty comment is typed', async () => {
    const user = userEvent.setup();
    render(<FixPrModal agentKey="CREW-212" open onOpenChange={() => {}} onSubmit={() => {}} />);
    await user.type(screen.getByRole('textbox', { name: /comment/i }), 'please rebase');
    expect(screen.getByRole('button', { name: 'Fix PR' })).toBeEnabled();
  });

  it('submits the trimmed comment and closes', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onOpenChange = vi.fn();
    render(<FixPrModal agentKey="CREW-212" open onOpenChange={onOpenChange} onSubmit={onSubmit} />);
    await user.type(screen.getByRole('textbox', { name: /comment/i }), '  fix the lint error  ');
    await user.click(screen.getByRole('button', { name: 'Fix PR' }));
    expect(onSubmit).toHaveBeenCalledWith('fix the lint error');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('cancel closes without submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onOpenChange = vi.fn();
    render(<FixPrModal agentKey="CREW-212" open onOpenChange={onOpenChange} onSubmit={onSubmit} />);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('resets the comment after a submit so the next open starts empty', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const { rerender } = render(
      <FixPrModal agentKey="CREW-212" open onOpenChange={() => {}} onSubmit={onSubmit} />,
    );
    await user.type(screen.getByRole('textbox', { name: /comment/i }), 'first');
    await user.click(screen.getByRole('button', { name: 'Fix PR' }));
    // close + reopen
    rerender(
      <FixPrModal agentKey="CREW-212" open={false} onOpenChange={() => {}} onSubmit={onSubmit} />,
    );
    rerender(<FixPrModal agentKey="CREW-212" open onOpenChange={() => {}} onSubmit={onSubmit} />);
    expect(screen.getByRole('textbox', { name: /comment/i })).toHaveValue('');
  });
});
