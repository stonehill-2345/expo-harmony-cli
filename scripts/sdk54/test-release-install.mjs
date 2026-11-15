// A read-only local registry serves the candidate tarballs under their final npm identities.
// Other public packages are proxied from npm. No registry writes are performed.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { startCandidateRegistry } from './candidate-registry.mjs';
import { createReleaseManifest } from './release-catalog.mjs';
import { verifyRelease } from './verify-npm-release.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const directory = path.resolve(option('--directory', 'outputs/sdk54/npm-release'));
const reportPath = path.resolve(option('--report', path.join(directory, 'peer-install-report.json')));
const upstreamRegistry = new URL(option('--upstream-registry', execFileSync('npm', ['config', 'get', 'registry'], { encoding: 'utf8' }).trim())).toString();
// The independently published product CLI is not one of the runtime tarballs.
const cliPackage = path.resolve(option('--cli-package', 'apps/cli'));
const require = createRequire(import.meta.url);
const { buildReleasePackageJson } = require(path.join(cliPackage, 'dist/sdk54/release-manifest.js'));
const { releaseRuntimeFailures } = require(path.join(cliPackage, 'dist/sdk54/release-runtime.js'));
const fullInstall = args.includes('--full');
const lifecycle = args.includes('--scripts');
const failures = await verifyRelease(directory);
if (failures.length) throw new Error(failures.join('\n'));
const report = JSON.parse(fs.readFileSync(path.join(directory, 'release.json')));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-oh-install-'));
const candidateRegistry = await startCandidateRegistry(report.packages.map(item => ({
  ...item,
  archive: path.join(directory, item.file),
})), { upstreamRegistry });
const { registry } = candidateRegistry;
if (args.includes('--serve')) {
  console.log(`Candidate registry: ${registry}`);
  await new Promise(resolve => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  await candidateRegistry.close();
  process.exit(0);
}
const manifest = createReleaseManifest();
const results = [];
try {
  for (const template of (args.includes('--template') ? [option('--template')] : ['blank-typescript', 'default'])) {
    for (const pm of (args.includes('--pm') ? [option('--pm')] : ['npm', 'pnpm'])) {
      if (!['npm', 'pnpm'].includes(pm)) throw new Error('Unsupported package manager');
      const cwd = path.join(work, `${template}-${pm}`);
      fs.mkdirSync(cwd);
      fs.writeFileSync(path.join(cwd, 'package.json'), JSON.stringify(buildReleasePackageJson({ name: 'release-install-test', version: '1.0.0', private: true }, template, manifest), null, 2));
      const args = pm === 'npm' ? ['install', ...(fullInstall ? [] : ['--package-lock-only']), ...(lifecycle ? [] : ['--ignore-scripts']), '--strict-peer-deps', '--no-audit', '--no-fund'] : ['install', ...(fullInstall ? [] : ['--lockfile-only']), ...(lifecycle ? [] : ['--ignore-scripts']), '--strict-peer-dependencies'];
      const log = fs.openSync(path.join(cwd, 'install.log'), 'w');
      const run = commandArgs => new Promise(resolve => {
        const child = spawn(pm, [...commandArgs, '--registry', registry], { cwd, stdio: ['ignore', log, log], env: {
          ...process.env, CI: '1', npm_config_registry: registry, npm_config_fetch_timeout: '900000',
        } });
        child.on('error', () => resolve(-1));
        child.on('exit', resolve);
      });
      const status = await run(args);
      let reinstallStatus = null;
      if (status === 0 && fullInstall) {
        fs.rmSync(path.join(cwd, 'node_modules'), { recursive: true, force: true });
        const reinstallArgs = pm === 'npm'
          ? ['ci', '--strict-peer-deps', '--no-audit', '--no-fund']
          : ['install', '--frozen-lockfile', '--strict-peer-dependencies'];
        if (!lifecycle) reinstallArgs.push('--ignore-scripts');
        reinstallStatus = await run(reinstallArgs);
      }
      fs.closeSync(log);
      const runtimeFailures = [];
      if (status === 0 && reinstallStatus === 0 && fullInstall) {
        try {
          const graph = JSON.parse(execFileSync('npm', ['query', '*'], { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }));
          fs.writeFileSync(path.join(cwd, 'dependency-graph.json'), JSON.stringify(graph, null, 2));
          for (const node of graph) {
            if (manifest.packages.some(p => p.installName === node.name)) runtimeFailures.push(`Unexpected official package: ${node.name}@${node.version}`);
            const expected = manifest.packages.find(p => p.publishName === node.name);
            if (expected && expected.publishVersion !== node.version) runtimeFailures.push(`Wrong scoped version: ${node.name}@${node.version}`);
          }
          runtimeFailures.push(...releaseRuntimeFailures(cwd, manifest, template));
        } catch (error) { runtimeFailures.push(error.message); }
      }
      results.push({ template, pm, status, reinstallStatus, runtimeFailures, log: path.join(cwd, 'install.log') });
      console.log(JSON.stringify(results.at(-1)));
    }
  }
} finally { await candidateRegistry.close(); }
fs.writeFileSync(reportPath, JSON.stringify({ release: report.release, mode: fullInstall ? (lifecycle ? 'install' : 'install-ignore-scripts') : 'lockfile-only', artifacts: report.packages.map(p => ({ name: p.name, integrity: p.integrity })), upstreamRegistry, results }, null, 2));
console.log(`Evidence: ${work}`);
if (results.some(r => r.status !== 0 || (fullInstall && r.reinstallStatus !== 0) || r.runtimeFailures.length)) process.exitCode = 1;
