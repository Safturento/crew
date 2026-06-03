import { Command } from 'commander';
import pc from 'picocolors';
import { runNormalizeLineEndings } from '../lib/index.js';

export const normalizeLineEndingsCommand = new Command('normalize-line-endings')
  .description('re-normalize CRLF working-tree files to LF using the repo .gitattributes')
  .action(async () => {
    const cwd = process.cwd();
    const result = await runNormalizeLineEndings({
      cwd,
      log: (msg) => console.log(pc.cyan('→'), msg),
      warn: (msg) => console.log(pc.yellow('!'), msg),
    });

    if (result.status === 'dirty') {
      console.error(pc.red('✗'), result.reason ?? 'normalize-line-endings failed');
      process.exit(1);
    }
  });
