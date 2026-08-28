import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { nodeCheck } from '../src/env-checks/tool-checks';
import { doctor } from '../src/commands/doctor';
import { env } from '../src/commands/env';
import type { CheckContext, Probe } from '../src/env-checks/types';

const ctxWith = (probe: Probe, existsSync: (p: string) => boolean = () => false): CheckContext => ({
  projectRoot: null,
  probe,
  existsSync,
});

const probeReturning = (stdout: string): Probe => (() => ({ ok: true, stdout })) as unknown as Probe;

describe('nodeCheck 版本解析（规范 2.3：解析失败 = warn 版本未知，不误报）', () => {
  it('输出无法解析 → warn 版本未知（工具在，不因解析问题误报 fail）', () => {
    const result = nodeCheck(ctxWith(probeReturning('garbage output\n')));
    expect(result.status).toBe('warn');
    expect(result.detail).toContain('版本未知');
  });

  it('空输出 → warn 版本未知', () => {
    const result = nodeCheck(ctxWith(probeReturning('')));
    expect(result.status).toBe('warn');
    expect(result.detail).toContain('版本未知');
  });

  it('v20.11.0 → ok', () => {
    expect(nodeCheck(ctxWith(probeReturning('v20.11.0\n'))).status).toBe('ok');
  });

  it('v16.0.0（低于最低要求）→ fail', () => {
    const result = nodeCheck(ctxWith(probeReturning('v16.0.0\n')));
    expect(result.status).toBe('fail');
    expect(result.detail).toContain('16.0.0');
  });

  it('未找到 node → fail 未找到', () => {
    const probe = (() => ({ ok: false, stdout: '' })) as unknown as Probe;
    expect(nodeCheck(ctxWith(probe)).status).toBe('fail');
  });
});

describe('doctor 三段式输出与退出码（规范第 4/5 节）', () => {
  let tmp: string;
  let origCwd: string;
  let lines: string[];
  let spy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-'));
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({ name: 'x' }));
    origCwd = process.cwd();
    process.chdir(tmp);
    lines = [];
    spy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      lines.push(args.join(' '));
    });
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      lines.push(args.join(' '));
    });
  });
  afterEach(() => {
    spy.mockRestore();
    vi.restoreAllMocks();
    process.chdir(origCwd);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  const okProbe: Probe = ((cmd: string) => ({
    ok: true,
    stdout: cmd === 'node' ? 'v20.11.0\n' : cmd === 'hdc' ? 'Ver: 1.2.3\n' : '1.0.0\n',
  })) as unknown as Probe;
  // deveco 与 harmony/ 存在，hvigorw 不存在（走 probe）
  const exists = (p: string) => p.endsWith('DevEco-Studio.app') || p.endsWith(`${path.sep}harmony`);
  const run = () => doctor([], { probe: okProbe, existsSync: exists });

  it('环境段仅计数 + 项目段明细 + 汇总下一步行；全 ok 退出码 0', async () => {
    await run();
    const out = lines.join('\n');
    expect(out).toMatch(/环境.*✓ 6 \/ ⚠ 0 \/ ✗ 0/); // 环境段只计数，不逐项打印
    expect(out).toContain('项目');
    expect(out).toMatch(/harmony\/ 工程/); // 项目段打印明细
    expect(out).toMatch(/汇总：环境与项目检查全部通过/); // 全 ok 无需下一步行
    expect(process.exitCode).toBe(0);
  });

  it('环境段计数不含明细行（与 env 命令输出区分）', async () => {
    await run();
    const out = lines.join('\n');
    expect(out).not.toMatch(/Node\.js\s+v20/); // 环境明细不在 doctor 输出中
  });

  it('harmony/ 缺失 → 项目段 fail + 退出码 1', async () => {
    await doctor([], { probe: okProbe, existsSync: (p: string) => p.endsWith('DevEco-Studio.app') });
    const out = lines.join('\n');
    expect(out).toMatch(/harmony\/ 工程/);
    expect(out).toMatch(/不存在/);
    expect(process.exitCode).toBe(1);
  });

  it('依赖基线偏离 → warn + 退出码 2 + 下一步给建议', async () => {
    fs.writeFileSync(
      path.join(tmp, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { react: '^17.0.0' } }),
    );
    await run();
    const out = lines.join('\n');
    expect(out).toMatch(/依赖基线/);
    expect(out).toMatch(/汇总：可继续开发，但有 \d+ 项警告。下一步：/);
    expect(process.exitCode).toBe(2);
  });

  it('非项目目录（缺 package.json）→ fail 提示 cd 到项目根 + 退出码 1', async () => {
    fs.rmSync(path.join(tmp, 'package.json'));
    await run();
    const out = lines.join('\n');
    expect(out).toMatch(/项目根|package\.json/);
    expect(process.exitCode).toBe(1);
  });

  it('退出码隔离：进程残留 exitCode 被入口重置，多次调用独立结算（规范 5 节）', async () => {
    process.exitCode = 1; // 模拟上一次命令残留
    await run(); // 全 ok
    expect(process.exitCode).toBe(0);
    // 触发 fail 场景（harmony 缺失）
    await doctor([], { probe: okProbe, existsSync: (p: string) => p.endsWith('DevEco-Studio.app') });
    expect(process.exitCode).toBe(1);
    await run(); // 再次全 ok，1 不残留
    expect(process.exitCode).toBe(0);
  });

  it('env 命令同进程复用：残留 2 被重置后独立结算', async () => {
    process.exitCode = 2;
    await env([], { probe: okProbe, existsSync: exists });
    expect(process.exitCode).toBe(0); // 全 ok 环境 + 非阻断项目检查
  });
});
