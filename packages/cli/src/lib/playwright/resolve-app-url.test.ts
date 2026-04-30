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
