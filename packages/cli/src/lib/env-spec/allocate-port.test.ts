import { describe, it, expect } from 'vitest';
import { allocatePort } from './allocate-port.js';

describe('allocatePort', () => {
  it('is deterministic per (basename, varName) pair', () => {
    const a = allocatePort('Recipes-App-KAN-23', 'HTTP_PORT');
    const b = allocatePort('Recipes-App-KAN-23', 'HTTP_PORT');
    expect(a).toBe(b);
  });

  it('returns different ports for different var names on the same basename', () => {
    const http = allocatePort('Recipes-App-KAN-23', 'HTTP_PORT');
    const pg = allocatePort('Recipes-App-KAN-23', 'POSTGRES_PORT');
    expect(http).not.toBe(pg);
  });

  it('returns different ports for the same var name on different basenames', () => {
    const a = allocatePort('Recipes-App-KAN-23', 'HTTP_PORT');
    const b = allocatePort('Recipes-App-KAN-99', 'HTTP_PORT');
    expect(a).not.toBe(b);
  });

  it('falls inside the allocated 16384–32767 ephemeral-but-stable range', () => {
    const p = allocatePort('Recipes-App-KAN-23', 'WHATEVER');
    expect(p).toBeGreaterThanOrEqual(16384);
    expect(p).toBeLessThanOrEqual(32767);
  });
});
