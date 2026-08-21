/** 从 userArgs 提取所有 --platform 值（支持 --platform ios / 多个 --platform / --platform=ios）*/
function extractPlatforms(userArgs: string[]): string[] {
  const platforms: string[] = [];
  for (let i = 0; i < userArgs.length; i++) {
    if (userArgs[i] === '--platform' && i + 1 < userArgs.length) {
      platforms.push(userArgs[i + 1]);
      i++;
    } else if (userArgs[i].startsWith('--platform=')) {
      platforms.push(userArgs[i].slice('--platform='.length));
    }
  }
  return platforms;
}

/** 过滤掉 --platform harmony（及 =harmony），保留 ios/android 的 --platform + 其它参数 */
function filterHarmonyPlatform(userArgs: string[]): string[] {
  const result: string[] = [];
  for (let i = 0; i < userArgs.length; i++) {
    if (userArgs[i] === '--platform' && i + 1 < userArgs.length) {
      if (userArgs[i + 1] !== 'harmony') {
        result.push(userArgs[i], userArgs[i + 1]);
      }
      i++;
    } else if (userArgs[i].startsWith('--platform=')) {
      if (userArgs[i].slice('--platform='.length) !== 'harmony') {
        result.push(userArgs[i]);
      }
    } else {
      result.push(userArgs[i]);
    }
  }
  return result;
}

export interface ResolveTasksResult {
  runNative: boolean;
  nativeArgs: string[];
  runHarmony: boolean;
}

/** §6.3 平台分流。无 --platform → 三端；ios/android → expo prebuild；harmony → 生成器。 */
export function resolveTasks(userArgs: string[]): ResolveTasksResult {
  const platforms = extractPlatforms(userArgs);

  const runHarmony = platforms.length === 0 || platforms.includes('harmony');
  const runNative =
    platforms.length === 0 || platforms.some((p) => p === 'ios' || p === 'android');
  const nativeArgs = filterHarmonyPlatform(userArgs).map((arg) =>
    arg === '--force' ? '--clean' : arg
  );

  return { runNative, nativeArgs, runHarmony };
}
