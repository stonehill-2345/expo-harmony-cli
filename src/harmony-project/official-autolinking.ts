import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createRequire } from 'module';
import JSON5 from 'json5';
import type { HarmonyPackageMappingEntry } from './types';

/**
 * 官方 link-harmony 调用适配器（任务二）。
 *
 * 契约依据 docs/superpowers/specs/2026-09-09-official-autolink-contract.md，
 * 由 @react-native-oh/react-native-harmony-cli@0.77.71 真实 fixture 验证：
 * - func(argv, config, rawArgs) 无返回值，结果只能靠产物文件判定；
 * - includeNpmPackages 传 [] 即全量扫描（候选不受 mapping 白名单限制）；
 * - 预期错误（DescriptiveError）静默不抛，须以产物完整性兜底；
 * - 官方在既有 oh-package 基础上合并，覆盖识别必须排除拷入的旧键。
 */

export interface OfficialAutolinkingFile {
  path: string;
  content: string;
}

export interface OfficialAutolinkingResult {
  /** 官方链路整体是否可用（不可用时调用方回退批量自研）。 */
  ok: boolean;
  cliVersion?: string;
  failureReason?: string;
  /** 四个产物（path 指向真实 harmonyDir 下的目标路径，内容为官方临时产物原文）。 */
  files: OfficialAutolinkingFile[];
  /** 官方已完成注册的包（npm 名域：产物 ohPackageName 已归一，与 node_modules 扫描可比）。 */
  officialPackages: string[];
  /** 项目已安装且具备原生迹象（harmony 字段或 harmony/ 目录）但未被官方覆盖的包（npm 名域）。 */
  uncoveredPackages: string[];
}

const RNOH_CLI_PACKAGE = '@react-native-oh/react-native-harmony-cli';
const GENERATED_RELS = [
  'entry/src/main/ets/RNOHPackagesFactory.ets',
  'entry/src/main/cpp/RNOHPackagesFactory.h',
  'entry/src/main/cpp/autolinking.cmake',
  'oh-package.json5',
] as const;

const RNOH_FRAMEWORK_IMPORT = '@rnoh/react-native-openharmony';

/** 解析 ETS 产物中实际引入的适配包名（排除框架自身 import 与相对路径）。 */
function packagesFromEts(content: string): string[] {
  const names = new Set<string>();
  for (const m of content.matchAll(/^import\s+(?:type\s+)?[\s\S]*?from\s+'([^']+)';/gm)) {
    const source = m[1];
    if (source !== RNOH_FRAMEWORK_IMPORT && !source.startsWith('.')) {
      names.add(source);
    }
  }
  return [...names];
}

/** 解析 CMake 产物中 add_subdirectory 引用的包名（scoped 包取 @scope/name 两段）。 */
function packagesFromCmake(content: string): string[] {
  const names = new Set<string>();
  for (const m of content.matchAll(/\$\{OH_MODULES_DIR\}\/(@[^/"']+\/[^/"']+|[^/"']+)/g)) {
    names.add(m[1]);
  }
  return [...names];
}

/** 不参与「未覆盖报告」的 RNOH 基础设施包：CLI 工具自身与运行时 HAR（模板直接引用，非 autolink 对象；官方 CLI 同样不以 .har 识别它们）。 */
const NATIVE_SCAN_EXCLUDES = new Set([
  '@react-native-oh/react-native-harmony-cli',
  '@react-native-oh/react-native-harmony',
]);

/** 包是否具备 HarmonyOS 原生迹象（package.json harmony 字段或 harmony/ 目录）。 */
export function hasNativeFootprint(packageDir: string): boolean {
  try {
    const pkgJson = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
    if (pkgJson?.harmony !== undefined) return true;
  } catch {
    // 无 package.json 或损坏：以 harmony 目录存在性兜底
  }
  return fs.existsSync(path.join(packageDir, 'harmony'));
}

/** kebab 转换（对齐官方 CLI 依赖的 case.kebab；npm 包名输入下等价）。 */
function kebabCase(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[\s_]+/g, '-').toLowerCase();
}

