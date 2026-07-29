import * as fs from 'fs';
import * as path from 'path';

interface HCleanupInput {
  removed: string[];
  replaced: Array<{ from: string; to: string }>;
}

const TAB_BAR_BACKGROUND_FALLBACK_TSX = `import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Platform } from 'react-native';

export default undefined;

export function useBottomTabOverflow() {
  const tabHeight = useBottomTabBarHeight();
  return Platform.OS === 'ios' ? tabHeight : 0;
}
`;

/**
 * 按 remove/replace 结果清理模版 TSX（P1 参考 F 节 H 类 7 包表）。
 *
 * H 类 7 包：expo-blur / expo-font / expo-haptics / expo-splash-screen
 *           / expo-symbols / expo-system-ui / expo-web-browser
 *
 * 清理点：
 * - expo-font 删除 → 删 app/_layout.tsx 的 useFonts（import + 调用）
 * - expo-splash-screen 删除 → 删 app/_layout.tsx 的 import 与调用
 * - expo-haptics 删除 → 删 components/HapticTab.tsx 的 Haptics（import + 调用）
 * - expo-web-browser 删除 → 删 components/ExternalLink.tsx 的 WebBrowser
 * - expo-symbols 删除 → 删 components/ui/IconSymbol.tsx 的 SymbolWeight type import 与 IconSymbol.ios.tsx
 * - expo-blur 删除 → 删 TabBarBackground.ios.tsx，回退到跨平台同名文件
 *
 * 注：正则清理是 MVP 简化（基于 default 模版 TSX 典型 import/调用形态）。
 * default 模版升级可能失配——P3 K2 验证 bundle 跑通时回归。
 */
