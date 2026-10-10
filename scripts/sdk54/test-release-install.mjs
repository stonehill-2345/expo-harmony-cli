// A read-only local registry serves the candidate tarballs under their final npm identities.
// Other public packages are proxied from npm. No registry writes are performed.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { extract } from 'tar';
import { createReleaseManifest } from './release-catalog.mjs';
import { verifyRelease } from './verify-npm-release.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const directory = path.resolve(option('--directory', 'outputs/sdk54/npm-release'));
const fullInstall = args.includes('--full');
const lifecycle = args.includes('--scripts');
const failures = await verifyRelease(directory);
if (failures.length) throw new Error(failures.join('\n'));
const report = JSON.parse(fs.readFileSync(path.join(directory, 'release.json')));
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'expo-oh-install-'));
const manifests = new Map();
for (const item of report.packages) {
  const target = path.join(work, item.name.split('/')[1]);
  fs.mkdirSync(target);
  await extract({ file: path.join(directory, item.file), cwd: target });
  manifests.set(item.name, { item, pkg: JSON.parse(fs.readFileSync(path.join(target, 'package/package.json'))) });
}
const server = http.createServer(async (request, response) => {
  try {
    const name = decodeURIComponent(request.url.slice(1));
    if (name.startsWith('tarballs/')) {
      const file = path.basename(name);
      if (!report.packages.some(p => p.file === file)) { response.writeHead(404).end(); return; }
      response.setHeader('Content-Type', 'application/octet-stream');
      fs.createReadStream(path.join(directory, file)).pipe(response);
    } else if (manifests.has(name)) {
      const { item, pkg } = manifests.get(name);
      const body = { name, 'dist-tags': { latest: item.version, harmony: item.version }, versions: { [item.version]: { ...pkg, dist: { integrity: item.integrity, tarball: `${registry}tarballs/${item.file}` } } } };
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(body));
    } else if (name.startsWith('@expo-oh/')) { response.writeHead(404).end(); }
    else {
      const upstream = await fetch(`https://registry.npmjs.org${request.url}`, { headers: { accept: 'application/vnd.npm.install-v1+json' } });
      response.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'application/octet-stream' });
      response.end(Buffer.from(await upstream.arrayBuffer()));
    }
  } catch (error) { response.writeHead(502).end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const registry = `http://127.0.0.1:${server.address().port}/`;
if (args.includes('--serve')) {
  console.log(`Candidate registry: ${registry}`);
  await new Promise(resolve => {
    process.once('SIGINT', resolve);
    process.once('SIGTERM', resolve);
  });
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  process.exit(0);
}
const manifest = createReleaseManifest();
const results = [];
const { buildReleasePackageJson } = createRequire(import.meta.url)(path.join(work, 'expo-harmony-cli/package/dist/sdk54/release-manifest.js'));
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
        const child = spawn(pm, [...commandArgs, '--registry', registry], { cwd, stdio: ['ignore', log, log], env: { ...process.env, CI: '1', npm_config_registry: registry } });
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
          const { releaseRuntimeFailures } = createRequire(import.meta.url)(path.join(work, 'expo-harmony-cli/package/dist/sdk54/release-runtime.js'));
          runtimeFailures.push(...releaseRuntimeFailures(cwd, manifest, template));
        } catch (error) { runtimeFailures.push(error.message); }
      }
      results.push({ template, pm, status, reinstallStatus, runtimeFailures, log: path.join(cwd, 'install.log') });
      console.log(JSON.stringify(results.at(-1)));
    }
  }
} finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
fs.writeFileSync(path.join(directory, 'peer-install-report.json'), JSON.stringify({ release: report.release, mode: fullInstall ? (lifecycle ? 'install' : 'install-ignore-scripts') : 'lockfile-only', artifacts: report.packages.map(p => ({ name: p.name, integrity: p.integrity })), results }, null, 2));
console.log(`Evidence: ${work}`);
if (results.some(r => r.status !== 0 || (fullInstall && r.reinstallStatus !== 0) || r.runtimeFailures.length)) process.exitCode = 1;
