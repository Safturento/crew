import type { SystemEvent } from 'crew-shared';

import { CardShell } from './CardShell.js';
import { formatLineTwo, truncate } from './utils.js';

interface SystemCardProps {
  event: SystemEvent;
}

function summarizeSystem(event: SystemEvent): { summary: string; expanded: string } {
  switch (event.subtype) {
    case 'turn_duration': {
      const seconds = (event.durationMs ?? 0) / 1000;
      const summary = `${seconds.toFixed(1)}s · ${event.messageCount ?? 0} msg`;
      return { summary, expanded: JSON.stringify(event, null, 2) };
    }
    case 'stop_hook_summary': {
      const summary = `${event.hookCount ?? 0} hooks`;
      return { summary, expanded: JSON.stringify(event.hookInfos ?? [], null, 2) };
    }
    case 'local_command':
    case 'compact_boundary':
    case 'bridge_status':
    case 'away_summary': {
      const text = event.content ?? '';
      return { summary: truncate(text), expanded: text || JSON.stringify(event, null, 2) };
    }
    case 'api_error': {
      const message =
        event.error && typeof event.error === 'object' && 'message' in event.error
          ? String((event.error as { message: unknown }).message)
          : typeof event.error === 'string'
            ? event.error
            : JSON.stringify(event.error ?? {});
      return { summary: truncate(message), expanded: message };
    }
    default: {
      const exhaustive: never = event;
      void exhaustive;
      return { summary: '', expanded: '' };
    }
  }
}

export function SystemCard({ event }: SystemCardProps) {
  const { summary, expanded } = summarizeSystem(event);
  return (
    <CardShell
      lineOne={`[system/${event.subtype}] ${summary}`.trim()}
      lineTwo={formatLineTwo(event.timestamp)}
      expanded={expanded}
    />
  );
}
