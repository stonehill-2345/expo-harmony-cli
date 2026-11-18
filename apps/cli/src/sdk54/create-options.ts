import type { Pm } from '../lib/pkg-manager';
import type { SdkVersion } from '../version-matrix';

export type Sdk54Template = 'blank-typescript' | 'default';

export interface ParsedCreateArgs {
  projectName: string;
  requestedSdk: SdkVersion | null;
  template: Sdk54Template;
  packageManager: Pm;
  rawArgs: string[];
}

const SAFE_PROJECT_NAME = /^[a-z0-9][a-z0-9._-]*$/;
const PACKAGE_MANAGER_FLAGS: Record<string, Pm> = {
  '--npm': 'npm',
  '--pnpm': 'pnpm',
  '--yarn': 'yarn',
  '--bun': 'bun',
};

function sdkValue(value: string | undefined): SdkVersion {
  if (value === '52') return 'sdk-52';
  if (value === '54') return 'sdk-54';
  throw new Error('--sdk 仅支持 52 或 54，例如 --sdk=52 或 --sdk 54');
}

function templateValue(value: string | undefined): Sdk54Template {
  if (value === 'blank-typescript' || value === 'default') return value;
  throw new Error('--template 仅支持 blank-typescript 或 default');
}

export function parseCreateArgs(args: string[]): ParsedCreateArgs {
  let projectName: string | undefined;
  let requestedSdk: SdkVersion | null = null;
  let template: Sdk54Template = 'default';
  let packageManager: Pm = 'pnpm';
  let sdkSeen = false;
  let templateSeen = false;
  let packageManagerSeen = false;

  for (let index = 0; index < args.length; index++) {
    const arg = args[index];

    if (arg === '--sdk' || arg.startsWith('--sdk=')) {
      if (sdkSeen) throw new Error('--sdk 只能指定一次');
      sdkSeen = true;
      const value = arg === '--sdk' ? args[++index] : arg.slice('--sdk='.length);
      requestedSdk = sdkValue(value);
      continue;
    }

    if (arg === '--template' || arg.startsWith('--template=')) {
      if (templateSeen) throw new Error('--template 只能指定一次');
      templateSeen = true;
      const value = arg === '--template' ? args[++index] : arg.slice('--template='.length);
      if (value === undefined) throw new Error('--template 缺少值，仅支持 blank-typescript 或 default');
      template = templateValue(value);
      continue;
    }

    const selectedPackageManager = PACKAGE_MANAGER_FLAGS[arg];
    if (selectedPackageManager) {
      if (packageManagerSeen) throw new Error('包管理器只能指定一次：--npm、--pnpm、--yarn 或 --bun');
      packageManagerSeen = true;
      packageManager = selectedPackageManager;
      continue;
    }

    if (arg.startsWith('-')) throw new Error(`未知 create 选项：${arg}`);
    if (projectName !== undefined) throw new Error('create 仅支持一个项目名');
    projectName = arg;
  }

  if (!projectName) throw new Error('用法: expo-harmony-cli <project-name> [--sdk=52|54]');
  if (!SAFE_PROJECT_NAME.test(projectName)) {
    throw new Error('项目名仅支持小写字母、数字、点、下划线和连字符，且必须以字母或数字开头。');
  }

  return {
    projectName,
    requestedSdk,
    template,
    packageManager,
    rawArgs: [...args],
  };
}

export function assertCreateSelectionSupported(
  parsed: ParsedCreateArgs,
  sdk: 'sdk-54',
): asserts parsed is ParsedCreateArgs & { packageManager: 'npm' | 'pnpm' };
export function assertCreateSelectionSupported(parsed: ParsedCreateArgs, sdk: 'sdk-52'): void;
export function assertCreateSelectionSupported(parsed: ParsedCreateArgs, sdk: SdkVersion): void {
  if (sdk === 'sdk-52' && parsed.template !== 'default') {
    throw new Error('SDK 52 仅支持 default 模板');
  }
  if (sdk === 'sdk-54' && parsed.packageManager !== 'npm' && parsed.packageManager !== 'pnpm') {
    throw new Error('SDK 54 仅支持 npm 或 pnpm；Yarn/Bun 暂不支持');
  }
}
