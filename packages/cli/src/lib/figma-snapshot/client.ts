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

  private async req<T>(path: string): Promise<T> {
    const res = await this.fetchFn(`https://api.figma.com/v1${path}`, {
      headers: { 'X-Figma-Token': this.token },
    });
    if (!res.ok) {
      const body = res.text ? await res.text() : '';
      throw new Error(`Figma API ${res.status ?? '?'} for ${path}: ${body}`);
    }
    return (await res.json()) as T;
  }

  async getFile(fileKey: string): Promise<FigmaFileResponse> {
    return this.req<FigmaFileResponse>(`/files/${encodeURIComponent(fileKey)}`);
  }

  async getImages(
    fileKey: string,
    nodeIds: string[],
    scale = 2,
  ): Promise<FigmaImagesResponse> {
    const params = new URLSearchParams({
      ids: nodeIds.join(','),
      scale: String(scale),
      format: 'png',
    });
    return this.req<FigmaImagesResponse>(
      `/images/${encodeURIComponent(fileKey)}?${params.toString()}`,
    );
  }
}
