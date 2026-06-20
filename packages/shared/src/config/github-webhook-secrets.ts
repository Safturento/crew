import { readFileSync, existsSync } from 'node:fs';
import { parse as parseToml } from 'smol-toml';
import { z } from 'zod';

/**
 * `~/.config/crew/github-webhook-secrets.toml` — per-repo HMAC secrets, kept
 * out of the project TOMLs. Shape:
 *
 *   ["Owner/repo"]
 *   secret = "<unique-per-repo-random>"
 *
 * Keys are repo full names; we lowercase them so lookup matches the webhook's
 * `repository.full_name` case-insensitively (GitHub treats it that way).
 */
const entrySchema = z.object({ secret: z.string().min(1) });
const fileSchema = z.record(z.string(), entrySchema);

export function parseGithubWebhookSecrets(raw: string): Map<string, string> {
  const parsed = fileSchema.parse(parseToml(raw));
  const map = new Map<string, string>();
  for (const [repo, { secret }] of Object.entries(parsed)) {
    map.set(repo.toLowerCase(), secret);
  }
  return map;
}

/**
 * Load secrets from disk. A *missing* file is not an error — the daemon boots
 * with zero configured webhooks (every delivery then 404s at repo-resolve).
 * A present-but-malformed file throws, surfacing the misconfiguration loudly.
 */
export function loadGithubWebhookSecrets(path: string): Map<string, string> {
  if (!existsSync(path)) return new Map();
  return parseGithubWebhookSecrets(readFileSync(path, 'utf8'));
}
