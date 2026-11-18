import * as fs from 'node:fs';
import * as path from 'node:path';
import { commitTextFileTransaction, type TextFileChange } from './file-transaction';
import { loadSdk54PatchManifest } from './patch-manifest';

function countOccurrences(contents: string, value: string): number {
  return contents.split(value).length - 1;
}

export function planDefaultImageSubstitution(projectRoot: string): readonly TextFileChange[] {
  const manifest = loadSdk54PatchManifest();
  const changes: TextFileChange[] = [];

  for (const relativePath of manifest.defaultImage.files) {
    const absolute = path.join(projectRoot, relativePath);
    let contents: string;
    try {
      contents = fs.readFileSync(absolute, 'utf8');
    } catch (error) {
      throw new Error(
        `[default-image-substitution] ${relativePath} 无法读取：${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (
      countOccurrences(contents, manifest.defaultImage.sourceImport) !== 1
      || countOccurrences(contents, "from 'expo-image'") !== 1
    ) {
      throw new Error(
        `[default-image-substitution] ${relativePath} 必须且只能包含一次已验收 expo-image import`,
      );
    }
    changes.push({
      path: absolute,
      contents: contents.replace(manifest.defaultImage.sourceImport, manifest.defaultImage.replacementImport),
    });
  }

  return changes;
}

export function applyDefaultImageSubstitution(projectRoot: string): readonly string[] {
  const changes = planDefaultImageSubstitution(projectRoot);
  commitTextFileTransaction(changes);
  return changes
    .map(change => path.relative(projectRoot, change.path).split(path.sep).join('/'))
    .sort((left, right) => left.localeCompare(right, 'en'));
}
