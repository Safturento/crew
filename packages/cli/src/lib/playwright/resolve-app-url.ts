export interface ResolvedAppUrl {
  raw: string;
  substitutions: Record<string, string>;
}

export interface DockerPorts {
  httpPort: number;
  httpsPort: number;
  postgresPort: number;
}

const PLACEHOLDER_TO_PORT_KEY = {
  '{httpPort}': 'httpPort',
  '{httpsPort}': 'httpsPort',
  '{postgresPort}': 'postgresPort',
} as const;

const PLACEHOLDER_RE = /\{[a-zA-Z]+Port\}/g;

export function resolveAppUrl(template: string, ports: DockerPorts | undefined): ResolvedAppUrl {
  const substitutions: Record<string, string> = {};
  const raw = template.replace(PLACEHOLDER_RE, (match) => {
    const key = PLACEHOLDER_TO_PORT_KEY[match as keyof typeof PLACEHOLDER_TO_PORT_KEY];
    if (!key) {
      throw new Error(`resolveAppUrl: unknown placeholder ${match}`);
    }
    if (!ports) {
      throw new Error(`resolveAppUrl: ${match} used but ports were not provided`);
    }
    const value = String(ports[key]);
    substitutions[match] = value;
    return value;
  });
  return { raw, substitutions };
}
