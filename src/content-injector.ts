import * as fs from 'fs';
import * as path from 'path';
import { copySkills } from './harmony-skills';
import { VERSION_MATRIX as V } from './version-matrix';

export interface ContentInjectOptions {
  appName: string;
  slug: string;
  bundleName: string;
}

/** 注入用户文档（占位符替换）+ 2 skill。SIGNING.md 在 prebuild（P2）。*/
export function injectContent(targetDir: string, opts: ContentInjectOptions): void {
  cleanupLegacyClaudeContent(targetDir);

  // I-4: 版本占位符从 version-matrix 取（DRY），不再硬编码
  const replacements: Record<string, string> = {
    '{{appName}}': opts.appName,
    '{{slug}}': opts.slug,
    '{{bundleName}}': opts.bundleName,
    '{{rnohVersion}}': V.rnoh,
    '{{expoSdk}}': V.expoSdk,
  };
  const docsDir = path.join(__dirname, '..', 'content', 'docs');

  // 根文档：README 给用户，AGENTS 给 Agent/维护者。
  for (const doc of ['README.md', 'AGENTS.md']) {
    injectDoc(docsDir, doc, targetDir, doc, replacements);
  }

  // docs/ 文档：HarmonyOS 开发、patch 生命周期、排障。
  for (const doc of ['HARMONY.md', 'PATCHES.md', 'TROUBLESHOOTING.md']) {
    injectDoc(docsDir, doc, path.join(targetDir, 'docs'), doc, replacements);
  }

  // 2 skill（从 CLI 内置内容复制，幂等）
  copySkills(targetDir);
}

/** 清理旧版 CLI 或上游模板可能遗留的 Claude 专属入口，避免与 .agent/AGENTS.md 双入口冲突。 */
function cleanupLegacyClaudeContent(targetDir: string): void {
  for (const relativePath of ['CLAUDE.md', '.claude']) {
    fs.rmSync(path.join(targetDir, relativePath), { recursive: true, force: true });
  }
}

function injectDoc(
  srcDir: string,
  srcName: string,
  dstDir: string,
  dstName: string,
  replacements: Record<string, string>,
): void {
  let content = fs.readFileSync(path.join(srcDir, srcName), 'utf8');
  for (const [k, v] of Object.entries(replacements)) {
    content = content.split(k).join(v);
  }
  fs.mkdirSync(dstDir, { recursive: true });
  fs.writeFileSync(path.join(dstDir, dstName), content);
}
