import { Command } from 'commander';
import { finishCommand } from './commands/finish.js';
import { fixPrCommand } from './commands/fix-pr.js';

const program = new Command();

program
  .name('crew')
  .description('CLI for orchestrating Claude Code agents on tickets')
  .version('0.0.0');

program.addCommand(fixPrCommand);
program.addCommand(finishCommand);

program.parse(process.argv);
