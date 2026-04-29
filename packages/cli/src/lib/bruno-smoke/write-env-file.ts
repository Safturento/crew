import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildEnvFileContent, type BrunoSmokeUser } from './build-env-file.js';

export interface WriteEnvFileOptions {
  collectionDir: string;
  envName: string;
  baseUrl: string;
  smokeUser?: BrunoSmokeUser;
}

export interface WriteEnvFileResult {
  envFilePath: string;
  existed: boolean;
}

export function writeEnvFile(
  worktreePath: string,
  opts: WriteEnvFileOptions,
): WriteEnvFileResult {
  const collectionRoot = join(worktreePath, opts.collectionDir);
  if (!existsSync(collectionRoot) || !statSync(collectionRoot).isDirectory()) {
    throw new Error(
      `writeEnvFile: collection directory not found at ${collectionRoot}. ` +
        `[bruno_smoke] is enabled but the project hasn't shipped a '${opts.collectionDir}/' collection. ` +
        `Add one or remove [bruno_smoke] from the project config.`,
    );
  }

  const envDir = join(collectionRoot, 'environments');
  mkdirSync(envDir, { recursive: true });

  const envFilePath = join(envDir, `${opts.envName}.bru`);
  const existed = existsSync(envFilePath);

  const content = buildEnvFileContent({
    baseUrl: opts.baseUrl,
    smokeUser: opts.smokeUser,
  });
  writeFileSync(envFilePath, content);

  return { envFilePath, existed };
}
