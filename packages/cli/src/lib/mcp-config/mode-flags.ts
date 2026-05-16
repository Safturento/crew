import type { ProjectConfig } from 'crew-shared';

export function playwrightEnabled(c: ProjectConfig): boolean {
  return Boolean(c.playwright?.smoke?.enabled || c.playwright?.authored?.enabled);
}

export function smokeEnabled(c: ProjectConfig): boolean {
  return Boolean(c.playwright?.smoke?.enabled);
}

export function authoredEnabled(c: ProjectConfig): boolean {
  return Boolean(c.playwright?.authored?.enabled);
}

export function verifyAfterRunEnabled(c: ProjectConfig): boolean {
  return Boolean(c.playwright?.authored?.enabled && c.playwright.authored.verify_after_run);
}
