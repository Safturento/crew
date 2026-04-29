import { describe, it, expect } from 'vitest';
import { buildEnvFileContent } from './build-env-file.js';

describe('buildEnvFileContent', () => {
  it('emits a vars block with only baseUrl when smokeUser is omitted', () => {
    const content = buildEnvFileContent({ baseUrl: 'http://localhost:3000' });
    expect(content).toBe('vars {\n' + '  baseUrl: http://localhost:3000\n' + '}\n');
  });

  it('emits a vars block with baseUrl and testUser fields when smokeUser is provided', () => {
    const content = buildEnvFileContent({
      baseUrl: 'https://localhost:18443',
      smokeUser: {
        email: 'smoke@example.com',
        username: 'smoke',
        password: 'hunter2',
      },
    });
    expect(content).toBe(
      'vars {\n' +
        '  baseUrl: https://localhost:18443\n' +
        '  testUser.email: smoke@example.com\n' +
        '  testUser.username: smoke\n' +
        '  testUser.password: hunter2\n' +
        '}\n',
    );
  });

  it('matches the snapshot for the full shape', () => {
    expect(
      buildEnvFileContent({
        baseUrl: 'https://localhost:18443',
        smokeUser: { email: 'a@b.c', username: 'a', password: 'p' },
      }),
    ).toMatchSnapshot();
  });
});