/** 官方默认命名规则（Autolinking.js npmPackageNameToOHPackageName 移植）：@scope/name → @rnoh/scope--name。 */
function defaultOhPackageName(npmName: string): string {
  if (npmName.startsWith('@')) {
    const [scope, name] = npmName.replace('@', '').split('/');
    return `@rnoh/${kebabCase(scope)}--${kebabCase(name)}`;
  }
  return `@rnoh/${kebabCase(npmName)}`;
}

/**
 * 官方工厂返回类型 RNOHPackage[] → RNPackage[]：RNOHPackage extends RNPackage，而
 * 旧式适配包（extends RNPackage，如 gesture-handler 2.23.2-rc.1）缺新接口方法
 * createWrappedCustomRNComponentBuilderByComponentNameMap，放进 RNOHPackage[] 触发
 * ArkTS 编译错（missing ... but required）；RNPackage[] 对新旧包均兼容（新式包是其
 * 子类），运行时对该方法的调用有 instanceof RNOHPackage 守卫（EtsRNOHContext），
 * 旧式包被安全跳过。锚点不匹配时原样保留（未来官方模板变更则自然失效）。
 */
function rewriteFactoryReturnType(ets: string): string {
  return ets
    .replace(/(:\s*)RNOHPackage(\[\]\s*\{)/, '$1RNPackage$2')
    // 返回类型改用 RNPackage 后补齐类型导入（官方 import type 行原本不含 RNPackage）
    .replace(/import type \{ RNPackageContext, RNOHPackage \}/, 'import type { RNPackage, RNPackageContext, RNOHPackage }');
}

/**
 * 包在官方产物中可能使用的名字：harmony.autolinking.ohPackageName 配置（字符串或
 * {harName, packageName} 数组）+ 官方默认名。多 HAR 时官方在基名后追加 `--<harBase>`
 * 后缀（resolveHarPackageNames），故比对采用前缀匹配而非全等。
 */
function productNamesOf(pkgJson: { name?: string; harmony?: { autolinking?: { ohPackageName?: string | Array<{ packageName?: string }> } } }): string[] {
  const names = new Set<string>();
  const cfg = pkgJson?.harmony?.autolinking?.ohPackageName;
  if (typeof cfg === 'string') names.add(cfg);
  else if (Array.isArray(cfg)) for (const m of cfg) if (m?.packageName) names.add(String(m.packageName));
  if (typeof pkgJson?.name === 'string') names.add(defaultOhPackageName(pkgJson.name));
  return [...names];
}

interface InstalledNativePackage {
  /** node_modules 下的 npm 包名（覆盖识别的统一比对域）。 */
  npm: string;
  /** 该包在官方产物中可能出现的名字（ohPackageName 域）。 */
  productNames: string[];
  /** metadata 是否含 etsPackageClassName 与 cppPackageClassName（缺则官方按包名合成类名，不可信）。 */
  hasClassMetadata: boolean;
}

/** 扫描项目 node_modules 中具备原生迹象的适配包（不受 mapping 白名单限制）。 */
function scanInstalledNativePackages(projectRoot: string): InstalledNativePackage[] {
  const nodeModulesDir = path.join(projectRoot, 'node_modules');
  if (!fs.existsSync(nodeModulesDir)) return [];
  const result: InstalledNativePackage[] = [];
  const collect = (dir: string, npm: string) => {
    let pkgJson: Record<string, unknown> = {};
    try {
      pkgJson = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    } catch {
      // 无 package.json 或损坏：以 harmony 目录存在性兜底
    }
    if (pkgJson?.harmony === undefined && !fs.existsSync(path.join(dir, 'harmony'))) return;
    const autolinking = (pkgJson as { harmony?: { autolinking?: { etsPackageClassName?: unknown; cppPackageClassName?: unknown } } })?.harmony?.autolinking;
    result.push({
      npm,
      productNames: productNamesOf(pkgJson as never),
      hasClassMetadata: typeof autolinking?.etsPackageClassName === 'string' && typeof autolinking?.cppPackageClassName === 'string',
    });
  };
  const entries = fs.readdirSync(nodeModulesDir, { withFileTypes: true })
    .filter(e => (e.isDirectory() || e.isSymbolicLink()) && !e.name.startsWith('.'));
  for (const entry of entries) {
    if (entry.name.startsWith('@')) {
      const scopeDir = path.join(nodeModulesDir, entry.name);
      for (const sub of fs.readdirSync(scopeDir, { withFileTypes: true }).filter(e => e.isDirectory() || e.isSymbolicLink())) {
        const name = `${entry.name}/${sub.name}`;
        if (!NATIVE_SCAN_EXCLUDES.has(name)) collect(path.join(scopeDir, sub.name), name);
      }
    } else if (!NATIVE_SCAN_EXCLUDES.has(entry.name)) {
      collect(path.join(nodeModulesDir, entry.name), entry.name);
    }
  }
  return result.sort((a, b) => a.npm.localeCompare(b.npm));
}

export async function runOfficialAutolinking(opts: {
  projectRoot: string;
  harmonyDir: string;
  /** 静默官方 [link]/[skip] 扫描明细（install 单包场景；临时路径与 info updated 汇总恒滤）。 */
  quiet?: boolean;
  /** COMPAT_TABLE：官方合成类名（metadata 缺类名时）矫正为 mapping 真实类名的依据。 */
  mapping?: Record<string, HarmonyPackageMappingEntry>;
}): Promise<OfficialAutolinkingResult> {
  const failed = (failureReason: string): OfficialAutolinkingResult => ({
    ok: false,
    failureReason,
    files: [],
    officialPackages: [],
    uncoveredPackages: [],
  });

  // ① 解析项目实际安装的官方 CLI（createRequire 跟随 pnpm symlink）
  let cliVersion: string | undefined;
  let func: unknown;
  try {
    const req = createRequire(path.join(opts.projectRoot, 'package.json'));
    const pkgJsonPath = req.resolve(`${RNOH_CLI_PACKAGE}/package.json`);
    cliVersion = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')).version;
    const cliRoot = path.dirname(pkgJsonPath);
    func = req(path.join(cliRoot, 'dist/commands/link-harmony.js'))?.commandLinkHarmony?.func;
  } catch (err) {
    return failed(`官方 CLI 不可用（${RNOH_CLI_PACKAGE}）：${err instanceof Error ? err.message : String(err)}`);
  }
  if (typeof func !== 'function') {
    return failed(`官方 CLI 入口缺失 commandLinkHarmony.func（版本 ${cliVersion ?? '未知'}）`);
  }

  // ② 临时 Harmony 目录：拷入既有 oh-package 作为合并基础，记录旧键防误判
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ehc-link-'));
  const tmpHarmony = path.join(tmpRoot, 'harmony');
  try {
    fs.mkdirSync(path.join(tmpHarmony, 'entry/src/main/ets'), { recursive: true });
    fs.mkdirSync(path.join(tmpHarmony, 'entry/src/main/cpp'), { recursive: true });
    const sourceOh = path.join(opts.harmonyDir, 'oh-package.json5');
    let copiedKeys = new Set<string>();
    if (fs.existsSync(sourceOh)) {
      fs.copyFileSync(sourceOh, path.join(tmpHarmony, 'oh-package.json5'));
      try {
        copiedKeys = new Set(Object.keys((JSON5.parse(fs.readFileSync(sourceOh, 'utf8')).dependencies ?? {}) as Record<string, string>));
      } catch {
        // 基础 oh-package 无法解析时旧键集为空：产物键将全部进入官方覆盖候选
      }
    }

    // ③ 调用官方（includeNpmPackages: [] = 全量扫描；意外错误抛出，预期错误静默）。
    //    期间过滤其过程输出：临时产物路径行（指向随即销毁的 tmp 目录）与 info updated
    //    汇总行恒滤（纯噪音且误导）；quiet 时连同 [link]/[skip] 扫描明细一并静默。
    const tmpDirName = path.basename(tmpRoot);
    const origLog = console.log;
    const origDebug = console.debug;
    const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, '');
    const filter = (...args: unknown[]) => {
      const plain = stripAnsi(args.join(' ')).trim();
      if (plain.includes(tmpDirName) || /^info updated \d+ files?/.test(plain)) return;
      if (opts.quiet && (plain === '' || /^\[(link|skip)\]/.test(plain))) return;
      (origLog as (...a: unknown[]) => void)(...args);
    };
    console.log = filter;
    console.debug = filter;
    try {
      try {
        await (func as (argv: unknown[], config: unknown, rawArgs: Record<string, unknown>) => Promise<void>)([], {}, {
          harmonyProjectPath: tmpHarmony,
          nodeModulesPath: path.join(opts.projectRoot, 'node_modules'),
          cmakeAutolinkPathRelativeToHarmony: './entry/src/main/cpp/autolinking.cmake',
          cppRnohPackagesFactoryPathRelativeToHarmony: './entry/src/main/cpp/RNOHPackagesFactory.h',
          etsRnohPackagesFactoryPathRelativeToHarmony: './entry/src/main/ets/RNOHPackagesFactory.ets',
          ohPackagePathRelativeToHarmony: './oh-package.json5',
          includeNpmPackages: [],
        });
      } catch (err) {
        return failed(`官方 link-harmony 调用失败：${err instanceof Error ? err.message : String(err)}`);
      }
    } finally {
      console.log = origLog;
      console.debug = origDebug;
    }

    // ④ 产物完整性（官方静默失败在此兜底）
    for (const rel of GENERATED_RELS) {
      const file = path.join(tmpHarmony, rel);
      if (!fs.existsSync(file) || fs.statSync(file).size === 0) {
        return failed(`官方产物缺失或为空：${rel}（官方命令未抛错，疑似静默失败）`);
      }
    }
    let ohProduct: { dependencies?: Record<string, string> };
    try {
      ohProduct = JSON5.parse(fs.readFileSync(path.join(tmpHarmony, 'oh-package.json5'), 'utf8')) as { dependencies?: Record<string, string> };
    } catch (err) {
      return failed(`官方 oh-package 产物不可解析：${err instanceof Error ? err.message : String(err)}`);
    }

    // ⑤ 覆盖识别以产物内容为准（契约 §产物形状）：官方全量扫描只看 node_modules
    //    harmony.autolinking metadata、与既有 oh-package 键无关，故 ETS import ∪ CMake
    //    target 即官方本轮注册的证据（含带历史非受管旧键的包——官方注册后旧键由产物
    //    oh-package 合并保留，不得据此降级为未覆盖而二次注册）。
    //    产物统一以 ohPackageName 注册（默认 @rnoh/…，包可配置为 @react-native-oh-tpl
    //    等域名），与 node_modules 的 npm 名可能不同域——比对前先归一回 npm 名。
    //    oh-package 仅以「相对拷入内容新增的 file: 键」作第三佐证——拷入残留（含上轮
    //    受管 HAR 引用）不算官方本轮注册，否则二次运行会把已补充的包误判为官方已覆盖。
    const installed = scanInstalledNativePackages(opts.projectRoot);
    const normalizeProduct = (product: string): string => {
      for (const { npm, productNames } of installed) {
        for (const base of productNames) {
          if (product === base || product.startsWith(`${base}--`)) return npm;
        }
      }
      return product;
    };
    const ets = fs.readFileSync(path.join(tmpHarmony, GENERATED_RELS[0]), 'utf8');
    const cmake = fs.readFileSync(path.join(tmpHarmony, GENERATED_RELS[2]), 'utf8');
    const registered = new Set<string>([...packagesFromEts(ets), ...packagesFromCmake(cmake)].map(normalizeProduct));
    for (const [name, spec] of Object.entries(ohProduct.dependencies ?? {})) {
      if (/^file:/.test(String(spec)) && !copiedKeys.has(name)) registered.add(normalizeProduct(name));
    }
    const officialPackages = [...registered].sort();

    // 官方接管注册的包：删除拷入的 npm 名旧键（指向 node_modules 同包时），避免同一
    // HAR 以两个键重复依赖；指向自定义路径的旧键保留不动。产物 oh-package 以删除后
    // 内容下发（标准 JSON，官方 CLI 与 hvigor 均按 JSON5 读取）。
    const deps = ohProduct.dependencies ?? {};
    const takenOver = new Set(Object.keys(deps).filter(key => !copiedKeys.has(key)).map(normalizeProduct));
    for (const key of Object.keys(deps)) {
      const spec = String(deps[key] ?? '');
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (copiedKeys.has(key) && takenOver.has(normalizeProduct(key)) && new RegExp(`node_modules/${escaped}/`).test(spec)) {
        delete deps[key];
      }
    }

    // ⑥ 未覆盖集合 = 已装原生包（npm 名域）- 官方覆盖（归一后）
    const covered = new Set(officialPackages);
    const uncoveredPackages = installed.map(pkg => pkg.npm).filter(name => !covered.has(name));

    // ⑥.5 名域改写回 npm 名：ohpm 依赖键必须与 HAR 内实际 name（npm 名）一致
    //     （00604006 Inconsistent Dep Names 实证），ETS import source 与 CMake
    //     ${OH_MODULES_DIR} 路径也须指向 oh_modules 下以 npm 名命名的目录。官方产物
    //     按包的 ohPackageName 配置（可配 @react-native-oh-tpl 等域名）注册，统一
    //     改写回 npm 名。长名优先替换，防多 HAR 后缀名（base--har）被基名遮蔽后残留半截。
    const renames: Array<[string, string]> = [];
    for (const { npm, productNames } of installed) {
      for (const product of productNames) {
        if (product !== npm && product.includes('/')) renames.push([product, npm]);
      }
    }
    renames.sort((a, b) => b[0].length - a[0].length);
    const rewriteToNpm = (content: string): string => {
      for (const [from, to] of renames) content = content.split(from).join(to);
      return content;
    };
    // ⑥.6 合成类名矫正：包 metadata 缺 etsPackageClassName/cppPackageClassName 时官方按
    // 包名合成类名（如 ReactNativeOhosReactNativeGestureHandlerPackage）——ETS default
    // import 是别名无碍，CPP include 是具名头文件、包内并不存在（ninja fatal）。
    // 以 ETS default import 别名定位合成名，ETS 整行换 mapping.importStatement、实例与
    // CPP include/make_shared 换 mapping 真实类名；mapping 未收录则保留官方原样。
    const classRewrites: Array<{ synthetic: string; importStatement: string; etsClass: string; cppClass: string; ns: string | null }> = [];
    for (const m of ets.matchAll(/^import\s+(\w+)\s+from\s+'([^']+)';$/gm)) {
      const pkg = installed.find(p => m[2] === p.npm || p.productNames.some(n => m[2] === n || m[2].startsWith(`${n}--`)));
      if (!pkg || pkg.hasClassMetadata) continue;
      const entry = opts.mapping?.[pkg.npm];
      if (entry?.importStatement && entry.etsPackageClassName && entry.cppPackageClassName) {
        classRewrites.push({
          synthetic: m[1],
          importStatement: entry.importStatement,
          etsClass: entry.etsPackageClassName,
          cppClass: entry.cppPackageClassName,
          ns: entry.cppPackageNamespace ?? null,
        });
      }
    }
    const rewriteClassNames = (etsContent: string, cppContent: string): [string, string] => {
      for (const r of classRewrites) {
        etsContent = etsContent
          .replace(new RegExp(`^import\\s+${r.synthetic}\\s+from\\s+'[^']+';$`, 'gm'), r.importStatement)
          .split(`new ${r.synthetic}(ctx)`).join(`new ${r.etsClass}(ctx)`);
        cppContent = cppContent
          .split(`"${r.synthetic}.h"`).join(`"${r.cppClass}.h"`)
          .split(`rnoh::${r.synthetic}`).join(r.ns ? `${r.ns}::${r.cppClass}` : r.cppClass)
          .split(r.synthetic).join(r.cppClass);
      }
      return [etsContent, cppContent];
    };
    const [etsFixed, cppFixed] = rewriteClassNames(ets, fs.readFileSync(path.join(tmpHarmony, GENERATED_RELS[1]), 'utf8'));
    const files = GENERATED_RELS.map(rel => ({
      path: path.join(opts.harmonyDir, rel),
      content: rewriteToNpm(
        rel === GENERATED_RELS[0]
          ? rewriteFactoryReturnType(etsFixed)
          : rel === GENERATED_RELS[1]
            ? cppFixed
            : rel === 'oh-package.json5'
              ? JSON.stringify(ohProduct, null, 2) + '\n'
              : fs.readFileSync(path.join(tmpHarmony, rel), 'utf8'),
      ),
    }));
    return { ok: true, cliVersion, files, officialPackages, uncoveredPackages };
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}
