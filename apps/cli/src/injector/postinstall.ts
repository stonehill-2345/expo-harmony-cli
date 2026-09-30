import * as fs from 'fs';
import * as path from 'path';

export function writePostinstall(targetDir: string): void {
  const scriptsDir = path.join(targetDir, 'scripts');
  fs.mkdirSync(scriptsDir, { recursive: true });
  const templateSrc = path.join(__dirname, '..', '..', 'content', 'templates', 'postinstall-harmony.js');
  fs.copyFileSync(templateSrc, path.join(scriptsDir, 'postinstall-harmony.js'));
}
