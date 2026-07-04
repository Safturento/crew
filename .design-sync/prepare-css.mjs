// design-sync cssEntry preparation — run after `npm run build --workspace crew-dashboard`.
// The vite build emits a content-hashed stylesheet (dist/assets/index-<hash>.css)
// whose font URLs are root-absolute (/assets/…), which the design-sync font
// extractor can't resolve. This copies it to a stable name with relative URLs
// so cfg.cssEntry never goes stale and fonts copy into the bundle.
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const dir = new URL('../packages/dashboard/dist/assets/', import.meta.url);
const css = readdirSync(dir).filter((f) => f.startsWith('index-') && f.endsWith('.css'));
if (css.length !== 1) throw new Error(`expected exactly 1 dist/assets/index-*.css, found: ${css.join(', ') || 'none'} — run the dashboard build first`);
const text = readFileSync(new URL(css[0], dir), 'utf8').replaceAll('url(/assets/', 'url(./');
writeFileSync(new URL('ds-entry.css', dir), text);
console.log(`ds-entry.css ← ${css[0]}`);
