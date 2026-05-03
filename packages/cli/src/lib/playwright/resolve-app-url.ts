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

const LEGACY_PLACEHOLDER_RE = /\{[a-zA-Z]+Port\}/g;
const ENV_VAR_RE = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

/**
 * Resolves placeholders in `template` from one or two sources:
 * - `{httpPort}` / `{httpsPort}` / `{postgresPort}` substitute from `ports`
 *   (the `writeDockerEnv` shape; for projects without `env.toml`).
 * - `${VAR}` substitutes from `envVars` (the materialized base map produced
 *   by env-spec `materialize()`; for projects with `env.toml`).
 *
 * Both syntaxes can coexist in one template. Throws with a specific message
 * naming the placeholder when its source wasn't supplied.
 */
export function resolveAppUrl(
  template: string,
  ports: DockerPorts | undefined,
  envVars: Record<string, string> | undefined = undefined,
): ResolvedAppUrl {
  const substitutions: Record<string, string> = {};

  let raw = template.replace(LEGACY_PLACEHOLDER_RE, (match) => {
    const key = PLACEHOLDER_TO_PORT_KEY[match as keyof typeof PLACEHOLDER_TO_PORT_KEY];
    if (!key) {
      throw new Error(`resolveAppUrl: unknown placeholder ${match}`);
    }
    if (!ports) {
      throw new Error(
        `resolveAppUrl: ${match} used but ports were not provided. ` +
          `Projects with env.toml should use \${VAR} syntax instead — see the README.`,
      );
    }
    const value = String(ports[key]);
    substitutions[match] = value;
    return value;
  });

  raw = raw.replace(ENV_VAR_RE, (match, name: string) => {
    if (!envVars) {
      throw new Error(
        `resolveAppUrl: ${match} used but env vars were not provided. ` +
          `${match} is only valid for projects with env.toml.`,
      );
    }
    if (!(name in envVars)) {
      throw new Error(
        `resolveAppUrl: ${match} used but no such variable in materialized env. ` +
          `Available: ${Object.keys(envVars).sort().join(', ')}`,
      );
    }
    const value = envVars[name]!;
    substitutions[match] = value;
    return value;
  });

  return { raw, substitutions };
}
