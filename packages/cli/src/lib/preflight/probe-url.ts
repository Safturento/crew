import { Agent } from 'undici';

/**
 * 1s, 2s, 4s, 8s, 16s = 31s worst case across 5 attempts. Mirrors the
 * docker-daemon-check timeout (3s → 15s) layered on app-process boot
 * inside the container.
 */
export const DEFAULT_RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000];

export interface ProbeUrlOptions {
  /** Per-attempt delay schedule in ms. Length determines max attempts. */
  delays?: number[];
}

export interface ProbeResult {
  reachable: boolean;
  attempts: number;
  lastError?: NodeJS.ErrnoException;
}

const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

export async function probeUrl(url: string, opts: ProbeUrlOptions = {}): Promise<ProbeResult> {
  const delays = opts.delays ?? DEFAULT_RETRY_DELAYS_MS;
  let lastError: NodeJS.ErrnoException | undefined;

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, delays[attempt - 1]));
    }
    try {
      await fetch(url, {
        method: 'HEAD',
        // @ts-expect-error — undici dispatcher option exists at runtime
        // on Node's native fetch but isn't in the global RequestInit type.
        dispatcher: insecureAgent,
      });
      return { reachable: true, attempts: attempt + 1 };
    } catch (err) {
      lastError = err as NodeJS.ErrnoException;
    }
  }

  return { reachable: false, attempts: delays.length, lastError };
}
