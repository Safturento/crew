/**
 * Compact "N<unit> ago" relative time for the Runner page meta lines
 * (e.g. "failed to start · 2m ago", "queued 2m ago"). Sub-minute reads as
 * "just now"; otherwise the largest whole unit (m / h / d).
 */
export function formatAgo(iso: string, now: number = Date.now()): string {
  const deltaMs = now - new Date(iso).getTime();
  const sec = Math.max(0, Math.floor(deltaMs / 1000));
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}
