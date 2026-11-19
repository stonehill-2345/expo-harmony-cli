import fs from 'fs';
import path from 'path';

/**
 * reanimated 4.x（含上游 SDK54 组合的 4.1.7）CMakeLists 硬编码从
 * `android/build/intermediates/cmake/<debug|release>/obj/<abi>/libworklets.so` 导入 worklets 产物，
 * 该路径是旧 AGP 的输出布局；RN 0.82 世代 AGP 将产物产在 `.cxx/<Config>/<hash>/obj/<abi>/`，
 * 导致 Android 链接必败。上游组合（RN 0.81 时代 AGP）与新布局存在时代差。
 *
 * 修复策略（2026-11-17 方案比较结论，证据见 C/20261117-01-android-ios-smoke/task.md）：
 * 直接指定输出目录无受支持的 AGP 注入点（per-ABI CMAKE_LIBRARY_OUTPUT_DIRECTORY 非一等能力），
 * 故采用受管复制块——来源绑定 worklets 自身 buildCMake 任务（变体+ABI 精确匹配）的 Gradle
 * 输出，reanimated 任务 dependsOn 该任务后于 doFirst 物化（REPLACE_EXISTING）。
 * 路径由 Gradle 子工程解析，不烘焙绝对路径。
 *
 * 版本门控与生命周期：仅在 reanimated 4.2.x + worklets 0.7.x（RNOH 0.82 锁定组合，
 * @react-native-ohos/react-native-worklets@1.0.x deps/peer 双锁 0.7.1）时注入/保留；
 * 版本不匹配时移除受管块（含旧版单标记块迁移），不动用户内容。
 */
const BLOCK_BEGIN = '// BEGIN expo-harmony-cli:worklets-so-link (managed block)';
const BLOCK_END = '// END expo-harmony-cli:worklets-so-link';
const LEGACY_MARKER = '// expo-harmony-cli:worklets-so-link';

const SNIPPET = `${BLOCK_BEGIN}
// reanimated 4.2.x CMakeLists 硬编码从 intermediates/cmake/<debug|release>/obj/<abi>/ 导入
// libworklets.so（旧 AGP 输出布局）；当前 AGP 产物在 .cxx/<Config>/<hash>/obj/<abi>/。
// 来源 = worklets 对应变体/ABI buildCMake 任务的 Gradle 输出（无 hash 歧义、不陈旧），
// reanimated 任务 dependsOn 生产任务后物化（覆盖更新）。仅适用于 reanimated 4.2.x + worklets 0.7.x。
def __ehcWorklets = subprojects.find { it.name == 'react-native-worklets' }
def __ehcReanimated = subprojects.find { it.name == 'react-native-reanimated' }
if (__ehcWorklets != null && __ehcReanimated != null) {
    __ehcReanimated.afterEvaluate {
        __ehcReanimated.tasks.matching { it.name.startsWith('buildCMake') }.configureEach { reanimatedTask ->
            def __ehcMatch = (reanimatedTask.name =~ /buildCMake(?:RelWithDebInfo|Debug)\\[([\\w-]+)\\]/)
            if (__ehcMatch.find()) {
                def __ehcAbi = __ehcMatch.group(1)
                def __ehcDebug = reanimatedTask.name.contains('Debug')
                def __ehcStaging = __ehcDebug ? 'Debug' : 'RelWithDebInfo'
                def __ehcProvider = __ehcWorklets.tasks.matching { t ->
                    t.name == "buildCMake\${__ehcStaging}[\${__ehcAbi}][worklets]"
                }
                reanimatedTask.dependsOn __ehcProvider
                reanimatedTask.doFirst {
                    // AGP cxx 任务的 outputs 不暴露产物路径，改从 worklets 工程的双根布局解析：
                    // .cxx/<Config>/<hash>/<abi>/ 与 intermediates/cxx/<Config>/<hash>/obj/<abi>/
                    // （Config/ABI 已由任务名绑定；同根多 hash 取最新 mtime——dependsOn 保证活动
                    // hash 刚完成构建，其产物必然最新，无跨变体串用）。
                    def __ehcSo = null
                    def __ehcRoots = [
                        new File(__ehcWorklets.projectDir, ".cxx/\${__ehcStaging}"),
                        new File(__ehcWorklets.buildDir, "intermediates/cxx/\${__ehcStaging}"),
                    ]
                    __ehcRoots.each { root ->
                        if (__ehcSo == null && root.isDirectory()) {
                            root.eachDir { hashDir ->
                                [new File(hashDir, __ehcAbi), new File(new File(hashDir, 'obj'), __ehcAbi)].each { abiDir ->
                                    def cand = new File(abiDir, 'libworklets.so')
                                    if (cand.exists() && (__ehcSo == null || cand.lastModified() > __ehcSo.lastModified())) {
                                        __ehcSo = cand
                                    }
                                }
                            }
                        }
                    }
                    if (__ehcSo != null && __ehcSo.exists()) {
                        def __ehcDest = new File(__ehcWorklets.buildDir,
                                "intermediates/cmake/\${__ehcDebug ? 'debug' : 'release'}/obj/\${__ehcAbi}/libworklets.so")
                        __ehcDest.parentFile.mkdirs()
                        java.nio.file.Files.copy(__ehcSo.toPath(), __ehcDest.toPath(),
                                java.nio.file.StandardCopyOption.REPLACE_EXISTING)
                    } else {
                        reanimatedTask.logger.warn(
                                "expo-harmony-cli: libworklets.so 输出未找到（\${__ehcStaging}/\${__ehcAbi}），跳过物化；如持续出现请检查 react-native-worklets 安装")
                    }
                }
            }
        }
    }
}
${BLOCK_END}`;

