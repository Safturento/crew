import { Circle } from 'lucide-react';

/**
 * The canonical filled-disc glyph rendered inside every state Pill (badge).
 * Wraps lucide's `Circle` with the absolute stroke-width that makes the
 * outline thick enough to read as a filled disc at small sizes — the bare
 * `Circle` defaults to a thin outline that visibly disagrees with the
 * Figma `Pill` set's state-icon treatment.
 *
 * Used by AgentRow, DrawerHeader, and TimelineSection. Keep these three
 * call sites in sync by going through this component, never `<Circle/>`
 * directly.
 */
export function StateIcon() {
  return <Circle className="p-0.5" aria-hidden strokeWidth={6} absoluteStrokeWidth />;
}
