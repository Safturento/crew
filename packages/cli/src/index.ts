import { Command } from 'commander';

const program = new Command();

program
  .name('crew')
  .description('CLI for orchestrating Claude Code agents on tickets')
  .version('0.0.0');

program.parse(process.argv);
