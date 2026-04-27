// Inline SVG icons. 16px nominal, currentColor.
const Icon = {
  Plus: ({ size = 16 }) => <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  Search: ({ size = 14 }) => <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5"/><path d="M10.5 10.5l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  Close: ({ size = 14 }) => <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  Chevron: ({ size = 12, dir = 'down' }) => {
    const r = { down: 0, up: 180, left: 90, right: -90 }[dir];
    return <svg width={size} height={size} viewBox="0 0 12 12" style={{ transform: `rotate(${r}deg)` }}><path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  },
  External: ({ size = 12 }) => <svg width={size} height={size} viewBox="0 0 12 12" fill="none"><path d="M4 2h6v6M10 2L5 7M9 7v3H2V3h3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Copy: ({ size = 12 }) => <svg width={size} height={size} viewBox="0 0 12 12" fill="none"><rect x="3" y="3" width="7" height="7" rx="1.2" stroke="currentColor" strokeWidth="1.3"/><path d="M2 8V2.5A1.5 1.5 0 0 1 3.5 1H8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
  Check: ({ size = 12 }) => <svg width={size} height={size} viewBox="0 0 12 12" fill="none"><path d="M2.5 6.5L5 9l4.5-5.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Folder: ({ size = 14 }) => <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M2 4.5A1.5 1.5 0 0 1 3.5 3h2.6L8 4.5h4.5A1.5 1.5 0 0 1 14 6v5.5A1.5 1.5 0 0 1 12.5 13h-9A1.5 1.5 0 0 1 2 11.5v-7z" stroke="currentColor" strokeWidth="1.3"/></svg>,
  Dot: ({ size = 8 }) => <svg width={size} height={size} viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="currentColor"/></svg>,
  Pulse: ({ size = 8 }) => <svg width={size} height={size} viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="currentColor"><animate attributeName="opacity" values="1;.35;1" dur="1.6s" repeatCount="indefinite"/></circle></svg>,
  ArrowUp: ({ size = 12 }) => <svg width={size} height={size} viewBox="0 0 12 12" fill="none"><path d="M6 9V3M3 6l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  ArrowRight: ({ size = 12 }) => <svg width={size} height={size} viewBox="0 0 12 12" fill="none"><path d="M3 6h6M6 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>,
  Bell: ({ size = 14 }) => <svg width={size} height={size} viewBox="0 0 16 16" fill="none"><path d="M4 11V7a4 4 0 0 1 8 0v4M2.5 11.5h11M6.5 13.5a1.5 1.5 0 0 0 3 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>,
};

window.Icon = Icon;
