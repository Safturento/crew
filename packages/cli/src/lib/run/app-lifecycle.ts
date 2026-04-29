import type { ProjectConfig } from 'crew-shared';

export function agentNeedsAppRunning(config: ProjectConfig): boolean {
  return Boolean(config.visual_testing?.enabled) || Boolean(config.bruno_smoke?.enabled);
}
