type Primitive = string | number | boolean;
type TomlValue = Primitive | TomlValue[] | { [key: string]: TomlValue };

interface JsonToTomlOptions {
  leadingComment?: string;
}

function formatValue(v: TomlValue): string {
  if (typeof v === 'string') return `"${v.replace(/"/g, '\\"')}"`;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(formatValue).join(', ')}]`;
  return '';
}

function isSection(v: unknown): v is Record<string, TomlValue> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function jsonToToml(
  obj: Record<string, TomlValue>,
  opts: JsonToTomlOptions = {},
): string {
  const lines: string[] = [];
  if (opts.leadingComment) lines.push(opts.leadingComment);

  const sections: [string, Record<string, TomlValue>][] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (isSection(v)) {
      sections.push([k, v]);
    } else {
      lines.push(`${k} = ${formatValue(v)}`);
    }
  }
  for (const [section, values] of sections) {
    lines.push('');
    lines.push(`[${section}]`);
    for (const [k, v] of Object.entries(values)) {
      lines.push(`${k} = ${formatValue(v)}`);
    }
  }
  return lines.join('\n');
}
