# crew-shared

Shared types, schemas, and loaders consumed by `crew-cli`, `crew-daemon`, and
(eventually) `crew-dashboard`. This package is the leaf of the dependency
graph: it must not import from `crew-cli`, `crew-daemon`, or `crew-dashboard`.

Currently exports:

- `parseProjectConfig`, `loadProjectConfigByName`, `projectConfigSchema`,
  `ProjectConfig` — the per-project TOML config schema + loader.
