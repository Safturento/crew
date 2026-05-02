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

  it('runs `docker compose up` with `--wait` so healthchecks gate the clone step', () => {
    // Without --wait, `docker compose up --detach` returns as soon as
    // containers are `started`, racing the project-side clone against
    // the backend container's own seed (CREW-68).
    const script = buildDockerBringupScript('/repo', { stopAfterBringup: true });
    expect(script).toMatch(/docker compose up [^\n]*--wait/);
  });

  it('does not claim "main\'s stack isn\'t running" when the clone step fails', () => {
    // The bringup wrapper doesn't know why the project-side script
    // failed — surface a neutral message and let the script's own
    // stderr (already mirrored into the log) speak for itself.
    const script = buildDockerBringupScript('/repo', { stopAfterBringup: true });
    expect(script).not.toContain("main's stack isn't running");
    expect(script).toMatch(/data clone failed/);
  });

  it('exits non-zero when docker compose up fails so callers can detect bringup failure', () => {
    // Without `exit 1`, the bash wrapper would always return 0 and the
    // post-agent e2e gate (CREW-76) couldn't tell a healthy stack from a
    // dead one.
    const script = buildDockerBringupScript('/repo', { stopAfterBringup: true });
    expect(script).toMatch(/!\s+docker stack failed to come up[\s\S]*exit 1/);
  });
});
