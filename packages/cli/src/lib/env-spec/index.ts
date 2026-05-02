export { parseEnvSpec, loadEnvSpec } from './parse.js';
export { materialize } from './materialize.js';
export { validateSpec } from './resolve.js';
export { emit, GENERATED_ENV_HEADER as ENV_SPEC_GENERATED_HEADER } from './emit.js';
export { parseEnvFile } from './parse-env-file.js';
export type { EnvSpec, OrchestrationEntry, AppEntry, FileEntry } from './types.js';
export type { MaterializeOptions, MaterializeResult } from './materialize.js';
export type { EmitOptions } from './emit.js';
export { ENV_SPEC_SCHEMA_VERSION } from './types.js';
