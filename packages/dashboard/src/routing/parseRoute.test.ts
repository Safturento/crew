import { describe, expect, it } from 'vitest';

import { parseRoute } from './parseRoute.js';

describe('parseRoute', () => {
  it('treats empty hash as the agents-list route', () => {
    expect(parseRoute('')).toEqual({ kind: 'agents-list' });
    expect(parseRoute('#/')).toEqual({ kind: 'agents-list' });
    expect(parseRoute('#')).toEqual({ kind: 'agents-list' });
  });

  it('parses /agents/:key', () => {
    expect(parseRoute('#/agents/KAN-31')).toEqual({ kind: 'agent-detail', key: 'KAN-31' });
  });

  it('parses /projects', () => {
    expect(parseRoute('#/projects')).toEqual({ kind: 'projects' });
  });

  it('falls back to agents-list for unknown routes', () => {
    expect(parseRoute('#/something/else')).toEqual({ kind: 'agents-list' });
  });
});
