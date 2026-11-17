import fs from 'fs';
import path from 'path';

/**
 * 已核实环境：Xcode 27.2（Build 27B52）最低接受 IPHONEOS_DEPLOYMENT_TARGET 15.0
 * （xcodebuild 报错区间 15.0–27.2.x），而 SDK54 时代第三方 podspec 携带旧值
 * （实测 SDWebImage-SDWebImage 资源 bundle target 为 9.0）。RN 0.82.1 的
 * updateOSDeploymentTarget 只遍历 pod_target_installation_results，不覆盖 Pods 工程
 * 的 aggregate/resource bundle targets，故低值残留并阻断构建。
 *
 * 修复与已验证消费者方案完全一致（C/20261117-01-android-ios-smoke）：在 Podfile
 * post_install 块内、react_native_post_install(...) 调用之后插入统一抬升；
 * 阈值语义 = “低于 15.0 的抬到下限”，下限优先取 RN 的 min_ios_version_supported
 * （0.82.1 = 15.1），取不到时回退 15.1。幂等，带受管标记。
 */
export const PODFILE_PATCH_MARKER = '# expo-harmony-cli: pod deployment target floor';

export type PodfilePatchResult = { patched: boolean; reason?: string };

const RUBY_PATCH_LINES = [
  (indent: string) => `${indent}${PODFILE_PATCH_MARKER} (compatible floor for Xcode 27.2-era toolchains; verified consumer behavior)`,
  (indent: string) => `${indent}__ehc_min_ios = defined?(Pod::Helpers::Constants) && Pod::Helpers::Constants.respond_to?(:min_ios_version_supported) ? Pod::Helpers::Constants.min_ios_version_supported.to_s : '15.1'`,
  (indent: string) => `${indent}installer.pods_project.targets.each do |target|`,
  (indent: string) => `${indent}  target.build_configurations.each do |config|`,
  (indent: string) => `${indent}    if config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < 15.0`,
  (indent: string) => `${indent}      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = __ehc_min_ios`,
  (indent: string) => `${indent}    end`,
  (indent: string) => `${indent}  end`,
  (indent: string) => `${indent}end`,
];

/** post_install 块内 react_native_post_install(...) 调用结束行（闭括号独占行）之后插入。 */
export function ensureIosPodfileDeploymentTarget(projectRoot: string): PodfilePatchResult {
  const podfilePath = path.join(projectRoot, 'ios', 'Podfile');
  if (!fs.existsSync(podfilePath)) {
    return { patched: false, reason: 'no Podfile' };
  }
  const source = fs.readFileSync(podfilePath, 'utf8');
  if (source.includes(PODFILE_PATCH_MARKER)) {
    return { patched: false, reason: 'already patched' };
  }
  const lines = source.split('\n');
  const postInstallIndex = lines.findIndex(line => /^\s*post_install\s+do\s+\|installer\|/.test(line));
  if (postInstallIndex === -1) {
    return { patched: false, reason: 'no post_install block' };
  }
  const blockEndIndex = findBlockEnd(lines, postInstallIndex);
  const reactCallIndex = lines.findIndex(
    (line, i) => i > postInstallIndex && i < blockEndIndex && /^\s*react_native_post_install\(/.test(line)
  );
  let insertAfter: number;
  if (reactCallIndex !== -1) {
    // 与已验证消费者一致：插在 react_native_post_install(...) 调用之后。
    insertAfter = findCallCloseLine(lines, reactCallIndex, blockEndIndex);
  } else {
    insertAfter = postInstallIndex;
  }
  const indent = lines[insertAfter].match(/^\s+/)?.[0] ?? '  ';
  lines.splice(insertAfter + 1, 0, ...RUBY_PATCH_LINES.map(f => f(indent)));
  fs.writeFileSync(podfilePath, lines.join('\n'));
  return { patched: true };
}

/** 从 post_install 行起找块的收尾 `end` 行号。 */
function findBlockEnd(lines: string[], start: number): number {
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    depth += (lines[i].match(/\bdo\b\s*(\|\w+\|)?\s*$/)?.length ?? 0) > 0 ? 1 : 0;
    if (/^\s*end\s*$/.test(lines[i])) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return lines.length - 1;
}

/** 从调用起始行找闭括号所在行（容忍多行参数与尾逗号）。 */
function findCallCloseLine(lines: string[], start: number, limit: number): number {
  let depth = 0;
  for (let i = start; i <= limit; i++) {
    for (const ch of lines[i]) {
      if (ch === '(') depth += 1;
      if (ch === ')') depth -= 1;
    }
    if (depth <= 0 && i > start) return i;
    if (depth <= 0 && i === start && lines[start].includes(')')) return start;
  }
  return start;
}
