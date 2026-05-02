import { describe, it, expect } from 'vitest';
import { parseEnvFile } from './parse-env-file.js';

describe('parseEnvFile', () => {
  it('parses KEY=VALUE pairs', () => {
    expect(parseEnvFile('A=1\nB=two\n')).toEqual({ A: '1', B: 'two' });
  });

  it('skips comment and blank lines', () => {
    expect(parseEnvFile('# header\n\nA=1\n')).toEqual({ A: '1' });
  });

  it('preserves equals signs in values', () => {
    expect(parseEnvFile('TOKEN=abc=def==\n')).toEqual({ TOKEN: 'abc=def==' });
  });

  it('returns empty for an empty file', () => {
    expect(parseEnvFile('')).toEqual({});
  });
});
