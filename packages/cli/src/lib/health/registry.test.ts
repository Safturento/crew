import { describe, it, expect } from 'vitest';
import { checksFor } from './registry.js';

describe('checksFor', () => {
  it('project scope includes the seed project checks', () => {
    const names = checksFor('project').map((c) => c.name);
    expect(names).toContain('config-valid');
    expect(names).toContain('env-materialized');
  });

  it('project scope includes the github-auth-present check', () => {
    expect(checksFor('project').map((c) => c.name)).toContain('github-auth-present');
  });

  it('every project-scope check is actually project-scoped', () => {
    expect(checksFor('project').every((c) => c.scope === 'project')).toBe(true);
  });

  it('machine scope excludes the project-scoped seed checks', () => {
    const names = checksFor('machine').map((c) => c.name);
    expect(names).not.toContain('config-valid');
    expect(names).not.toContain('env-materialized');
  });

  it("'all' returns every registered check", () => {
    const all = checksFor('all').map((c) => c.name);
    expect(all).toContain('config-valid');
    expect(all).toContain('env-materialized');
    expect(all.length).toBe(checksFor('project').length + checksFor('machine').length);
  });
});
