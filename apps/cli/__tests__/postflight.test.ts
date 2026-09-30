import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

vi.mock('../src/utils/log', () => ({
  log: { success: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

describe('postflight', () => {
  let tmp: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'postflight-'));
    fs.mkdirSync(path.join(tmp, 'harmony', 'AppScope'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'harmony', 'AppScope', 'app.json5'), '{}');
  });

  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('生成 HarmonyOS 工程后输出明确的 ohpm 与 DevEco 后续步骤', async () => {
    const { postflight } = await import('../src/prebuild/postflight');
    const { log } = await import('../src/utils/log');

    postflight(tmp, true);

    expect(log.success).toHaveBeenCalledWith('HarmonyOS 工程已生成：harmony/');
    expect(log.info).toHaveBeenCalledWith(
      '下一步：\n  cd harmony && ohpm install （或用 DevEco Studio 打开 harmony/）',
    );
  });
});
