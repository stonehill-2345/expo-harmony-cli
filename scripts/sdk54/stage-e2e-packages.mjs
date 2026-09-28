import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { packPackages } from './pack-packages.mjs';

const EXTERNAL_PACKAGES = Object.freeze([
  { name: '@react-native-oh/react-native-harmony', version: '0.82.30', file: 'react-native-oh-react-native-harmony-0.82.30.tgz' },
  { name: 'react-native-gesture-handler', version: '2.30.0', file: 'react-native-gesture-handler-2.30.0.tgz' },
  { name: '@react-native-ohos/react-native-gesture-handler', version: '2.30.1', file: 'react-native-ohos-react-native-gesture-handler-2.30.1.tgz' },
  { name: 'react-native-reanimated', version: '4.2.1', file: 'react-native-reanimated-4.2.1.tgz' },
  { name: '@react-native-ohos/react-native-reanimated', version: '4.0.1', file: 'react-native-ohos-react-native-reanimated-4.0.1.tgz' },
  { name: 'react-native-safe-area-context', version: '5.6.2', file: 'react-native-safe-area-context-5.6.2.tgz' },
  { name: '@react-native-ohos/react-native-safe-area-context', version: '5.6.3', file: 'react-native-ohos-react-native-safe-area-context-5.6.3.tgz' },
  { name: 'react-native-screens', version: '4.17.1', file: 'react-native-screens-4.17.1.tgz' },
  { name: '@react-native-ohos/react-native-screens', version: '4.9.0', file: 'react-native-ohos-react-native-screens-4.9.0.tgz' },
  { name: 'react-native-worklets', version: '0.7.1', file: 'react-native-worklets-0.7.1.tgz' },
  { name: '@react-native-ohos/react-native-worklets', version: '1.0.0', file: 'react-native-ohos-react-native-worklets-1.0.0.tgz' },
].map(Object.freeze));

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function writeStableJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(stableValue(value), null, 2)}\n`);
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function canonicalPath(filePath) {
  const resolved = path.resolve(filePath);
  const missingSegments = [];
  let existingPath = resolved;

  while (!fs.existsSync(existingPath)) {
    const parent = path.dirname(existingPath);
    if (parent === existingPath) break;
    missingSegments.unshift(path.basename(existingPath));
    existingPath = parent;
  }

  return path.join(fs.realpathSync(existingPath), ...missingSegments);
}

function entryPath(filePath) {
  const lexicalPath = path.resolve(filePath);
  const parent = path.dirname(lexicalPath);
  if (parent === lexicalPath) return lexicalPath;
  return path.join(canonicalPath(parent), path.basename(lexicalPath));
}

function isSameOrAncestor(ancestor, candidate) {
  const relative = path.relative(ancestor, candidate);
  return relative === '' || (
    relative !== '..'
    && !relative.startsWith(`..${path.sep}`)
    && !path.isAbsolute(relative)
  );
}

function pathsOverlap(left, right) {
  return isSameOrAncestor(left, right) || isSameOrAncestor(right, left);
}

function safeDirectories({ rootDir, externalDir, outputDir }) {
  const lexicalDirectories = {
    rootDir: path.resolve(rootDir),
    externalDir: path.resolve(externalDir),
    outputDir: path.resolve(outputDir),
  };
  const entryDirectories = {
    rootDir: entryPath(lexicalDirectories.rootDir),
    externalDir: entryPath(lexicalDirectories.externalDir),
    outputDir: entryPath(lexicalDirectories.outputDir),
  };
  const canonicalDirectories = {
    rootDir: canonicalPath(lexicalDirectories.rootDir),
    externalDir: canonicalPath(lexicalDirectories.externalDir),
    outputDir: canonicalPath(lexicalDirectories.outputDir),
  };
  const outputVariants = [
    lexicalDirectories.outputDir,
    entryDirectories.outputDir,
    canonicalDirectories.outputDir,
  ];
  const sourceVariants = [
    lexicalDirectories.rootDir,
    entryDirectories.rootDir,
    canonicalDirectories.rootDir,
    lexicalDirectories.externalDir,
    entryDirectories.externalDir,
    canonicalDirectories.externalDir,
  ];
  const unsafe = outputVariants.some((output) =>
    sourceVariants.some((source) => pathsOverlap(output, source)));
  if (unsafe) {
    throw new Error('Unsafe outputDir: outputDir must not overlap rootDir or externalDir');
  }
  return canonicalDirectories;
}

function copyArchive({ name, version, file }, source, sourceDir, outputDir) {
  const outputPath = path.join(outputDir, file);
  fs.copyFileSync(path.join(sourceDir, file), outputPath);
  return {
    name,
    version,
    file,
    bytes: fs.statSync(outputPath).size,
    sha256: sha256(outputPath),
    source,
  };
}

export async function stageE2ePackages(directories) {
  const { rootDir, externalDir, outputDir } = safeDirectories(directories);
  const expoPackages = [];
  const externalPackages = [];
  const failures = [];
  const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-sdk54-e2e-workspace-'));

  fs.rmSync(outputDir, { recursive: true, force: true });
  fs.mkdirSync(outputDir, { recursive: true });

  try {
    const packed = await packPackages({ rootDir, outputDir: workspaceDir, round: 'E2E' });
    failures.push(...packed.failures);
    for (const entry of packed.packages) {
      try {
        expoPackages.push(copyArchive(entry, 'workspace', workspaceDir, outputDir));
      } catch (error) {
        failures.push(`Workspace package ${entry.file}: ${error.message}`);
      }
    }

    for (const descriptor of EXTERNAL_PACKAGES) {
      const sourcePath = path.join(externalDir, descriptor.file);
      if (!fs.existsSync(sourcePath)) {
        failures.push(`Missing external package: ${descriptor.file}`);
        continue;
      }
      try {
        externalPackages.push(copyArchive(descriptor, 'external', externalDir, outputDir));
      } catch (error) {
        failures.push(`External package ${descriptor.file}: ${error.message}`);
      }
    }
  } finally {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }

  expoPackages.sort((left, right) => left.name.localeCompare(right.name, 'en'));
  const manifest = {
    expoPackages,
    externalPackages,
    packages: expoPackages.length + externalPackages.length,
    failures,
  };
  writeStableJson(path.join(outputDir, 'manifest.json'), manifest);
  return manifest;
}

function argumentValue(args, name, fallback) {
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

async function main() {
  const args = process.argv.slice(2);
  const rootDir = process.cwd();
  const externalDir = argumentValue(args, '--external', '/Users/chensq/Desktop/expo-harmony-sdk54-tgz');
  const outputDir = argumentValue(args, '--output', '/private/tmp/expo-sdk54-migration-tgz');
  const manifest = await stageE2ePackages({ rootDir, externalDir, outputDir });
  process.stdout.write(`${JSON.stringify(stableValue(manifest), null, 2)}\n`);
  if (manifest.failures.length > 0 || manifest.packages !== 25) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
