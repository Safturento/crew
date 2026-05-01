import { describe, it, expect } from 'vitest';
import { buildDockerBringupScript } from './start-bringup.js';

describe('buildDockerBringupScript', () => {
  it('includes `docker compose stop` when stopAfterBringup is true', () => {
    const script = buildDockerBringupScript('/repo', { stopAfterBringup: true });
    expect(script).toContain('docker compose stop');
    expect(script).toContain('warm-but-stopped');
  });

  it('omits `docker compose stop` when stopAfterBringup is false', () => {
    const script = buildDockerBringupScript('/repo', { stopAfterBringup: false });
    expect(script).not.toContain('docker compose stop');
    expect(script).toContain('leaving stack running');
  });
});
