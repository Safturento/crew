import { Command } from 'commander';
import { runCommand } from './commands/run.js';
import { finishCommand } from './commands/finish.js';
import { fixPrCommand } from './commands/fix-pr.js';
import { listCommand } from './commands/list.js';
import { resetCommand } from './commands/reset.js';
import { statusCommand } from './commands/status.js';
import { dockerEnvCommand } from './commands/docker-env.js';
import { dbCloneCommand } from './commands/db-clone.js';
import { daemonCommand } from './commands/daemon.js';

const program = new Command();

program
  .name('crew')
  .description('CLI for orchestrating Claude Code agents on tickets')
  .version('0.0.0');

program.addCommand(runCommand);
program.addCommand(fixPrCommand);
program.addCommand(finishCommand);
program.addCommand(listCommand);
program.addCommand(resetCommand);
program.addCommand(statusCommand);
program.addCommand(dockerEnvCommand);
program.addCommand(dbCloneCommand);
program.addCommand(daemonCommand);

program.parse(process.argv);
