export interface BrunoSmokeUser {
  email: string;
  username: string;
  password: string;
}

export interface BuildEnvFileOptions {
  baseUrl: string;
  smokeUser?: BrunoSmokeUser;
}

export function buildEnvFileContent(opts: BuildEnvFileOptions): string {
  const lines = [`  baseUrl: ${opts.baseUrl}`];
  if (opts.smokeUser) {
    lines.push(
      `  testUser.email: ${opts.smokeUser.email}`,
      `  testUser.username: ${opts.smokeUser.username}`,
      `  testUser.password: ${opts.smokeUser.password}`,
    );
  }
  return `vars {\n${lines.join('\n')}\n}\n`;
}
