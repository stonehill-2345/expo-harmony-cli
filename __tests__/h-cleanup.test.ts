import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { cleanupHTemplateCode, cleanupStaleIosTemplateOverrides } from '../src/h-cleanup';

describe('cleanupHTemplateCode', () => {
  let tmp: string;
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hclean-'));
    fs.mkdirSync(path.join(tmp, 'app'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'components', 'ui'), { recursive: true });
    // C-1: 真实 default 模版 _layout.tsx —— useFonts 参数含 require() 嵌套括号
    fs.writeFileSync(path.join(tmp, 'app/_layout.tsx'), `
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
const [loaded] = useFonts({
  SpaceMono: require('./assets/fonts/SpaceMono-Regular.ttf'),
});
SplashScreen.preventAutoHideAsync();
`);
    fs.writeFileSync(path.join(tmp, 'components/haptic-tab.tsx'), `
import * as Haptics from 'expo-haptics';
Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
`);
    fs.writeFileSync(path.join(tmp, 'components/external-link.tsx'), `
import { Href, Link } from 'expo-router';
import { openBrowserAsync, WebBrowserPresentationStyle } from 'expo-web-browser';
import { type ComponentProps } from 'react';

type Props = Omit<ComponentProps<typeof Link>, 'href'> & { href: Href & string };

export function ExternalLink({ href, ...rest }: Props) {
  return <Link target="_blank" {...rest} href={href} onPress={async (event) => {
    event.preventDefault();
    await openBrowserAsync(href, { presentationStyle: WebBrowserPresentationStyle.AUTOMATIC });
  }} />;
}
`);
    // I-1: 真实 default 模版 IconSymbol.tsx —— 动态 type import('expo-symbols')
    fs.writeFileSync(path.join(tmp, 'components/ui/icon-symbol.tsx'), `
import { SymbolWeight } from 'expo-symbols';
const mapping: Partial<Record<import('expo-symbols').SymbolViewProps['name'], string>> = {};
const w: SymbolWeight = 'regular';
`);
    fs.writeFileSync(path.join(tmp, 'components/ui/icon-symbol.ios.tsx'), "import { SymbolView } from 'expo-symbols';\n");
    fs.writeFileSync(path.join(tmp, 'components/ui/TabBarBackground.tsx'), "export default undefined;\n\nexport function useBottomTabOverflow() {\n  return 0;\n}\n");
    fs.writeFileSync(path.join(tmp, 'components/ui/TabBarBackground.ios.tsx'), "import { BlurView } from 'expo-blur';\n");
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it('删 _layout 的 useFonts 与 SplashScreen 调用，不添加 splash-screen2', () => {
    cleanupHTemplateCode(tmp, { removed: ['expo-font', 'expo-splash-screen', 'expo-haptics', 'expo-symbols', 'expo-web-browser'], replaced: [] });
    const layout = fs.readFileSync(path.join(tmp, 'app/_layout.tsx'), 'utf8');
    expect(layout).not.toContain('useFonts');
    expect(layout).not.toContain("from 'expo-font'");
    expect(layout).not.toContain("from 'expo-splash-screen'");
    expect(layout).not.toContain('SplashScreen');
    expect(layout).not.toContain('expo-splash-screen2');
    // C-1: 确认无损坏残留（const [loaded] = , 或 const [loaded] = ;）
    expect(layout).not.toMatch(/const\s*\[.*\]\s*=\s*[,;]/);
  });

  it('删 HapticTab 的 Haptics 调用 + import', () => {
    cleanupHTemplateCode(tmp, { removed: ['expo-haptics'], replaced: [] });
    const tab = fs.readFileSync(path.join(tmp, 'components/haptic-tab.tsx'), 'utf8');
    expect(tab).not.toContain('Haptics');
    expect(tab).not.toContain("from 'expo-haptics'");
  });

  it('SDK 54 external-link 移除 WebBrowser 并保留 Router Link', () => {
    cleanupHTemplateCode(tmp, { removed: ['expo-web-browser'], replaced: [] });
    const link = fs.readFileSync(path.join(tmp, 'components/external-link.tsx'), 'utf8');
    expect(link).not.toContain('WebBrowser');
    expect(link).not.toContain('openBrowserAsync');
    expect(link).not.toContain("from 'expo-web-browser'");
    expect(link).toContain('export function ExternalLink');
    expect(link).toContain('href={href}');
  });

  it('删 IconSymbol 的 SymbolWeight + 动态 type import(expo-symbols)', () => {
    cleanupHTemplateCode(tmp, { removed: ['expo-symbols'], replaced: [] });
    const icon = fs.readFileSync(path.join(tmp, 'components/ui/icon-symbol.tsx'), 'utf8');
    expect(icon).not.toContain('SymbolWeight');
    expect(icon).not.toContain("from 'expo-symbols'");
    // I-1: 确认动态 type import 也被删
    expect(icon).not.toContain("import('expo-symbols')");
  });

  it('删除 expo-blur 与 expo-symbols 后，移除会被 iOS Metro 优先解析的覆盖文件', () => {
    cleanupHTemplateCode(tmp, { removed: ['expo-blur', 'expo-symbols'], replaced: [] });
    expect(fs.existsSync(path.join(tmp, 'components/ui/TabBarBackground.ios.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(tmp, 'components/ui/icon-symbol.ios.tsx'))).toBe(false);
  });

  it('删除 expo-blur 后，iOS 滚动内容避让完整 tab bar 高度', () => {
    cleanupHTemplateCode(tmp, { removed: ['expo-blur'], replaced: [] });
    const tabBar = fs.readFileSync(path.join(tmp, 'components/ui/TabBarBackground.tsx'), 'utf8');
    expect(tabBar).toContain("from '@react-navigation/bottom-tabs'");
    expect(tabBar).toContain("from 'react-native'");
    expect(tabBar).toContain('useBottomTabBarHeight()');
    expect(tabBar).toContain("Platform.OS === 'ios' ? tabHeight : 0");
  });

  it('迁移不误删仍声明 expo-blur 与 expo-symbols 的业务项目文件', () => {
    fs.writeFileSync(path.join(tmp, 'package.json'), JSON.stringify({
      dependencies: { 'expo-blur': '~14.0.3', 'expo-symbols': '~0.2.0' },
    }));
    cleanupStaleIosTemplateOverrides(tmp);
    expect(fs.existsSync(path.join(tmp, 'components/ui/TabBarBackground.ios.tsx'))).toBe(true);
    expect(fs.existsSync(path.join(tmp, 'components/ui/icon-symbol.ios.tsx'))).toBe(true);
  });
});
