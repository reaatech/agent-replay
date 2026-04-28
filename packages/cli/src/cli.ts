#!/usr/bin/env node
import { createRequire } from 'node:module';

import { Command } from 'commander';

import { recordCommand } from './commands/record.js';
import { replayCommand } from './commands/replay.js';
import { exploreCommand } from './commands/explore.js';
import { diffCommand } from './commands/diff.js';
import { debugCommand } from './commands/debug.js';

const require = createRequire(import.meta.url);
const { version } = require('../../package.json') as { version: string };

const program = new Command();

program
  .name('agent-replay')
  .description('Record and deterministically replay agent interactions')
  .version(version);

program.addCommand(recordCommand);
program.addCommand(replayCommand);
program.addCommand(exploreCommand);
program.addCommand(diffCommand);
program.addCommand(debugCommand);

program.parse();
