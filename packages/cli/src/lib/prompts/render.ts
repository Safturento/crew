import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'templates');

export function render(templateName: string, vars: Record<string, string>): string {
  const template = readFileSync(join(TEMPLATES_DIR, `${templateName}.md`), 'utf8');
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
      throw new Error(`render('${templateName}'): missing var '${key}'`);
    }
    return vars[key];
  });
}
