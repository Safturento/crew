import { X } from 'lucide-react';

import { STATE_META } from '../data/state-meta.js';
import type { AgentDetail } from '../data/types.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { StateIcon } from './ui/state-icon.js';

/**
 * Pixel height of the condensed header. Also the sticky `top` offset for the
 * pinned TimelineToolbar — keep in sync with the `h-11` class below.
 */
export const CONDENSED_HEADER_PX = 44;

interface CondensedHeaderProps {
  detail: AgentDetail;
  showCloseButton: boolean;
  onClose?: () => void;
}

/**
 * Minimal one-row header that overlays the top of the agent body once the
 * full DrawerHeader has scrolled out of view (see AgentBody's sentinel).
 */
export function CondensedHeader({ detail, showCloseButton, onClose }: CondensedHeaderProps) {
  const meta = STATE_META[detail.state];
  return (
    <div
      data-testid="condensed-header"
      className="absolute inset-x-0 top-0 z-20 flex h-11 animate-condensed-in items-center gap-2 border-b border-slate-800 bg-card pl-6 pr-4"
    >
      <span className="shrink-0 font-mono text-xs text-muted-foreground">{detail.ticket_key}</span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
        {detail.ticket_title ?? detail.ticket_key}
      </span>
      <Badge
        role="status"
        aria-label={meta.label}
        color={detail.state}
        intensity="mid"
        icon={<StateIcon />}
      >
        {meta.label}
      </Badge>
      {showCloseButton && (
        <Button
          color="running"
          intensity="ghost"
          size="sm"
          icon={<X aria-hidden />}
          aria-label="Close drawer"
          onClick={onClose}
        />
      )}
    </div>
  );
}
