import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { GlobalSetupContext } from 'vitest/node';
import type { PackedCli } from './packed-cli';
import { resolveCommandInvocation } from '../../src/utils/exec';

interface PackageJson {
  name: string;
  version: string;
}

export default function setup({ provide }: GlobalSetupContext) {
  const packageRoot = path.resolve(__dirname, '../..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-cli-pack-'));
  const output = path.join(temp, 'output');
  const cleanup = () => fs.rmSync(temp, { recursive: true, force: true });

  try {
    fs.mkdirSync(output);
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
    ) as PackageJson;
    const archiveName = `${packageJson.name.replace(/^@/, '').replace('/', '-')}-${packageJson.version}.tgz`;
    const archivePath = path.join(output, archiveName);

    const { command, shell } = resolveCommandInvocation('pnpm');
    execFileSync(command, ['pack', '--pack-destination', output], {
      cwd: packageRoot, shell, stdio: 'pipe', timeout: 120_000,
    });
    if (!fs.existsSync(archivePath)) throw new Error(`pnpm pack 未生成安装包: ${archiveName}`);
    const files = execFileSync('tar', ['-tzf', archivePath], { encoding: 'utf8' })
      .trim().split('\n').filter(name => !name.endsWith('/'))
      .map(name => name.replace(/^package\//, '')).sort();
    execFileSync('tar', ['-xzf', archivePath, '-C', output]);
    const packed: PackedCli = {
      root: path.join(output, 'package'),
      files,
      archivePath,
      archiveName,
    };
    provide('packedCli', packed);
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}
