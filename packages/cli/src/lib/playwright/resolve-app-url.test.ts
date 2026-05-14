import { describe, it, expect } from 'vitest';
import { resolveAppUrl } from './resolve-app-url.js';

describe('resolveAppUrl', () => {
  it('passes through a URL with no placeholders unchanged', () => {
    const out = resolveAppUrl('http://localhost:5173', undefined);
    expect(out.raw).toBe('http://localhost:5173');
    expect(out.substitutions).toEqual({});
  });

  it('substitutes {httpsPort} when ports are provided', () => {
    const out = resolveAppUrl('https://localhost:{httpsPort}', {
      httpPort: 18000,
      httpsPort: 18443,
      postgresPort: 15400,
    });
    expect(out.raw).toBe('https://localhost:18443');
    expect(out.substitutions).toEqual({ '{httpsPort}': '18443' });
  });

  it('substitutes multiple placeholders in one URL', () => {
    const out = resolveAppUrl('http://localhost:{httpPort}/path?p={postgresPort}', {
      httpPort: 18000,
      httpsPort: 18443,
      postgresPort: 15400,
    });
    expect(out.raw).toBe('http://localhost:18000/path?p=15400');
  });

  it('throws when a known placeholder appears without ports', () => {
    expect(() => resolveAppUrl('https://localhost:{httpsPort}', undefined)).toThrow(
      /port.*not provided/i,
    );
  });

  it('throws on an unknown placeholder', () => {
    expect(() =>
      resolveAppUrl('http://localhost:{nopePort}', {
        httpPort: 18000,
        httpsPort: 18443,
        postgresPort: 15400,
      }),
    ).toThrow(/unknown placeholder/i);
  });
});

describe('resolveAppUrl — ${VAR} syntax', () => {
  it('substitutes ${VAR} from envVars', () => {
    const result = resolveAppUrl('${APP_URL}', undefined, { APP_URL: 'https://localhost:443' });
    expect(result.raw).toBe('https://localhost:443');
    expect(result.substitutions).toEqual({ '${APP_URL}': 'https://localhost:443' });
  });

  it('substitutes ${VAR} embedded in a longer template', () => {
    const result = resolveAppUrl('${APP_URL}/health', undefined, { APP_URL: 'https://x.test' });
    expect(result.raw).toBe('https://x.test/health');
  });

  it('throws when ${VAR} is used but envVars is undefined', () => {
    expect(() => resolveAppUrl('${APP_URL}', undefined, undefined)).toThrow(
      /\$\{APP_URL\} used but env vars were not provided/i,
    );
  });

  it('throws when ${VAR} references an unknown key in envVars', () => {
    expect(() => resolveAppUrl('${MISSING}', undefined, { OTHER: 'x' })).toThrow(
      /\$\{MISSING\} used but no such variable in materialized env/i,
    );
  });

  it('supports both syntaxes in one template (mixed)', () => {
    const result = resolveAppUrl(
      '${BASE}:{httpsPort}',
      { httpPort: 80, httpsPort: 8443, postgresPort: 5432 },
      { BASE: 'https://example.test' },
    );
    expect(result.raw).toBe('https://example.test:8443');
  });

  it('preserves existing {xxxPort} behavior when envVars is omitted', () => {
    const result = resolveAppUrl('https://localhost:{httpsPort}', {
      httpPort: 80,
      httpsPort: 443,
      postgresPort: 5432,
    });
    expect(result.raw).toBe('https://localhost:443');
  });
});
