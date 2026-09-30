import * as fs from 'node:fs';
import * as path from 'node:path';
import type { GlobalSetupContext } from 'vitest/node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PackedCli } from './packed-cli';
import setup from './setup-pack';

interface ObservedExecCall {
  command: string;
  args: readonly string[];
  options?: { cwd?: string };
}

const observed = vi.hoisted(() => ({
  copiedPaths: [] as string[],
  symlinkPaths: [] as string[],
  removedPaths: [] as string[],
  execCalls: [] as ObservedExecCall[],
  failNextPack: false,
}));

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    cpSync: (source: string, destination: string, options?: fs.CopySyncOptions) => {
      observed.copiedPaths.push(destination);
      return actual.cpSync(source, destination, options);
    },
    symlinkSync: (target: fs.PathLike, path: fs.PathLike, type?: fs.symlink.Type) => {
      observed.symlinkPaths.push(String(path));
      return actual.symlinkSync(target, path, type);
    },
    rmSync: (target: fs.PathLike, options?: fs.RmDirOptions) => {
      observed.removedPaths.push(String(target));
      return actual.rmSync(target, options);
    },
  };
});

vi.mock('node:child_process', async importOriginal => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return {
    ...actual,
    execFileSync: (command: string, args: readonly string[], options?: { cwd?: string }) => {
      observed.execCalls.push({ command, args, options });
      if (observed.failNextPack && args[0] === 'pack') {
        observed.failNextPack = false;
        throw new Error('pack failed');
      }
      return (actual.execFileSync as (...input: unknown[]) => unknown)(command, args, options);
    },
  };
});

const packageRoot = path.resolve(__dirname, '../..');
const staleDistPath = path.join(packageRoot, 'dist/obsolete.js');
const failureSentinelPath = path.join(packageRoot, 'dist/setup-pack-preserve.txt');

function runSetup(): { packed: PackedCli; cleanup: () => void } {
  let packed: PackedCli | undefined;
  const cleanup = setup({
    provide(key, value) {
      if (key === 'packedCli') packed = value as PackedCli;
    },
  } as GlobalSetupContext);

  if (!packed || typeof cleanup !== 'function') {
    throw new Error('setup 未提供 packedCli 或 cleanup');
  }
  return { packed, cleanup };
}

beforeEach(() => {
  observed.copiedPaths.length = 0;
  observed.symlinkPaths.length = 0;
  observed.removedPaths.length = 0;
  observed.execCalls.length = 0;
  observed.failNextPack = false;
});

afterEach(() => {
  fs.rmSync(staleDistPath, { force: true });
  fs.rmSync(failureSentinelPath, { force: true });
});

describe('setup-pack', () => {
  it('从真实 package root 生成版本化 TGZ，不复制 source 或创建 node_modules symlink', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')) as {
      name: string;
      version: string;
    };
    const expectedArchiveName = `${packageJson.name.replace(/^@/, '').replace('/', '-')}-${packageJson.version}.tgz`;
    fs.mkdirSync(path.dirname(staleDistPath), { recursive: true });
    fs.writeFileSync(staleDistPath, '// stale build output\n');

    const { packed, cleanup } = runSetup();
    try {
      const packCall = observed.execCalls.find(call => call.args[0] === 'pack');
      expect(packCall?.options?.cwd).toBe(packageRoot);
      expect(observed.copiedPaths).toEqual([]);
      expect(observed.symlinkPaths).toEqual([]);
      expect(packed.archiveName).toBe(expectedArchiveName);
      expect(packed.archivePath).toBe(path.join(path.dirname(packed.root), expectedArchiveName));
      expect(fs.existsSync(packed.archivePath)).toBe(true);
      expect(packed.files).not.toContain('dist/obsolete.js');
      expect(fs.existsSync(staleDistPath)).toBe(false);
    } finally {
      const archivePath = packed.archivePath;
      const extractedRoot = packed.root;
      cleanup();
      expect(fs.existsSync(archivePath)).toBe(false);
      expect(fs.existsSync(extractedRoot)).toBe(false);
    }
  }, 120_000);

  it('pack 失败时只清理自己的 temp，不删除仓库 dist 或 source', () => {
    const sourcePath = path.join(packageRoot, 'src/index.ts');
    fs.mkdirSync(path.dirname(failureSentinelPath), { recursive: true });
    fs.writeFileSync(failureSentinelPath, 'keep\n');
    observed.failNextPack = true;

    expect(() => runSetup()).toThrow('pack failed');

    expect(fs.existsSync(sourcePath)).toBe(true);
    expect(fs.readFileSync(failureSentinelPath, 'utf8')).toBe('keep\n');
    expect(observed.removedPaths).toHaveLength(1);
    expect(path.basename(observed.removedPaths[0])).toMatch(/^expo-cli-pack-/);
    expect(observed.removedPaths[0]).not.toBe(path.join(packageRoot, 'dist'));
    expect(observed.removedPaths[0]).not.toBe(path.join(packageRoot, 'src'));

  });
});
