import type { AttachmentEvent } from 'crew-shared';

import { CardShell } from './CardShell.js';
import { formatLineTwo, truncate } from './utils.js';

interface AttachmentCardProps {
  event: AttachmentEvent;
}

// `attachment.type` is typed as `string` (the parser's `z.literal(<dynamic>)`
// doesn't preserve the literal), so we treat the attachment as a record and
// pull strings out by key per type.
function summarizeAttachment(att: AttachmentEvent['attachment']): string {
  const a = att as Record<string, unknown>;
  const str = (k: string): string => (typeof a[k] === 'string' ? (a[k] as string) : '');
  switch (a.type) {
    case 'queued_command':
      return str('prompt');
    case 'hook_success':
    case 'hook_non_blocking_error':
      return [str('hookName'), str('toolUseID')].filter(Boolean).join(' · ');
    case 'hook_system_message':
    case 'skill_listing':
      return str('content');
    case 'edited_text_file':
      return str('filename');
    case 'compact_file_reference':
      return str('displayPath') || str('filename');
    case 'date_change':
      return str('newDate');
    case 'plan_mode':
    case 'plan_mode_exit':
    case 'plan_mode_reentry':
      return str('planFilePath');
    case 'todo_reminder':
    case 'task_reminder':
      return `${typeof a.itemCount === 'number' ? a.itemCount : 0} items`;
    default:
      return '';
  }
}

export function AttachmentCard({ event }: AttachmentCardProps) {
  const att = event.attachment;
  const summary = truncate(summarizeAttachment(att));
  const label = String((att as { type: unknown }).type);
  return (
    <CardShell
      lineOne={`[${label}]${summary ? ` ${summary}` : ''}`}
      lineTwo={formatLineTwo(event.timestamp)}
      expanded={JSON.stringify(att, null, 2)}
    />
  );
}
