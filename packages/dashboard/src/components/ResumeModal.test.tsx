import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ResumeModal } from './ResumeModal';

describe('ResumeModal', () => {
  it('renders the agent key in the title and an optional steer-message field when open', () => {
    render(<ResumeModal agentKey="CREW-231" open onOpenChange={() => {}} onSubmit={() => {}} />);
    expect(screen.getByText(/CREW-231/)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /message/i })).toBeInTheDocument();
  });

  it('keeps the Resume button enabled even with an empty message (resume is optional-steer)', () => {
    render(<ResumeModal agentKey="CREW-231" open onOpenChange={() => {}} onSubmit={() => {}} />);
    expect(screen.getByRole('button', { name: 'Resume' })).toBeEnabled();
  });

  it('submits undefined when no message is typed, then closes', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ResumeModal agentKey="CREW-231" open onOpenChange={onOpenChange} onSubmit={onSubmit} />,
    );
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(onSubmit).toHaveBeenCalledWith(undefined);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('submits the trimmed steer message when one is typed', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ResumeModal agentKey="CREW-231" open onOpenChange={() => {}} onSubmit={onSubmit} />);
    await user.type(screen.getByRole('textbox', { name: /message/i }), '  focus on the parser  ');
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(onSubmit).toHaveBeenCalledWith('focus on the parser');
  });

  it('treats a whitespace-only message as no message (submits undefined)', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<ResumeModal agentKey="CREW-231" open onOpenChange={() => {}} onSubmit={onSubmit} />);
    await user.type(screen.getByRole('textbox', { name: /message/i }), '   ');
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    expect(onSubmit).toHaveBeenCalledWith(undefined);
  });

  it('cancel closes without submitting', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ResumeModal agentKey="CREW-231" open onOpenChange={onOpenChange} onSubmit={onSubmit} />,
    );
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('resets the draft after a submit so the next open starts empty', async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <ResumeModal agentKey="CREW-231" open onOpenChange={() => {}} onSubmit={() => {}} />,
    );
    await user.type(screen.getByRole('textbox', { name: /message/i }), 'first');
    await user.click(screen.getByRole('button', { name: 'Resume' }));
    rerender(
      <ResumeModal agentKey="CREW-231" open={false} onOpenChange={() => {}} onSubmit={() => {}} />,
    );
    rerender(<ResumeModal agentKey="CREW-231" open onOpenChange={() => {}} onSubmit={() => {}} />);
    expect(screen.getByRole('textbox', { name: /message/i })).toHaveValue('');
  });
});
