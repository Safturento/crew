import { execa } from 'execa';

/**
 * Resolve a binary on PATH; returns null if not found.
 * Equivalent to shell `which <name>` but pure Node/typed.
 */
export async function which(name: string): Promise<string | null> {
  try {
    const result = await execa('which', [name], { reject: false });
    if (result.exitCode === 0 && result.stdout) {
      return result.stdout.trim();
    }
    return null;
  } catch {
    return null;
  }
}
