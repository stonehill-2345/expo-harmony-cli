import * as fs from 'fs';
import * as path from 'path';
import { resolvePm } from '../lib/pkg-manager';

const NPMRC_MANAGED_MARKER = 'expo-harmony-cli:managed';
const HOIST_VALUE = 'hoisted';

/**
 * pnpm 项目注入 node-linker=hoisted。
 *
 * React Native 的 @react-native/assets-registry 是传递依赖，pnpm 默认不提升到顶层。
 * release bundle 时，PNG asset 被 transformer 转成 require('@react-native/assets-registry/registry')，
 * 解析起点为项目根（PNG 所在目录向上），根 node_modules 无该包 → Unable to resolve。
 * node-linker=hoisted 让 pnpm 用 flat 结构（Expo 官方对 pnpm 的标准要求），传递依赖提升到顶层。
 *
 * - 非 pnpm（npm/yarn/bun）：跳过（默认 flat，无需；node-linker 对它们也无害）。
 * - 已含管理标记 或 node-linker=hoisted：跳过（幂等）。
 * - 已有 node-linker=其他值（如 pnp）：不覆盖，console.warn（尊重用户配置）。
 * - 否则：追加管理块（保留原内容）。
 */
export function ensureNpmrcHoisted(targetDir: string): void {
  if (resolvePm([], targetDir) !== 'pnpm') return;

  const npmrcPath = path.join(targetDir, '.npmrc');
  const existing = fs.existsSync(npmrcPath) ? fs.readFileSync(npmrcPath, 'utf8') : '';

  if (existing.includes(NPMRC_MANAGED_MARKER)) return;

  const nodeLinkerMatch = existing.match(/^node-linker\s*=\s*(.+?)\s*$/m);
  if (nodeLinkerMatch) {
    const value = nodeLinkerMatch[1].trim();
    if (value === HOIST_VALUE) return;
    console.warn(
      `[expo-harmony-cli] 检测到 .npmrc 已配置 node-linker=${value}（非 hoisted）。` +
        'Expo + pnpm 需 node-linker=hoisted 才能正确打包 RN 的 PNG asset；请手动确认是否覆盖。',
    );
    return;
  }

  const prefix = existing === '' || existing.endsWith('\n') ? '' : '\n';
  const block = `${prefix}# ${NPMRC_MANAGED_MARKER}
# Expo + pnpm 需要 node-linker=hoisted：@react-native/assets-registry 是 RN 的
# 传递依赖，pnpm 默认不提升，会导致 release bundle 解析 PNG asset 失败。
node-linker=hoisted
`;
  fs.writeFileSync(npmrcPath, existing + block);
}
