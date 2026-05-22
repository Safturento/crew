import type { ProjectConfig } from './schema.js';

/**
 * Resolve the browsable app URL for a project, preferring `playwright.app_url`
 * (the source of truth for the live-test base) and falling back to
 * `bruno_smoke.base_url`. Returns null when neither section is configured —
 * the drawer hides the corresponding pill rather than rendering a dead link.
 */
export function deriveAppUrl(cfg: ProjectConfig): string | null {
  if (cfg.playwright?.app_url) return cfg.playwright.app_url;
  if (cfg.bruno_smoke?.base_url) return cfg.bruno_smoke.base_url;
  return null;
}

/**
 * Compose the canonical Jira ticket URL from a project's Jira `site` and the
 * ticket key. Strips any trailing slash off the site so the result is always
 * `<site>/browse/<key>`. Returns null when the ticket key is empty — the
 * agents row alone is not enough to know what ticket to link to.
 */
export function deriveJiraUrl(cfg: ProjectConfig, ticketKey: string): string | null {
  if (!ticketKey) return null;
  const site = cfg.jira.site.replace(/\/$/, '');
  return `${site}/browse/${ticketKey}`;
}
