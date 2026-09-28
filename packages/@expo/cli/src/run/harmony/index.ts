#!/usr/bin/env node
import chalk from 'chalk';
import path from 'path';
import { Command } from '../../../bin/cli';
import * as Log from '../../log';
import { assertWithOptionsArgs } from '../../utils/args';
import { logCmdError } from '../../utils/errors';
export const expoRunHarmony: Command = async (argv) => {
  const args = assertWithOptionsArgs(
    {
      '--help': Boolean,
      '--configuration': String,
      '--device': String,
      '--port': Number,
      '--no-install': Boolean,
      '--no-bundler': Boolean,
      '--no-build-cache': Boolean,
      '--bundle-name': String,
      '-h': '--help',
      '-p': '--port',
    },
    { argv }
  );
  if (args['--help'])
    Log.exit(
      chalk`{bold Usage}\n  $ npx expo run:harmony <dir>\n\n--configuration <Debug|Release>\n--device <target>\n--port <number>\n--no-install\n--no-bundler\n--no-build-cache\n--bundle-name <name>`,
      0
    );
  const { getProjectRoot } = await import('../../utils/args.js');
  const { runHarmonyAsync } = await import('./runHarmonyAsync.js');
  return runHarmonyAsync(path.resolve(getProjectRoot(args)), {
    configuration: args['--configuration'],
    device: args['--device'],
    port: args['--port'],
    install: !args['--no-install'],
    bundler: !args['--no-bundler'],
    buildCache: !args['--no-build-cache'],
    bundleName: args['--bundle-name'],
  }).catch(logCmdError);
};
