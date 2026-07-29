import * as fs from 'fs';
import * as path from 'path';
import { OhPackageJson5Template } from './templates/OhPackageJson5Template';
import { HvigorConfigJson5Template } from './templates/HvigorConfigJson5Template';
import { AppScopeAppJSON5Template } from './templates/AppScopeAppJSON5Template';
import { AppScopeStringVarTemplate } from './templates/AppScopeStringVarTemplate';
import { EntryIndexTemplate } from './templates/EntryIndexTemplate';
import { EntryOhPackageJson5Template } from './templates/EntryOhPackageJson5Template';
import { EntryStringVarTemplate } from './templates/EntryStringVarTemplate';
import { resolveHarmonyTemplateSource } from './template-source';

export interface InitOptions {
  /** ★ 必须有，用于 findHvigorPluginFilename 在用户项目 node_modules 找 cli */
  projectRoot: string;
  harmonyDir: string;
  bundleName: string;
  appName: string;
  rnohNpmPackageName: string;
  rnohCliNpmPackageName: string;
  templateSource?: 'bundled' | 'cdn' | 'auto';
}

/**
 * 参考 B 节：拷贝模板 → 重命名 gitignore → 写 6 动态文件 → build-profile.template。
 *
 * metro.config.js 不写（expo 项目已有，spec 决策；6 动态文件不含 MetroConfigTemplate）。
 */
export async function initProject(opts: InitOptions): Promise<void> {
  const {
    projectRoot,
    harmonyDir,
    bundleName,
    appName,
    rnohNpmPackageName,
    rnohCliNpmPackageName,
    templateSource,
  } = opts;

  // 步骤 11：校验并拷贝包内模板目录（fs.cpSync，Node 16.7+）
  const resolvedTemplate = resolveHarmonyTemplateSource({ source: templateSource });
  fs.cpSync(resolvedTemplate.templateDir, harmonyDir, { recursive: true });

  // 步骤 12：递归重命名 gitignore → .gitignore
  renameGitignoreFiles(harmonyDir);

  // 步骤 9 + 13：写 6 动态文件
  const hvigorPluginFilename = findHvigorPluginFilename(projectRoot, rnohCliNpmPackageName);
  const dynamicFiles: Array<[string, string]> = [
    [
      path.join(harmonyDir, 'oh-package.json5'),
      new OhPackageJson5Template(rnohNpmPackageName).build(),
    ],
    [
      path.join(harmonyDir, 'entry', 'oh-package.json5'),
      new EntryOhPackageJson5Template(rnohNpmPackageName).build(),
    ],
    [
      path.join(harmonyDir, 'hvigor', 'hvigor-config.json5'),
      new HvigorConfigJson5Template(rnohCliNpmPackageName, hvigorPluginFilename).build(),
    ],
    [
      path.join(harmonyDir, 'entry', 'src', 'main', 'resources', 'base', 'element', 'string.json'),
      new EntryStringVarTemplate(appName, '').build(),
    ],
    [
      path.join(harmonyDir, 'entry', 'src', 'main', 'ets', 'pages', 'Index.ets'),
      new EntryIndexTemplate(appName).build(),
    ],
    [
      path.join(harmonyDir, 'AppScope', 'resources', 'base', 'element', 'string.json'),
      new AppScopeStringVarTemplate(appName).build(),
    ],
    [
      path.join(harmonyDir, 'AppScope', 'app.json5'),
      new AppScopeAppJSON5Template(bundleName).build(),
    ],
  ];
  for (const [p, content] of dynamicFiles) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content);
  }

  // 步骤 14：build-profile.template.json5（在第 2 行插入注释）
  const buildProfilePath = path.join(harmonyDir, 'build-profile.json5');
  if (fs.existsSync(buildProfilePath)) {
    const lines = fs.readFileSync(buildProfilePath, 'utf8').split('\n');
    lines.splice(1, 0, '  // build-profile.json5 含 signingConfigs（开发者私有），按此模板手动创建');
    fs.writeFileSync(path.join(harmonyDir, 'build-profile.template.json5'), lines.join('\n'));
  }
}

function renameGitignoreFiles(dir: string): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      renameGitignoreFiles(full);
    } else if (entry.name === 'gitignore') {
      fs.renameSync(full, path.join(dir, '.gitignore'));
    }
  }
}

/**
 * ★ 修正：从用户项目 node_modules 找 cli 的 hvigor 插件 tgz。
 * 生成器包自身没装 cli（cli 是用户项目装的），不能用 require.resolve 从生成器包解析。
 */
function findHvigorPluginFilename(projectRoot: string, rnohCliNpmPackageName: string): string {
  const cliHarmonyDir = path.join(projectRoot, 'node_modules', rnohCliNpmPackageName, 'harmony');
  if (fs.existsSync(cliHarmonyDir)) {
    const found = fs
      .readdirSync(cliHarmonyDir)
      .find(f => f.startsWith('rnoh-hvigor-plugin') && f.endsWith('.tgz'));
    if (found) return found;
  }
  return 'rnoh-hvigor-plugin-0.77.71.tgz'; // fallback
}
