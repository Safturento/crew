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

  it('issues /images in bounded batches (<= 5 ids each) and merges the results', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `${i}:${i}`);
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const reqIds = new URL(url).searchParams.get('ids')!.split(',');
      expect(reqIds.length).toBeLessThanOrEqual(5);
      return {
        ok: true,
        json: async () => ({
          images: Object.fromEntries(reqIds.map((id) => [id, `https://cdn/${id}.png`])),
        }),
      };
    });
    const client = new FigmaRestClient({ token: 't', fetch: fetchMock });
    const res = await client.getImages('FILEKEY', ids, 2);

    // 12 ids at batch size 5 -> 3 sequential requests (5 + 5 + 2).
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(Object.keys(res.images)).toHaveLength(12);
    expect(res.images['0:0']).toBe('https://cdn/0:0.png');
    expect(res.images['11:11']).toBe('https://cdn/11:11.png');
  });

  it('splits a render-timeout batch in half and retries down to a working size', async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const reqIds = new URL(url).searchParams.get('ids')!.split(',');
      if (reqIds.length > 2) {
        return {
          ok: false,
          status: 400,
          text: async () => '{"err":"Render timeout, try requesting fewer or smaller images"}',
        };
      }
      return {
        ok: true,
        json: async () => ({
          images: Object.fromEntries(reqIds.map((id) => [id, `https://cdn/${id}.png`])),
        }),
      };
    });
    const client = new FigmaRestClient({ token: 't', fetch: fetchMock });
    const res = await client.getImages('FILEKEY', ['1:1', '2:2', '3:3', '4:4', '5:5'], 2);

    expect(Object.keys(res.images).sort()).toEqual(['1:1', '2:2', '3:3', '4:4', '5:5']);
    expect(res.images['3:3']).toBe('https://cdn/3:3.png');
  });

  it('records null (non-fatal) for a single node that still render-timeouts', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"err":"Render timeout, try requesting fewer or smaller images"}',
    });
    const client = new FigmaRestClient({ token: 't', fetch: fetchMock });
    const res = await client.getImages('FILEKEY', ['1:1', '2:2'], 2);

    expect(res.images).toEqual({ '1:1': null, '2:2': null });
  });

  it('throws on a non-render-timeout error from /images (e.g. 403)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => 'Invalid token',
    });
    const client = new FigmaRestClient({ token: 't', fetch: fetchMock });
    await expect(client.getImages('FILEKEY', ['1:1'], 2)).rejects.toThrow(/403.*Invalid token/);
  });
});
