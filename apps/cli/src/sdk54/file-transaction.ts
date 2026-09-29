import * as fs from 'node:fs';
import * as path from 'node:path';
import { renameAtomic } from '../utils/atomic-rename';

export interface TextFileChange {
  path: string;
  contents: string;
  mode?: number;
}

interface PreparedChange extends TextFileChange {
  tempPath: string;
  backupPath: string;
  existed: boolean;
}

let transactionSequence = 0;

export function commitTextFileTransaction(changes: readonly TextFileChange[]): void {
  const seen = new Set<string>();
  for (const change of changes) {
    if (!path.isAbsolute(change.path)) throw new Error(`事务目标必须是绝对路径：${change.path || '<empty>'}`);
    if (seen.has(change.path)) throw new Error(`事务目标路径重复：${change.path}`);
    seen.add(change.path);
  }
  if (changes.length === 0) return;

  const token = `${process.pid}-${Date.now()}-${transactionSequence++}`;
  const prepared: PreparedChange[] = changes.map((change, index) => ({
    ...change,
    tempPath: `${change.path}.sdk54-transaction-${token}-${index}.tmp`,
    backupPath: `${change.path}.sdk54-transaction-${token}-${index}.bak`,
    existed: fs.existsSync(change.path),
  }));
  const backedUp: PreparedChange[] = [];
  const committed: PreparedChange[] = [];

  try {
    for (const change of prepared) {
      fs.mkdirSync(path.dirname(change.path), { recursive: true });
      const descriptor = fs.openSync(change.tempPath, 'wx', change.mode ?? 0o666);
      try {
        fs.writeFileSync(descriptor, change.contents, 'utf8');
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
    }

    for (const change of prepared) {
      if (!change.existed) continue;
      renameAtomic(change.path, change.backupPath);
      backedUp.push(change);
    }

    for (const change of prepared) {
      renameAtomic(change.tempPath, change.path);
      committed.push(change);
    }

    for (const change of backedUp) fs.rmSync(change.backupPath, { force: true });
  } catch (error) {
    for (const change of [...committed].reverse()) fs.rmSync(change.path, { force: true });
    for (const change of [...backedUp].reverse()) {
      if (fs.existsSync(change.backupPath)) renameAtomic(change.backupPath, change.path);
    }
    throw error;
  } finally {
    for (const change of prepared) {
      fs.rmSync(change.tempPath, { force: true });
      fs.rmSync(change.backupPath, { force: true });
    }
  }
}
