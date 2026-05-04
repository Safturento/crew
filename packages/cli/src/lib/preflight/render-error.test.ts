import { describe, it, expect } from 'vitest';
import { PreflightError } from './types.js';
import { renderPreflightError } from './render-error.js';

describe('renderPreflightError', () => {
  it('renders headline, details, and fix lines', () => {
    const err = new PreflightError(
      'app-url-reachability',
      'app URL unreachable',
      'crew restart <KEY> --hard, or investigate the bringup log',
      {
        url: 'https://localhost:17253 (from [playwright].app_url)',
        tried: '5 attempts × exponential backoff, all ECONNREFUSED',
      },
    );

    const out = renderPreflightError(err);

    expect(out).toContain('✗ preflight: app URL unreachable');
    expect(out).toContain('   url:    https://localhost:17253 (from [playwright].app_url)');
    expect(out).toContain('   tried:  5 attempts × exponential backoff, all ECONNREFUSED');
    expect(out).toContain('   fix:    crew restart <KEY> --hard, or investigate the bringup log');
  });

  it('renders without a details section when no details provided', () => {
    const err = new PreflightError('x', 'something failed', 'do thing');
    const out = renderPreflightError(err);
    expect(out).toContain('✗ preflight: something failed');
    expect(out).toContain('   fix:    do thing');
  });

  it('right-pads detail keys for column alignment with fix:', () => {
    const err = new PreflightError('x', 'h', 'do-the-thing', { a: '1', longer: '2' });
    const out = renderPreflightError(err);
    // All three lines (a, longer, fix) should align — keys padded to the
    // longest key length (longer = 6) plus colon and trailing space.
    const lines = out.split('\n');
    const aLine = lines.find((l) => l.includes('a:'));
    const longerLine = lines.find((l) => l.includes('longer:'));
    const fixLine = lines.find((l) => l.startsWith('   fix:'));
    expect(aLine).toBeTruthy();
    expect(longerLine).toBeTruthy();
    expect(fixLine).toBeTruthy();
    expect(aLine!.indexOf('1')).toBe(longerLine!.indexOf('2'));
    expect(aLine!.indexOf('1')).toBe(fixLine!.indexOf('do-the-thing'));
  });
});
