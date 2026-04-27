export function formatTokens(count: number): string {
  const n = Math.max(0, count);
  if (n < 1_000) {
    return n.toString();
  }
  if (n < 1_000_000) {
    return `${(n / 1_000).toFixed(1)}k`;
  }
  return `${(n / 1_000_000).toFixed(1)}M`;
}
