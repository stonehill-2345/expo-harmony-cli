import commander from 'commander';

import { generatePackageListCommand } from '../../commands/generatePackageListCommand';
import { resolveCommand } from '../../commands/resolveCommand';

function commandHelp(commandName: string): string {
  const cli = new commander.Command();
  resolveCommand(cli as unknown as commander.CommanderStatic);
  generatePackageListCommand(cli as unknown as commander.CommanderStatic);
  const command = cli.commands.find((command) => command.name() === commandName);
  if (!command) {
    throw new Error(`Missing command ${commandName}`);
  }
  return command.helpInformation().replace(/\s+/g, ' ');
}

describe('Harmony CLI surface', () => {
  it('documents harmony as a supported resolve platform', () => {
    expect(commandHelp('resolve')).toContain(
      'Available options: "apple", "android", "harmony"'
    );
  });

  it('documents that Harmony generation writes a target directory', () => {
    expect(commandHelp('generate-package-list')).toContain(
      'For Harmony, this is a directory containing C++, ETS, and CMake outputs.'
    );
  });
});
