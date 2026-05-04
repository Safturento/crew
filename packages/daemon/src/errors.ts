/**
 * Typed errors thrown from services and converted to HTTP responses by
 * Fastify's `setErrorHandler` in `app.ts`. Routes never `try/catch` these —
 * they bubble up and the central handler maps them to status codes.
 */

export class NotFoundError extends Error {
  readonly resource?: string;
  readonly id?: string;

  constructor(message: string, opts: { resource?: string; id?: string } = {}) {
    super(message);
    this.name = 'NotFoundError';
    this.resource = opts.resource;
    this.id = opts.id;
  }
}

export class ConflictError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(code: string, message?: string, details: Record<string, unknown> = {}) {
    super(message ?? code);
    this.name = 'ConflictError';
    this.code = code;
    this.details = details;
  }
}

export class ConfigDirNotFoundError extends Error {
  readonly configDir: string;

  constructor(configDir: string) {
    super(`crew config directory does not exist: ${configDir}`);
    this.name = 'ConfigDirNotFoundError';
    this.configDir = configDir;
  }
}
