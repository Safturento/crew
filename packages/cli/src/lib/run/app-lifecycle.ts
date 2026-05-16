import type { ProjectConfig } from 'crew-shared';
import { playwrightEnabled } from '../mcp-config/index.js';

export function agentNeedsAppRunning(config: ProjectConfig): boolean {
  return playwrightEnabled(config) || Boolean(config.bruno_smoke?.enabled);
}
