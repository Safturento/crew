const LINE_ONE_MAX = 80;

export function truncate(text: string, max = LINE_ONE_MAX): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  if (collapsed.length <= max) return collapsed;
  return `${collapsed.slice(0, max - 1).trimEnd()}…`;
}

export function formatHHMMSS(timestamp: string | undefined): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function formatTokens(tokens: number | undefined): string {
  if (tokens === undefined || tokens === null) return '';
  if (tokens >= 1_000) {
    const k = tokens / 1_000;
    const rounded = k >= 10 ? k.toFixed(0) : k.toFixed(1);
    return `${rounded}k tok`;
  }
  return `${tokens} tok`;
}

export function formatLineTwo(timestamp: string | undefined, tokens?: number): string {
  const time = formatHHMMSS(timestamp);
  const tok = formatTokens(tokens);
  if (time && tok) return `${time} · ${tok}`;
  return time || tok || '';
}

const TOOL_INPUT_PRIMARY_FIELDS = [
  'command',
  'file_path',
  'path',
  'pattern',
  'url',
  'query',
  'description',
  'prompt',
] as const;

export function summarizeToolInput(input: Record<string, unknown>): string {
  for (const key of TOOL_INPUT_PRIMARY_FIELDS) {
    const value = input[key];
    if (typeof value === 'string' && value.trim().length > 0) return value;
  }
  try {
    return JSON.stringify(input);
  } catch {
    return String(input);
  }
}
