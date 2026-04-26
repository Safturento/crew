import { describe, it, expect, vi, beforeEach } from 'vitest';
import { listRunningProjects, getStackUrl } from './compose.js';
import { execa } from 'execa';

vi.mock('execa', () => ({
  execa: vi.fn(),
}));

const mockedExeca = vi.mocked(execa);

describe('listRunningProjects', () => {
  beforeEach(() => {
    mockedExeca.mockReset();
  });

  it('returns project names from `docker ps` output', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: 'recipes-app\nrecipes-app-kan-23\nrecipes-app-kan-25\n',
    } as never);

    const projects = await listRunningProjects();

    expect(projects).toEqual(['recipes-app', 'recipes-app-kan-23', 'recipes-app-kan-25']);
    expect(mockedExeca).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['ps', '--format']),
    );
  });

  it('deduplicates and skips empty lines', async () => {
    mockedExeca.mockResolvedValueOnce({
      stdout: 'recipes-app\nrecipes-app\n\nrecipes-app-kan-23\n',
    } as never);

    const projects = await listRunningProjects();

    expect(projects).toEqual(['recipes-app', 'recipes-app-kan-23']);
  });

  it('returns empty array when docker reports no running projects', async () => {
    mockedExeca.mockResolvedValueOnce({ stdout: '' } as never);

    expect(await listRunningProjects()).toEqual([]);
  });
});

describe('getStackUrl', () => {
  beforeEach(() => {
    mockedExeca.mockReset();
  });

  it('returns the https URL for a running project', async () => {
    mockedExeca
      .mockResolvedValueOnce({ stdout: 'abc123\n' } as never)
      .mockResolvedValueOnce({ stdout: '0.0.0.0:8421\n[::]:8421\n' } as never);

    expect(await getStackUrl('recipes-app-kan-23')).toBe('https://localhost:8421');
  });

  it('returns null when the caddy container is not running', async () => {
    mockedExeca.mockRejectedValueOnce(new Error('No such container'));

    expect(await getStackUrl('recipes-app-kan-23')).toBeNull();
  });

  it('omits the port suffix when caddy is on 443', async () => {
    mockedExeca
      .mockResolvedValueOnce({ stdout: 'abc123\n' } as never)
      .mockResolvedValueOnce({ stdout: '0.0.0.0:443\n' } as never);

    expect(await getStackUrl('recipes-app')).toBe('https://localhost');
  });
});
