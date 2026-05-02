import { describe, it, expect } from 'vitest';
import {
  extractRefs,
  topoSortKeys,
  substitute,
  collectAllKeys,
  validateSpec,
  type ResolutionContext,
} from './resolve.js';
import type { EnvSpec } from './types.js';

describe('extractRefs', () => {
  it('finds ${VAR} references in a string', () => {
    expect(extractRefs('${A} and ${B}')).toEqual(['A', 'B']);
  });

  it('returns empty for strings with no refs', () => {
    expect(extractRefs('plain text')).toEqual([]);
  });

  it('does not double-count duplicate refs', () => {
    expect(extractRefs('${X} ${X}')).toEqual(['X']);
  });

  it('ignores escaped or malformed refs', () => {
    expect(extractRefs('$X plain $')).toEqual([]);
  });
});

describe('topoSortKeys', () => {
  it('orders keys so dependencies resolve first', () => {
    const deps = new Map<string, string[]>([
      ['C', ['B']],
      ['B', ['A']],
      ['A', []],
    ]);
    expect(topoSortKeys(deps)).toEqual(['A', 'B', 'C']);
  });

  it('throws on a cycle', () => {
    const deps = new Map<string, string[]>([
      ['A', ['B']],
      ['B', ['A']],
    ]);
    expect(() => topoSortKeys(deps)).toThrow(/cycle/i);
  });

  it('throws when a key references an unknown name', () => {
    const deps = new Map<string, string[]>([['A', ['MISSING']]]);
    expect(() => topoSortKeys(deps)).toThrow(/MISSING/);
  });
});

describe('substitute', () => {
  it('replaces all ${...} occurrences from the value map', () => {
    expect(substitute('${A}/${B}', { A: 'foo', B: 'bar' })).toBe('foo/bar');
  });

  it('throws when a referenced key is missing from the map', () => {
    expect(() => substitute('${A}', {})).toThrow(/A/);
  });
});

describe('collectAllKeys', () => {
  const spec: EnvSpec = {
    schema: 1,
    orchestration: {
      P: { kind: 'port', default: 80 },
      U: { kind: 'template', value: 'https://localhost:${P}' },
    },
    app: {
      D: { source: 'literal', value: '${U}/db' },
      S: { source: 'generate', command: 'echo s' },
    },
    files: {},
    contexts: {},
  };

  it('returns every declared key with its dependency list', () => {
    const ctx: ResolutionContext = { spec, builtins: ['BASE_NAME', 'WORKTREE_ID'] };
    const keys = collectAllKeys(ctx);
    expect(keys.get('P')).toEqual([]);
    expect(keys.get('U')).toEqual(['P']);
    expect(keys.get('D')).toEqual(['U']);
    expect(keys.get('S')).toEqual([]);
  });

  it('treats built-in keys as zero-dep nodes so refs to them resolve', () => {
    const specWithBuiltinRef: EnvSpec = {
      schema: 1,
      orchestration: { N: { kind: 'template', value: '${BASE_NAME}-x' } },
      app: {},
      files: {},
      contexts: {},
    };
    const ctx: ResolutionContext = {
      spec: specWithBuiltinRef,
      builtins: ['BASE_NAME', 'WORKTREE_ID'],
    };
    const keys = collectAllKeys(ctx);
    expect(keys.get('N')).toEqual(['BASE_NAME']);
    expect(keys.get('BASE_NAME')).toEqual([]);
  });
});

describe('validateSpec', () => {
  it('passes a valid spec', () => {
    const spec: EnvSpec = {
      schema: 1,
      orchestration: {
        P: { kind: 'port', default: 80 },
        U: { kind: 'template', value: 'https://localhost:${P}' },
      },
      app: { D: { source: 'literal', value: '${U}/db' } },
      files: {},
      contexts: { docker: { D: 'postgres://${P}' } },
    };
    expect(() => validateSpec(spec)).not.toThrow();
  });

  it('throws on a cycle in templates/literals', () => {
    const spec: EnvSpec = {
      schema: 1,
      orchestration: {
        A: { kind: 'template', value: '${B}' },
        B: { kind: 'template', value: '${A}' },
      },
      app: {},
      files: {},
      contexts: {},
    };
    expect(() => validateSpec(spec)).toThrow(/cycle/i);
  });

  it('throws on an unknown ref in app literal', () => {
    const spec: EnvSpec = {
      schema: 1,
      orchestration: {},
      app: { X: { source: 'literal', value: '${MISSING}' } },
      files: {},
      contexts: {},
    };
    expect(() => validateSpec(spec)).toThrow(/MISSING/);
  });

  it('throws on an unknown ref in a context override', () => {
    const spec: EnvSpec = {
      schema: 1,
      orchestration: {},
      app: { X: { source: 'literal', value: 'a' } },
      files: {},
      contexts: { docker: { X: '${UNKNOWN}' } },
    };
    expect(() => validateSpec(spec)).toThrow(/UNKNOWN/);
  });
});
