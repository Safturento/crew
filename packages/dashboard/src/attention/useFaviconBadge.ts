import { useEffect } from 'react';

const PLAIN = renderFavicon(false);
const BADGED = renderFavicon(true);

function renderFavicon(badged: boolean): string {
  const badge = badged
    ? '<circle cx="48" cy="16" r="12" fill="#fbbf24" stroke="#0f172a" stroke-width="3" />'
    : '';
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="6" y="6" width="52" height="52" rx="14" fill="#1e293b" stroke="#e2e8f0" stroke-width="3" />
  <path d="M20 32 L28 40 L44 22" fill="none" stroke="#e2e8f0" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
  ${badge}
</svg>`.trim();
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function useFaviconBadge(count: number): void {
  useEffect(() => {
    const link = ensureLink();
    link.href = count > 0 ? BADGED : PLAIN;
  }, [count]);
}

function ensureLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  return link;
}
