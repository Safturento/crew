import { execa } from 'execa';

/**
 * Whether the given binary resolves on $PATH (via `which`).
 */
export async function hasBinary(name: string): Promise<boolean> {
  try {
    await execa('which', [name]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Return the subset of `tools` that are not on $PATH, preserving input order.
 */
export async function preflightTools(tools: readonly string[]): Promise<string[]> {
  const checks = await Promise.all(tools.map((tool) => hasBinary(tool)));
  return tools.filter((_, i) => !checks[i]);
}
