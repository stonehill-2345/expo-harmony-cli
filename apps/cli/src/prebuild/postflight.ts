import * as fs from 'fs';
import * as path from 'path';
import { log } from '../utils/log';

/** 后置校验 + 提示（harmony/AppScope/app.json5 存在 + 原生构建主路径）。*/
export function postflight(projectRoot: string, ranHarmony: boolean): void {
  if (ranHarmony) {
    const appJson5 = path.join(projectRoot, 'harmony', 'AppScope', 'app.json5');
    if (!fs.existsSync(appJson5)) {
      log.warn('harmony/AppScope/app.json5 未生成，请检查生成器调用');
    } else {
      log.success('HarmonyOS 工程已生成：harmony/');
    }
    log.info('下一步：\n  cd harmony && ohpm install （或用 DevEco Studio 打开 harmony/）');
  }
}
