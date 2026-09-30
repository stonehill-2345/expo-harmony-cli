import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  EXPECTED_INTERNAL_EDGES,
  SDK54_EXPO_COMMIT,
  SDK54_MVP_SOURCE_COMMIT,
  SDK54_PACKAGES,
  getDescriptorByName,
} from './catalog.mjs';

function edgeKey({ from, to, section }) {
  return `${from}\0${section}\0${to}`;
}

function readJson(filePath, label, failures) {
  if (!fs.existsSync(filePath)) {
    failures.push(`${label}: ${path.basename(filePath)} is missing`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    failures.push(`${label}: cannot parse ${path.basename(filePath)}: ${error.message}`);
    return null;
  }
}

const FORBIDDEN_DIRECTORY_NAMES = new Set([
  'node_modules',
  'oh_modules',
  '.hvigor',
  '.cxx',
  'build-cache',
]);
const FORBIDDEN_EXTENSIONS = new Set(['.hap', '.har', '.tgz']);

function findForbiddenArtifacts(packageDir, packageName, ignoreWorkspaceNodeModules) {
  const artifacts = [];
  const visit = (relativeDir) => {
    const absoluteDir = path.join(packageDir, relativeDir);
    for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
      const relativePath = path.join(relativeDir, entry.name);
      const portablePath = relativePath.split(path.sep).join('/');
      if (entry.isDirectory()) {
        if (ignoreWorkspaceNodeModules && !relativeDir && entry.name === 'node_modules') continue;
        visit(relativePath);
        continue;
      }
      const segments = portablePath.split('/');
      const isTrackedCliCanaryFixture =
        packageName === '@expo/cli' &&
        portablePath.startsWith('static/canary-full/node_modules/');
      if (
        !isTrackedCliCanaryFixture &&
        (segments.some((segment) => FORBIDDEN_DIRECTORY_NAMES.has(segment)) ||
          FORBIDDEN_EXTENSIONS.has(path.extname(entry.name)))
      ) {
        artifacts.push(portablePath);
      }
    }
  };
  visit('');
  return artifacts.sort();
}

export function validateCatalog(rootDir, descriptors = SDK54_PACKAGES) {
  const failures = [];
  const publishable = [];
  const selectedNames = new Set(descriptors.map(({ name }) => name));
  const actualEdges = [];
  let packages = 0;

  for (const descriptor of descriptors) {
    const packageDir = path.join(rootDir, descriptor.relativePath);
    if (!fs.existsSync(packageDir) || !fs.statSync(packageDir).isDirectory()) {
      failures.push(`${descriptor.name}: package directory is missing`);
      continue;
    }
    packages += 1;

    const manifest = readJson(path.join(packageDir, 'package.json'), descriptor.name, failures);
    if (manifest) {
      if (manifest.name !== descriptor.name) {
        failures.push(
          `${descriptor.name}: expected package name ${descriptor.name}, found ${String(manifest.name)}`,
        );
      }
      if (manifest.version !== descriptor.version) {
        failures.push(
          `${descriptor.name}: expected version ${descriptor.version}, found ${String(manifest.version)}`,
        );
      }
      if (manifest.private !== true) {
        failures.push(`${descriptor.name}: private must be true`);
        publishable.push(descriptor.name);
      }
      for (const section of ['dependencies', 'peerDependencies']) {
        for (const dependency of Object.keys(manifest[section] ?? {})) {
          if (selectedNames.has(dependency)) {
            actualEdges.push({ from: descriptor.name, to: dependency, section });
          }
        }
      }
    }

    const provenance = readJson(
      path.join(packageDir, 'harmony-upstream.json'),
      descriptor.name,
      failures,
    );
    if (provenance) {
      const expectedFields = {
        packageName: descriptor.name,
        version: descriptor.version,
        expoCommit: SDK54_EXPO_COMMIT,
        mvpSourceCommit: SDK54_MVP_SOURCE_COMMIT,
      };
      for (const [field, expected] of Object.entries(expectedFields)) {
        if (provenance[field] !== expected) {
          failures.push(
            `${descriptor.name}: expected ${field} ${expected}, found ${String(provenance[field])}`,
          );
        }
      }
      if (provenance.publish !== false) {
        failures.push(`${descriptor.name}: publish must be false`);
        if (!publishable.includes(descriptor.name)) publishable.push(descriptor.name);
      }
    }

    for (const artifact of findForbiddenArtifacts(packageDir, descriptor.name, fs.existsSync(path.join(rootDir, '.git')))) {
      failures.push(`${descriptor.name}: forbidden artifact ${artifact}`);
    }
  }

  const expectedEdges = EXPECTED_INTERNAL_EDGES.filter(
    ({ from, to }) => selectedNames.has(from) && selectedNames.has(to),
  );
  const actualKeys = new Set(actualEdges.map(edgeKey));
  const expectedKeys = new Set(expectedEdges.map(edgeKey));
  for (const edge of expectedEdges) {
    if (!actualKeys.has(edgeKey(edge))) {
      failures.push(`${edge.from}: missing ${edge.section} edge to ${edge.to}`);
    }
  }
  for (const edge of actualEdges) {
    if (!expectedKeys.has(edgeKey(edge))) {
      failures.push(`${edge.from}: unexpected ${edge.section} edge to ${edge.to}`);
    }
  }

  return {
    packages,
    internalEdges: actualKeys.size,
    publishable: [...new Set(publishable)].sort(),
    failures,
  };
}

function descriptorsFromArgs(args) {
  const inline = args.find((arg) => arg.startsWith('--packages='));
  const optionIndex = args.indexOf('--packages');
  const value = inline?.slice('--packages='.length) ?? (optionIndex >= 0 ? args[optionIndex + 1] : null);
  if (!value) return SDK54_PACKAGES;
  return value.split(',').filter(Boolean).map(getDescriptorByName);
}

function main() {
  let report;
  try {
    report = validateCatalog(process.cwd(), descriptorsFromArgs(process.argv.slice(2)));
  } catch (error) {
    report = { packages: 0, internalEdges: 0, publishable: [], failures: [error.message] };
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.failures.length > 0) process.exitCode = 1;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
