import * as fs from 'fs';
import * as path from 'path';

/** 前置校验：当前目录是项目根（有 app.json）。*/
export function preflight(projectRoot: string, skip = false): void {
  if (skip) return;
  if (!fs.existsSync(path.join(projectRoot, 'app.json'))) {
    throw new Error('当前目录非项目根（缺 app.json）。请 cd 到项目根再跑 prebuild。');
  }
}
