import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));

export function releaseReadmePath(descriptor) {
  return descriptor.relativePath
    ? `${descriptor.relativePath}/README.md`
    : 'docs/harmony/packages/react-native-screens.md';
}

export function readReleaseReadme(descriptor, rootDir = root) {
  const contents = fs.readFileSync(path.join(rootDir, releaseReadmePath(descriptor)), 'utf8');
  for (const required of [`# ${descriptor.publishName}\n`, `${descriptor.installName}@${descriptor.installSpec}`, '## 使用方式', '## 鸿蒙支持范围', '## 上游与许可证']) {
    if (!contents.includes(required)) throw new Error(`Incomplete release README for ${descriptor.publishName}: ${required}`);
  }
  if (/\{\{\s*[a-zA-Z_][\w.]*\s*\}\}/.test(contents)) throw new Error(`Unresolved README placeholder: ${descriptor.publishName}`);
  for (const match of contents.matchAll(/\]\(([^)]+)\)/g)) {
    if (!/^(https:\/\/|#)/.test(match[1])) throw new Error(`Non-portable README link: ${match[1]}`);
  }
  return contents;
}
