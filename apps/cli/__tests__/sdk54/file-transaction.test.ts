import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { renameAtomic } from '../../src/utils/atomic-rename';
import { commitTextFileTransaction } from '../../src/sdk54/file-transaction';

vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return { ...actual, rmSync: vi.fn(actual.rmSync) };
});

vi.mock('../../src/utils/atomic-rename', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/utils/atomic-rename')>();
  return { ...actual, renameAtomic: vi.fn(actual.renameAtomic) };
});

describe('commitTextFileTransaction', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-transaction-'));
    vi.mocked(renameAtomic).mockReset();
    vi.mocked(renameAtomic).mockImplementation((source, destination) => fs.renameSync(source, destination));
  });

  afterEach(() => {
    vi.mocked(renameAtomic).mockReset();
    vi.mocked(fs.rmSync).mockRestore();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('commits existing and new files as one transaction', () => {
    const existing = path.join(root, 'existing.txt');
    const created = path.join(root, 'nested/created.txt');
    fs.writeFileSync(existing, 'old');

    commitTextFileTransaction([
      { path: existing, contents: 'new existing' },
      { path: created, contents: 'new created', mode: 0o600 },
    ]);

    expect(fs.readFileSync(existing, 'utf8')).toBe('new existing');
    expect(fs.readFileSync(created, 'utf8')).toBe('new created');
    expect(fs.statSync(created).mode & 0o777).toBe(0o600);
    expect(transactionArtifacts(root)).toEqual([]);
  });

  it('restores every original when the second commit rename fails', () => {
    const first = path.join(root, 'first.txt');
    const second = path.join(root, 'second.txt');
    fs.writeFileSync(first, 'first old');
    fs.writeFileSync(second, 'second old');

    vi.mocked(renameAtomic).mockImplementation((source, destination) => {
      if (vi.mocked(renameAtomic).mock.calls.length === 4) throw new Error('rename failed');
      fs.renameSync(source, destination);
    });

    expect(() => commitTextFileTransaction([
      { path: first, contents: 'first new' },
      { path: second, contents: 'second new' },
    ])).toThrow(/rename failed/);

    expect(fs.readFileSync(first, 'utf8')).toBe('first old');
    expect(fs.readFileSync(second, 'utf8')).toBe('second old');
    expect(transactionArtifacts(root)).toEqual([]);
  });

  it('keeps all committed files when deleting the second backup fails', async () => {
    const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
    const first = path.join(root, 'first.txt'), second = path.join(root, 'second.txt');
    fs.writeFileSync(first, 'first old'); fs.writeFileSync(second, 'second old');
    let removals = 0;
    vi.mocked(fs.rmSync).mockImplementation((file, options) => {
      if (String(file).endsWith('.bak') && ++removals === 2) throw new Error('backup cleanup failed');
      actual.rmSync(file, options);
    });
    expect(() => commitTextFileTransaction([
      { path: first, contents: 'first new' }, { path: second, contents: 'second new' },
    ])).toThrow(/backup cleanup failed/);
    expect(fs.readFileSync(first, 'utf8')).toBe('first new');
    expect(fs.readFileSync(second, 'utf8')).toBe('second new');
    const backups = transactionArtifacts(root);
    expect(backups).toHaveLength(1);
    expect(fs.readFileSync(path.join(root, backups[0]), 'utf8')).toBe('second old');
  });

  it('retains backups if rollback cannot restore an original', () => {
    const first = path.join(root, 'first.txt'), second = path.join(root, 'second.txt');
    fs.writeFileSync(first, 'first old'); fs.writeFileSync(second, 'second old');
    vi.mocked(renameAtomic).mockImplementation((source, destination) => {
      if (source.endsWith('.bak') || (source.endsWith('.tmp') && destination === second)) throw new Error('rename failed');
      fs.renameSync(source, destination);
    });
    expect(() => commitTextFileTransaction([
      { path: first, contents: 'first new' }, { path: second, contents: 'second new' },
    ])).toThrow(/rename failed/);
    expect(transactionArtifacts(root).map(file => fs.readFileSync(path.join(root, file), 'utf8')).sort())
      .toEqual(['first old', 'second old']);
  });

  it('rejects duplicate, empty, and relative target paths before writing', () => {
    const target = path.join(root, 'same.txt');
    expect(() => commitTextFileTransaction([
      { path: target, contents: 'one' },
      { path: target, contents: 'two' },
    ])).toThrow(/重复/);
    expect(() => commitTextFileTransaction([{ path: '', contents: 'x' }])).toThrow(/绝对路径/);
    expect(() => commitTextFileTransaction([{ path: 'relative.txt', contents: 'x' }])).toThrow(/绝对路径/);
    expect(fs.readdirSync(root)).toEqual([]);
  });
});

function transactionArtifacts(root: string): string[] {
  const result: string[] = [];
  const visit = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.name.includes('.sdk54-transaction-')) result.push(path.relative(root, absolute));
    }
  };
  visit(root);
  return result.sort();
}
