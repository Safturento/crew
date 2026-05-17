type FetchLike = (
  input: string,
  init?: { headers?: Record<string, string> },
) => Promise<{
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
  text?: () => Promise<string>;
}>;

export interface FigmaNode {
  id: string;
  name: string;
  type: string;
  children?: FigmaNode[];
  [key: string]: unknown;
}

export interface FigmaFileResponse {
  document: FigmaNode;
  components?: Record<string, unknown>;
  componentSets?: Record<string, unknown>;
  styles?: Record<string, unknown>;
}

export interface FigmaImagesResponse {
  images: Record<string, string | null>;
  err?: string;
}

export interface FigmaRestClientOptions {
  token?: string;
  fetch?: FetchLike;
}

const FIGMA_TOKEN_ERROR =
  'FIGMA_API_TOKEN env var is required for figma-snapshot. Generate one at https://www.figma.com/developers/api#access-tokens';

/**
 * Max node ids per `/images` request. Figma's render endpoint times out when
 * asked for too many (or too large) frames at once; batching keeps each call
 * under that budget. See {@link FigmaRestClient.getImages}.
 */
const IMAGE_BATCH_SIZE = 5;

/**
 * Thrown by a single `/images` request when Figma reports a render timeout
 * (`400 {"err":"Render timeout, ..."}`). Distinguishable from other API
 * errors so {@link FigmaRestClient.getImages} can retry by splitting the batch.
 */
export class FigmaRenderTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FigmaRenderTimeoutError';
  }
}

export class FigmaRestClient {
  private readonly token: string;
  private readonly fetchFn: FetchLike;

  constructor(opts: FigmaRestClientOptions = {}) {
    const token = opts.token ?? process.env.FIGMA_API_TOKEN;
    if (!token) {
      throw new Error(FIGMA_TOKEN_ERROR);
    }
    this.token = token;
    this.fetchFn = opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
  }

  /** Issue an authenticated GET against the Figma v1 API. The caller owns response handling. */
  private get(path: string) {
    return this.fetchFn(`https://api.figma.com/v1${path}`, {
      headers: { 'X-Figma-Token': this.token },
    });
  }

  private async req<T>(path: string): Promise<T> {
    const res = await this.get(path);
    if (!res.ok) {
      throw new Error(`Figma API ${res.status ?? '?'} for ${path}: ${await readBody(res)}`);
    }
    return (await res.json()) as T;
  }

  async getFile(fileKey: string): Promise<FigmaFileResponse> {
    return this.req<FigmaFileResponse>(`/files/${encodeURIComponent(fileKey)}`);
  }

  /**
   * Fetch render URLs for `nodeIds`. The ids are chunked into batches of
   * {@link IMAGE_BATCH_SIZE} and requested sequentially — a large id list
   * never produces a single oversized request. A batch that hits Figma's
   * render timeout is split in half and retried recursively down to size 1;
   * a lone node that still times out is recorded with a `null` image rather
   * than aborting the whole call.
   */
  async getImages(fileKey: string, nodeIds: string[], scale = 2): Promise<FigmaImagesResponse> {
    const images: Record<string, string | null> = {};
    for (let i = 0; i < nodeIds.length; i += IMAGE_BATCH_SIZE) {
      const batch = nodeIds.slice(i, i + IMAGE_BATCH_SIZE);
      Object.assign(images, await this.getImagesWithHalving(fileKey, batch, scale));
    }
    return { images };
  }

  /**
   * Request images for one batch. On a render timeout, split the batch in half
   * and retry each half; a size-1 batch that still times out yields a `null`
   * image for that node (non-fatal). Non-timeout errors propagate.
   */
  private async getImagesWithHalving(
    fileKey: string,
    ids: string[],
    scale: number,
  ): Promise<Record<string, string | null>> {
    if (ids.length === 0) return {};
    try {
      return (await this.getImagesBatch(fileKey, ids, scale)).images;
    } catch (err) {
      if (!(err instanceof FigmaRenderTimeoutError)) throw err;
      if (ids.length === 1) {
        return { [ids[0]]: null };
      }
      const mid = Math.ceil(ids.length / 2);
      const left = await this.getImagesWithHalving(fileKey, ids.slice(0, mid), scale);
      const right = await this.getImagesWithHalving(fileKey, ids.slice(mid), scale);
      return { ...left, ...right };
    }
  }

  /** Issue a single `/images` request. Throws {@link FigmaRenderTimeoutError} on a render timeout. */
  private async getImagesBatch(
    fileKey: string,
    ids: string[],
    scale: number,
  ): Promise<FigmaImagesResponse> {
    const params = new URLSearchParams({
      ids: ids.join(','),
      scale: String(scale),
      format: 'png',
    });
    const path = `/images/${encodeURIComponent(fileKey)}?${params.toString()}`;
    const res = await this.get(path);
    if (!res.ok) {
      const body = await readBody(res);
      if (/render timeout/i.test(body)) {
        throw new FigmaRenderTimeoutError(`Figma render timeout for ${ids.length} id(s)`);
      }
      throw new Error(`Figma API ${res.status ?? '?'} for ${path}: ${body}`);
    }
    return (await res.json()) as FigmaImagesResponse;
  }
}

/** Read a response body as text, tolerating the minimal {@link FetchLike} shape used in tests. */
async function readBody(res: { text?: () => Promise<string> }): Promise<string> {
  return res.text ? await res.text() : '';
}
