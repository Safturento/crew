import { execa } from 'execa';

/**
 * Returns unique compose project names whose containers are currently running.
 * Wraps `docker ps --format '{{.Label "com.docker.compose.project"}}'`.
 */
export async function listRunningProjects(): Promise<string[]> {
  const { stdout } = await execa('docker', [
    'ps',
    '--format',
    '{{.Label "com.docker.compose.project"}}',
  ]);
  const seen = new Set<string>();
  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (trimmed) seen.add(trimmed);
  }
  return [...seen];
}

/**
 * Look up the host-bound HTTPS port for a compose project's caddy service
 * and render the URL the user should hit in a browser. Returns null if the
 * project's caddy container isn't running.
 */
export async function getStackUrl(project: string): Promise<string | null> {
  try {
    const { stdout: containerId } = await execa('docker', [
      'ps',
      '-q',
      '--filter',
      `label=com.docker.compose.project=${project}`,
      '--filter',
      'label=com.docker.compose.service=caddy',
    ]);
    const id = containerId.trim().split('\n')[0];
    if (!id) return null;

    const { stdout } = await execa('docker', ['port', id, '443/tcp']);
    const portLine = stdout.split('\n')[0]?.trim();
    if (!portLine) return null;

    // Format is `0.0.0.0:8421` or `[::]:8421` — take the part after the last colon.
    const port = portLine.split(':').pop();
    if (!port) return null;

    return port === '443' ? 'https://localhost' : `https://localhost:${port}`;
  } catch {
    return null;
  }
}
