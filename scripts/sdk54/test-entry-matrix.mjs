import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const ignored = new Set(['node_modules', '.git', 'build', 'dist', '.hvigor', 'oh_modules', '.cxx', 'coverage']);
const portable = (value) => value.split(path.sep).join('/');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en')).flatMap((entry) => {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : entry.isFile() ? [file] : [];
  });
}

export function createTestEntryMatrix(root = repository) {
  // pnpm owns workspace glob semantics; consume its JSON instead of parsing YAML.
  const workspaces = JSON.parse(execFileSync('pnpm', ['-r', 'list', '--depth', '-1', '--json'], {
    cwd: root, encoding: 'utf8', timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
  }));
  const input = (absolute) => ({ path: portable(path.relative(root, absolute)),
    sha256: createHash('sha256').update(fs.readFileSync(absolute)).digest('hex') });
  const packages = workspaces.filter((entry) => path.resolve(entry.path) !== path.resolve(root))
    .map((entry) => {
      const manifest = path.join(entry.path, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(manifest, 'utf8'));
      const files = walk(entry.path);
      const tests = files.filter((file) => /(?:\.(?:test|spec)\.[^.]+$|(?:^|\/)__tests__\/.*\.[cm]?[jt]sx?$|(?:^|\/)tests\/.*\.(?:cpp|py)$)/.test(portable(file)));
      const configurations = files.filter((file) => /(?:^|\/)(?:(?:jest|vitest|babel)\.(?:config|setup)\.[^/]+|(?:tsconfig[^/]*|expo-module\.config)\.json|CMakeLists\.txt)$/.test(portable(file)));
      const scripts = Object.fromEntries(Object.entries(pkg.scripts ?? {}).filter(([name]) => /test|check|lint/.test(name)));
      const harmonyTests = tests.filter((file) => portable(path.relative(entry.path, file)).startsWith('harmony/'));
      return {
        name: pkg.name, directory: portable(path.relative(root, entry.path)), manifest: input(manifest), scripts,
        embeddedJest: pkg.jest ?? null,
        testAvailability: tests.length || Object.keys(scripts).some((name) => name.startsWith('test')) ? 'PRESENT' : 'MISSING',
        configurations: configurations.map(input), tests: tests.map(input), harmonyTests: harmonyTests.map(input),
      };
    }).sort((a, b) => a.directory.localeCompare(b.directory, 'en'));
  return {
    schemaVersion: 1,
    scope: 'Current local pnpm workspaces; test source/fixtures and config inputs only, not upstream API coverage or executed-test counts.',
    exclusions: [...ignored].sort(), workspace: input(path.join(root, 'pnpm-workspace.yaml')), packages,
    totals: { packages: packages.length, missingTests: packages.filter((entry) => entry.testAvailability === 'MISSING').length,
      testInputs: packages.reduce((sum, entry) => sum + entry.tests.length, 0), harmonyTestInputs: packages.reduce((sum, entry) => sum + entry.harmonyTests.length, 0) },
  };
}

export function verifyTestEntryMatrix(matrix, root = repository) {
  assert.deepEqual(matrix, createTestEntryMatrix(root), 'Test entry matrix differs from current workspace');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || !['--output', '--check'].includes(args[0])) throw new Error('Usage: --output|--check <json>');
  if (args[0] === '--check') {
    verifyTestEntryMatrix(JSON.parse(fs.readFileSync(args[1], 'utf8')));
    console.log('PASS: workspace test matrix and all input hashes match');
  } else fs.writeFileSync(args[1], `${JSON.stringify(createTestEntryMatrix(), null, 2)}\n`);
}