export function cleanupHTemplateCode(targetDir: string, input: HCleanupInput): void {
  const layoutPath = path.join(targetDir, 'app', '_layout.tsx');
  const hapticTabPath = path.join(targetDir, 'components', 'HapticTab.tsx');
  const externalLinkPath = path.join(targetDir, 'components', 'ExternalLink.tsx');
  const iconSymbolPath = path.join(targetDir, 'components', 'ui', 'IconSymbol.tsx');
  const iconSymbolIosPath = path.join(targetDir, 'components', 'ui', 'IconSymbol.ios.tsx');
  const tabBarBackgroundPath = path.join(targetDir, 'components', 'ui', 'TabBarBackground.tsx');
  const tabBarBackgroundIosPath = path.join(targetDir, 'components', 'ui', 'TabBarBackground.ios.tsx');

  // expo-font 删除 → 删 _layout 的 useFonts（import + 调用）
  // C-1: 真实 default 模版 useFonts 参数含嵌套括号（require('./xxx.ttf')），
  //       旧正则 [^)]* 在第一个 ) 截断 → 残留 "const [loaded] = ," 语法错误。
  //       改用 [^()]*(?:\([^()]*\)[^()]*)* 匹配一层嵌套括号。
  //       另外删整个 "const [...] = useFonts(...)" 赋值语句，避免残留空赋值。
  if (input.removed.includes('expo-font') && fs.existsSync(layoutPath)) {
    let c = fs.readFileSync(layoutPath, 'utf8');
    // 删 import { useFonts } from 'expo-font'
    c = c.replace(/import\s*\{[^}]*useFonts[^}]*\}\s*from\s*['"]expo-font['"];?\s*\n?/g, '');
    // 改为替换 useFonts(...) 为 [true]：保留 loaded 声明（下游 useEffect/if 引用 loaded），
    // 避免删整行后 loaded 未声明 → TS Cannot find name 'loaded' + 运行时白屏
    c = c.replace(/(const\s*\[[^\]]*\]\s*=\s*)useFonts\([^()]*(?:\([^()]*\)[^()]*)*\);?/g, '$1[true];');
    // 兜底：若仍有裸 useFonts(...) 调用（无 const 前缀），也删
    c = c.replace(/useFonts\([^()]*(?:\([^()]*\)[^()]*)*\);?\s*\n?/g, '');
    // 兜底：删残留的空赋值 "const [loaded] = ;" 或 "const [loaded] = ,"
    c = c.replace(/const\s*\[[^\]]*\]\s*=\s*[;,]\s*\n?/g, '');
    fs.writeFileSync(layoutPath, c);
  }

  // expo-splash-screen 删除 → 删 import、preventAutoHideAsync 和 hideAsync 调用。
  if (input.removed.includes('expo-splash-screen') && fs.existsSync(layoutPath)) {
    let c = fs.readFileSync(layoutPath, 'utf8');
    c = c.replace(/import\s*\*?\s*as\s*SplashScreen\s*from\s*['"]expo-splash-screen['"];?\s*\n?/g, '');
    c = c.replace(/(?:await\s+)?SplashScreen\.(?:preventAutoHideAsync|hideAsync)\([^;]*\);?\s*\n?/g, '');
    fs.writeFileSync(layoutPath, c);
  }

  // expo-haptics 删除 → 删 HapticTab 的 Haptics（import + 调用）
  if (input.removed.includes('expo-haptics') && fs.existsSync(hapticTabPath)) {
    let c = fs.readFileSync(hapticTabPath, 'utf8');
    c = c.replace(/import\s*\*?\s*as\s*Haptics\s*from\s*['"]expo-haptics['"];?\s*\n?/g, '');
    c = c.replace(/Haptics\.[^\n;]*;?\s*\n?/g, '');
    fs.writeFileSync(hapticTabPath, c);
  }

  // expo-web-browser 删除 → 删 ExternalLink 的 WebBrowser（import + openBrowserAsync）
  // I-1: 真实 default 模版用具名导入 import { openBrowserAsync } from 'expo-web-browser'
  //       （不是 namespace import * as WebBrowser）。需同时覆盖两种形态 + 调用。
  if (input.removed.includes('expo-web-browser') && fs.existsSync(externalLinkPath)) {
    let c = fs.readFileSync(externalLinkPath, 'utf8');
    // 删 namespace import：import * as WebBrowser from 'expo-web-browser'
    c = c.replace(/import\s*\*?\s*as\s*WebBrowser\s*from\s*['"]expo-web-browser['"];?\s*\n?/g, '');
    // 删具名 import：import { openBrowserAsync } from 'expo-web-browser'（可能含其它具名）
    c = c.replace(/import\s*\{[^}]*openBrowserAsync[^}]*\}\s*from\s*['"]expo-web-browser['"];?\s*\n?/g, '');
    // 删调用：含可选 await 前缀（避免残留 "await }" 语法错误）+ 可选 WebBrowser. 前缀
    c = c.replace(/(?:await\s+)?(?:WebBrowser\.)?openBrowserAsync\([^()]*\);?\s*\n?/g, '');
    fs.writeFileSync(externalLinkPath, c);
  }

  // expo-symbols 删除 → 删 IconSymbol.tsx 的 SymbolWeight type import 与 iOS 专用实现。
  // iOS Metro 会优先解析 .ios.tsx；保留该文件会继续请求已移除的 expo-symbols。
  // I-1: 真实 default 模版用动态 type import：import('expo-symbols').SymbolViewProps['name']
  //       旧正则只删 import { SymbolWeight }，不匹配动态 type → 残留 import('expo-symbols')。
  //       删整行会破坏 Record<K,V> 多行结构 → 改为替换为 string（安全 fallback）。
  if (input.removed.includes('expo-symbols') && fs.existsSync(iconSymbolPath)) {
    let c = fs.readFileSync(iconSymbolPath, 'utf8');
    // 删静态 type import：import { SymbolWeight } from 'expo-symbols'
    c = c.replace(/import\s*\{[^}]*SymbolWeight[^}]*\}\s*from\s*['"]expo-symbols['"];?\s*\n?/g, '');
    // 替换动态 type import('expo-symbols').XXX['YYY'] 为 string（保持 Record<K,V> 结构完整）
    c = c.replace(/import\(['"]expo-symbols['"]\)\.\w+(?:\[[^\]]*\])*/g, 'string');
    // 兜底：删其它残留 SymbolWeight 引用行
    c = c.replace(/[^\n]*SymbolWeight[^\n]*\n?/g, '');
    fs.writeFileSync(iconSymbolPath, c);
  }

  if (input.removed.includes('expo-symbols')) {
    fs.rmSync(iconSymbolIosPath, { force: true });
  }

  // 删除 expo-blur 后移除 iOS 覆盖文件，Metro 将回退至 TabBarBackground.tsx。
  if (input.removed.includes('expo-blur')) {
    fs.rmSync(tabBarBackgroundIosPath, { force: true });
    fs.mkdirSync(path.dirname(tabBarBackgroundPath), { recursive: true });
    fs.writeFileSync(tabBarBackgroundPath, TAB_BAR_BACKGROUND_FALLBACK_TSX);
  }
}

/**
 * 迁移早期 CLI 创建的项目：仅在依赖已缺失时清理 Metro 会优先加载的 iOS 模板覆盖文件。
 */
export function cleanupStaleIosTemplateOverrides(targetDir: string): void {
  const packageJsonPath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(packageJsonPath)) return;

  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const dependencies = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const removed = ['expo-blur', 'expo-symbols'].filter(name => !dependencies[name]);
  if (removed.length > 0) {
    cleanupHTemplateCode(targetDir, { removed, replaced: [] });
  }
}
