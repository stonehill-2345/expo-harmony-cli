import * as fs from 'fs';
import * as path from 'path';

export const SKILLS_DIR = path.join(__dirname, '..', 'content', 'skills');

/** 复制 2 skill 到 targetDir/.agent/skills/（内容相同则跳过，幂等）。*/
export function copySkills(targetDir: string): void {
  const destRoot = path.join(targetDir, '.agent', 'skills');
  for (const skillName of fs.readdirSync(SKILLS_DIR)) {
    const src = path.join(SKILLS_DIR, skillName);
    if (!fs.statSync(src).isDirectory()) continue;
    const dst = path.join(destRoot, skillName);
    copyDirIfChanged(src, dst);
  }
}

function copyDirIfChanged(src: string, dst: string): void {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirIfChanged(s, d);
    } else {
      const srcContent = fs.readFileSync(s);
      if (!fs.existsSync(d) || !fs.readFileSync(d).equals(srcContent)) {
        fs.writeFileSync(d, srcContent);
      }
    }
  }
}
