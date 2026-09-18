import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { GlobalSetupContext } from 'vitest/node';
import type { PackedCli } from './packed-cli';
import { resolveCommandInvocation } from '../../src/utils/exec';

export default function setup({ provide }: GlobalSetupContext) {
  const packageRoot = path.resolve(__dirname, '../..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-cli-pack-'));
  const source = path.join(temp, 'source');
  const output = path.join(temp, 'output');
  const cleanup = () => fs.rmSync(temp, { recursive: true, force: true });

  try {
    fs.mkdirSync(source);
    fs.mkdirSync(output);
    // 从源码打包，避免复用仓库 dist 掩盖缺少构建步骤的问题。
    for (const name of [
      'package.json', 'tsconfig.json', '.npmignore', 'src', 'content',
      'templates', 'assets', 'docs', 'README.md', 'CHANGELOG.md', 'NOTICE.md', 'LICENSE',
    ]) {
      fs.cpSync(path.join(packageRoot, name), path.join(source, name), { recursive: true });
    }
    fs.symlinkSync(path.join(packageRoot, 'node_modules'), path.join(source, 'node_modules'), 'junction');
    fs.mkdirSync(path.join(source, 'dist'));
    fs.writeFileSync(path.join(source, 'dist/obsolete.js'), '// stale build output\n');

    const { command, shell } = resolveCommandInvocation('pnpm');
    execFileSync(command, ['pack', '--pack-destination', output], {
      cwd: source, shell, stdio: 'pipe', timeout: 120_000,
    });
    const tarball = fs.readdirSync(output).find(name => name.endsWith('.tgz'));
    if (!tarball) throw new Error('pnpm pack 未生成安装包');
    const archive = path.join(output, tarball);
    const files = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' })
      .trim().split('\n').filter(name => !name.endsWith('/'))
      .map(name => name.replace(/^package\//, '')).sort();
    execFileSync('tar', ['-xzf', archive, '-C', output]);
    const packed: PackedCli = { root: path.join(output, 'package'), files };
    provide('packedCli', packed);
    return cleanup;
  } catch (error) {
    cleanup();
    throw error;
  }
}
