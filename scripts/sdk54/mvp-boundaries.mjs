import fs from 'node:fs';
import path from 'node:path';

function readIfPresent(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function collectText(rootDir, extensions) {
  if (!fs.existsSync(rootDir)) return '';
  const contents = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const filePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visit(filePath);
      } else if (extensions.has(path.extname(entry.name)) || entry.name === 'package.json') {
        contents.push(fs.readFileSync(filePath, 'utf8'));
      }
    }
  };
  visit(rootDir);
  return contents.join('\n');
}

export function assertMvpBoundaries(rootDir) {
  const violations = [];

  const catalog = readIfPresent(path.join(rootDir, 'scripts/sdk54/catalog.mjs'));
  if (/name\s*:\s*['"]expo-image['"]/.test(catalog)) {
    violations.push('SDK54 catalog must not include expo-image');
  }

  const fixtureDir = path.join(rootDir, 'apps/example');
  const example = collectText(
    fixtureDir,
    new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.json']),
  );
  if (/['"]expo-image['"]/.test(example)) {
    violations.push('public example must not depend on or import expo-image');
  }

  if (fs.existsSync(path.join(fixtureDir, 'metro.config.js'))) {
    violations.push('fresh fixture must not include metro.config.js');
  }
  if (fs.existsSync(path.join(fixtureDir, 'index.harmony.js'))) {
    violations.push('fresh fixture must not include index.harmony.js');
  }
  if (fs.existsSync(path.join(fixtureDir, 'shims'))) {
    violations.push('fresh fixture must not include shims/');
  }

  const packageJson = readIfPresent(path.join(fixtureDir, 'package.json'));
  if (packageJson) {
    const manifest = JSON.parse(packageJson);
    const dependencySections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
    if (dependencySections.some((section) => Object.hasOwn(manifest[section] ?? {}, 'patch-package'))) {
      violations.push('fresh fixture must not depend on patch-package');
    }
    if (Object.hasOwn(manifest.scripts ?? {}, 'postinstall')) {
      violations.push('fresh fixture must not define postinstall');
    }
  }

  const releases = collectText(path.join(rootDir, 'docs/releases'), new Set(['.md', '.json']));
  if (releases) {
    if (/multiLevelDismissTo\s*:\s*true|multi[- ](?:level|screen)[^\n]*dismissTo/i.test(releases)) {
      violations.push('Router MVP must not claim multi-level dismissTo support');
    }
    if (/OAuth\s+complete|complete\s+OAuth/i.test(releases)) {
      violations.push('WebBrowser MVP must not claim complete OAuth support');
    }
    if (!/single-level\s+(?:POP_TO|dismissTo)/.test(releases)) {
      violations.push('release docs must state the single-level dismissTo limit');
    }
    if (!/ordinary ArkWeb open\/close/.test(releases)) {
      violations.push('release docs must state the ordinary ArkWeb open/close limit');
    }
  }

  return [...new Set(violations)];
}
