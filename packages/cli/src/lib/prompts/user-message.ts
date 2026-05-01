import { render } from './render.js';

/**
 * Render the shared `user-message` partial with `message` slotted in.
 * Returns the empty string when `message` is undefined, empty, or
 * whitespace-only — so callers can unconditionally slot the result into
 * a `{{userMessageBlock}}` placeholder without branching.
 */
export function renderUserMessageBlock(message: string | undefined): string {
  if (!message || message.trim().length === 0) return '';
  return render('user-message', { message });
}
