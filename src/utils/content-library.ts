import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

/** 从 CLI 内容库 copy 到目标项目。sourceFile 相对 CLI 包根（如 'content/patches/xxx.patch'），targetPath 相对目标项目根。hash 校验防覆盖用户改动。*/
export function copyFromLibrary(sourceFile: string, targetDir: string, targetPath: string): boolean {
  const src = path.join(__dirname, '..', '..', sourceFile); // src/utils → 包根
  const dst = path.join(targetDir, targetPath);
  if (!fs.existsSync(src)) {
    throw new Error(`内容库缺失: ${sourceFile}（CLI 版本可能过期）`);
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  if (fs.existsSync(dst)) {
    const srcHash = createHash('md5').update(fs.readFileSync(src)).digest('hex');
    const dstHash = createHash('md5').update(fs.readFileSync(dst)).digest('hex');
    if (srcHash !== dstHash) {
      return false; // 用户改过的不覆盖
    }
  }
  fs.copyFileSync(src, dst);
  return true;
}
