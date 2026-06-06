import { Command } from 'commander';
import { runCommand } from './commands/run.js';
import { finishCommand } from './commands/finish.js';
import { fixPrCommand } from './commands/fix-pr.js';
import { listCommand } from './commands/list.js';
import { resetCommand } from './commands/reset.js';
import { restartCommand } from './commands/restart.js';
import { resumeCommand } from './commands/resume.js';
import { statusCommand } from './commands/status.js';
import { dockerEnvCommand } from './commands/docker-env.js';
import { dockerListCommand } from './commands/docker-list.js';
import { envCommand } from './commands/env.js';
import { dbCloneCommand } from './commands/db-clone.js';
import { daemonCommand } from './commands/daemon.js';
import { figmaSnapshotCommand } from './commands/figma-snapshot.js';
import { backfillTitlesCommand } from './commands/backfill-titles.js';
import { normalizeLineEndingsCommand } from './commands/normalize-line-endings.js';
import { runnerCommand } from './commands/runner.js';
import { upCommand } from './commands/up.js';
import { downCommand } from './commands/down.js';
import { doctorCommand } from './commands/doctor.js';

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
program.addCommand(restartCommand);
program.addCommand(resumeCommand);
program.addCommand(statusCommand);
program.addCommand(dockerEnvCommand);
program.addCommand(dockerListCommand);
program.addCommand(envCommand);
program.addCommand(dbCloneCommand);
program.addCommand(daemonCommand);
program.addCommand(figmaSnapshotCommand);
program.addCommand(backfillTitlesCommand);
program.addCommand(normalizeLineEndingsCommand);
program.addCommand(runnerCommand);
program.addCommand(upCommand);
program.addCommand(downCommand);
program.addCommand(doctorCommand);

program.parse(process.argv);