/** 依赖版本门控：RNOH 0.82 锁定组合。 */
const SUPPORTED = { reanimated: /^4\.2\.\d+$/, worklets: /^0\.7\.\d+$/ };

export type WorkletsGradlePatchResult = {
  patched: boolean;
  reason?: string;
  /** 版本不匹配且已移除旧受管块时给出说明。 */
  removedStale?: boolean;
};

function readVersion(projectRoot: string, name: string): string | null {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(projectRoot, 'node_modules', name, 'package.json'), 'utf8')
    );
    return pkg.version ?? null;
  } catch {
    return null;
  }
}

/** 移除受管块（新版 BEGIN/END 包围；旧版为文件尾部的单标记块），保留其余内容。 */
export function removeManagedBlock(source: string): string {
  const begin = source.indexOf(BLOCK_BEGIN);
  if (begin !== -1) {
    const end = source.indexOf(BLOCK_END, begin);
    if (end !== -1) {
      return (source.slice(0, begin) + source.slice(end + BLOCK_END.length)).replace(/\n{3,}/g, '\n\n');
    }
  }
  const legacy = source.indexOf(LEGACY_MARKER);
  if (legacy !== -1) {
    // 旧版块总是追加在文件末尾，删除标记行至文件尾。
    return source.slice(0, legacy).trimEnd() + '\n';
  }
  return source;
}

export function ensureWorkletsGradleLink(projectRoot: string): WorkletsGradlePatchResult {
  const buildGradlePath = path.join(projectRoot, 'android', 'build.gradle');
  if (!fs.existsSync(buildGradlePath)) {
    return { patched: false, reason: 'no android/build.gradle' };
  }
  const source = fs.readFileSync(buildGradlePath, 'utf8');
  const hasManaged = source.includes(BLOCK_BEGIN) || source.includes(LEGACY_MARKER);

  const reanimated = readVersion(projectRoot, 'react-native-reanimated');
  const worklets = readVersion(projectRoot, 'react-native-worklets');
  const supported =
    reanimated != null && worklets != null &&
    SUPPORTED.reanimated.test(reanimated) && SUPPORTED.worklets.test(worklets);

  if (!supported) {
    if (hasManaged) {
      fs.writeFileSync(buildGradlePath, removeManagedBlock(source));
      return {
        patched: false,
        reason: `unsupported combo (reanimated ${reanimated ?? 'absent'}, worklets ${worklets ?? 'absent'}); managed block removed`,
        removedStale: true,
      };
    }
    return {
      patched: false,
      reason: `unsupported combo (reanimated ${reanimated ?? 'absent'}, worklets ${worklets ?? 'absent'})`,
    };
  }

  if (hasManaged) {
    if (source.includes(BLOCK_BEGIN)) {
      return { patched: false, reason: 'already patched' };
    }
    // 旧版单标记块 → 迁移为新版受管块。
    fs.writeFileSync(buildGradlePath, removeManagedBlock(source).trimEnd() + '\n' + SNIPPET + '\n');
    return { patched: true, reason: 'migrated legacy block to managed block' };
  }
  fs.writeFileSync(buildGradlePath, source.trimEnd() + '\n' + SNIPPET + '\n');
  return { patched: true };
}

export const WORKLETS_GRADLE_MARKER = BLOCK_BEGIN;
