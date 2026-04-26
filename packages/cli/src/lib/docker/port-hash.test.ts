import { describe, it, expect } from 'vitest';
import { portHash } from './port-hash.js';

describe('portHash', () => {
  it('returns deterministic offsets for a given basename', () => {
    const a = portHash('Recipes-App-KAN-23');
    const b = portHash('Recipes-App-KAN-23');
    expect(a).toEqual(b);
  });

  it('returns different offsets for different basenames', () => {
    const a = portHash('Recipes-App-KAN-23');
    const b = portHash('Recipes-App-KAN-25');
    expect(a).not.toEqual(b);
  });

  it('produces ports inside the documented ranges', () => {
    const ports = portHash('any-string');
    expect(ports.http).toBeGreaterThanOrEqual(8001);
    expect(ports.http).toBeLessThanOrEqual(8099);
    expect(ports.https).toBeGreaterThanOrEqual(8401);
    expect(ports.https).toBeLessThanOrEqual(8499);
    expect(ports.postgres).toBeGreaterThanOrEqual(15401);
    expect(ports.postgres).toBeLessThanOrEqual(15499);
  });

  it('matches the bash docker-env.sh output for the canonical KAN-23 case', () => {
    // Bash impl: echo -n "Recipes-App-KAN-23" | md5sum | head -c 4
    // → 1583 hex → 5507 dec → 5507 % 99 + 1 = 21
    // → http=8021, https=8421, postgres=15421
    expect(portHash('Recipes-App-KAN-23')).toEqual({
      http: 8021,
      https: 8421,
      postgres: 15421,
    });
  });
});
