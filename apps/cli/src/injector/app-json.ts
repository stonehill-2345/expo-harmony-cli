import * as fs from 'fs';
import * as path from 'path';
import { buildBundleName } from '../utils/bundle-name';

/** 读现有 app.json，追加 harmony 整块 + android.package 兜底，并移除默认模板的 Splash 插件。*/
export function injectHarmonyBlock(targetDir: string, slug: string): void {
  const appJsonPath = path.join(targetDir, 'app.json');
  const app = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));

  if (!app.expo) throw new Error('app.json 缺 expo 块');
  if (!app.expo.android) app.expo.android = {};
  if (!app.expo.android.package) app.expo.android.package = buildBundleName(slug);

  app.expo.harmony = {
    name: slug,
    package: buildBundleName(slug),
    icon: './assets/images/icon.png',
    version: '1.0.0',
    orientation: 'portrait',
    splash: { image: './assets/images/splash-icon.png', backgroundColor: '#ffffff' },
  };

  removeAppJsonPlugins(app, ['expo-splash-screen', 'expo-splash-screen2']);

  fs.writeFileSync(appJsonPath, JSON.stringify(app, null, 2));
}

function removeAppJsonPlugins(app: { expo?: { plugins?: unknown[] } }, names: string[]): void {
  const expo = app.expo;
  const plugins = expo?.plugins;
  if (!Array.isArray(plugins)) return;
  expo!.plugins = plugins.filter((plugin) => {
    const name = typeof plugin === 'string' ? plugin : Array.isArray(plugin) && typeof plugin[0] === 'string' ? plugin[0] : null;
    return name === null || !names.includes(name);
  });
}

/**
 * 同步 app.json plugins 数组中的包名替换。
 *
 * plugins 条目形态：
 *   - 字符串："expo-splash-screen"
 *   - 元组：["expo-splash-screen", { ...opts }]
 *
 * 将包名 === from 的条目替换为 to（保留 opts）。用于 replace 类适配
 * （如 expo-splash-screen → expo-splash-screen2），避免 prebuild 找不到原包报错。
 * app.json 不存在 / 无 plugins / 解析失败时静默跳过。
 */
export function syncAppJsonPlugins(targetDir: string, from: string, to: string): void {
  const appJsonPath = path.join(targetDir, 'app.json');
  if (!fs.existsSync(appJsonPath)) return;
  const raw = fs.readFileSync(appJsonPath, 'utf8');
  let app: any;
  try {
    app = JSON.parse(raw);
  } catch {
    return; // app.json 解析失败，不阻塞扫描
  }
  const plugins: unknown = app?.expo?.plugins;
  if (!Array.isArray(plugins)) return;

  let changed = false;
  for (let i = 0; i < plugins.length; i++) {
    const entry = plugins[i];
    if (typeof entry === 'string' && entry === from) {
      plugins[i] = to;
      changed = true;
    } else if (Array.isArray(entry) && entry[0] === from) {
      entry[0] = to;
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(appJsonPath, JSON.stringify(app, null, 2));
  }
}

/**
 * 确保 Expo config plugin 以元组形式存在并带有默认参数。
 * 某些插件会直接解构第二个参数；仅靠 Expo 的自动插件发现会传入 undefined。
 */
export function ensureAppJsonPlugin(targetDir: string, name: string, defaultOptions: Record<string, unknown>): void {
  const appJsonPath = path.join(targetDir, 'app.json');
  if (!fs.existsSync(appJsonPath)) return;

  const app = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  if (!app.expo) throw new Error('app.json 缺 expo 块');
  if (!Array.isArray(app.expo.plugins)) app.expo.plugins = [];

  const index = app.expo.plugins.findIndex((entry: unknown) =>
    entry === name || (Array.isArray(entry) && entry[0] === name),
  );
  if (index === -1) {
    app.expo.plugins.push([name, defaultOptions]);
  } else if (app.expo.plugins[index] === name) {
    app.expo.plugins[index] = [name, defaultOptions];
  }

  fs.writeFileSync(appJsonPath, JSON.stringify(app, null, 2));
}

/** 仅移除精确匹配的插件条目，供 managed-state 清理 CLI 自己创建的配置。 */
export function removeAppJsonPlugin(targetDir: string, name: string): void {
  const appJsonPath = path.join(targetDir, 'app.json');
  if (!fs.existsSync(appJsonPath)) return;
  const app = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  const plugins: unknown = app?.expo?.plugins;
  if (!Array.isArray(plugins)) return;
  const next = plugins.filter(entry =>
    typeof entry === 'string' ? entry !== name : !(Array.isArray(entry) && entry[0] === name),
  );
  if (next.length === plugins.length) return;
  app.expo.plugins = next;
  fs.writeFileSync(appJsonPath, JSON.stringify(app, null, 2));
}
