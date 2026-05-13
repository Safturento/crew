import { describe, it, expect, vi, afterEach } from 'vitest';
import { FigmaRestClient } from './client.js';

const ORIGINAL_TOKEN = process.env.FIGMA_API_TOKEN;

afterEach(() => {
  if (ORIGINAL_TOKEN === undefined) {
    delete process.env.FIGMA_API_TOKEN;
  } else {
    process.env.FIGMA_API_TOKEN = ORIGINAL_TOKEN;
  }
});

describe('FigmaRestClient', () => {
  it('throws if FIGMA_API_TOKEN env var is not set and no token is supplied', () => {
    delete process.env.FIGMA_API_TOKEN;
    expect(() => new FigmaRestClient()).toThrow(/FIGMA_API_TOKEN/);
  });

  it('uses the token from env for the X-Figma-Token header on getFile', async () => {
    process.env.FIGMA_API_TOKEN = 'tok-env';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        document: { id: '0:0', name: 'Document', type: 'DOCUMENT', children: [] },
      }),
    });
    const client = new FigmaRestClient({ fetch: fetchMock });
    await client.getFile('FILEKEY');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.figma.com/v1/files/FILEKEY',
      expect.objectContaining({ headers: { 'X-Figma-Token': 'tok-env' } }),
    );
  });

  it('prefers an explicitly supplied token over the env var', async () => {
    process.env.FIGMA_API_TOKEN = 'tok-env';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        document: { id: '0:0', name: 'Document', type: 'DOCUMENT', children: [] },
      }),
    });
    const client = new FigmaRestClient({ token: 'tok-explicit', fetch: fetchMock });
    await client.getFile('FILEKEY');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.figma.com/v1/files/FILEKEY',
      expect.objectContaining({ headers: { 'X-Figma-Token': 'tok-explicit' } }),
    );
  });

  it('calls /images with comma-joined ids, format=png, and the given scale', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ images: { '1:1': 'https://cdn/x.png', '2:2': 'https://cdn/y.png' } }),
    });
    const client = new FigmaRestClient({ token: 't', fetch: fetchMock });
    const res = await client.getImages('FILEKEY', ['1:1', '2:2'], 3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toMatch(/^https:\/\/api\.figma\.com\/v1\/images\/FILEKEY\?/);
    expect(url).toContain('ids=1%3A1%2C2%3A2');
    expect(url).toContain('format=png');
    expect(url).toContain('scale=3');
    expect(res.images).toEqual({ '1:1': 'https://cdn/x.png', '2:2': 'https://cdn/y.png' });
  });

  it('throws when the API returns non-OK with the status and body in the message', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Invalid token',
    });
    const client = new FigmaRestClient({ token: 't', fetch: fetchMock });
    await expect(client.getFile('FILEKEY')).rejects.toThrow(/403.*Invalid token/);
  });
});
