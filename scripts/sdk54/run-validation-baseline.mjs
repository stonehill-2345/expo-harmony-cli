import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const args = process.argv.slice(2);
if (![2, 4].includes(args.length) || args[0] !== '--output' || (args.length === 4 && args[2] !== '--only')) {
  throw new Error('Usage: --output <evidence-directory> [--only <comma-separated-ids>]');
}
const output = path.resolve(args[1]);
fs.mkdirSync(output, { recursive: true });
const definitionPath = 'docs/releases/sdk54-test-execution-definition.json';
const content = fs.readFileSync(path.join(root, definitionPath));
const definition = JSON.parse(content);
const selected = args[3] ? new Set(args[3].split(',')) : null;
for (const id of selected ?? []) if (!definition.entries.some((entry) => entry.id === id)) throw new Error(`Unknown selection: ${id}`);
const environment = Object.fromEntries(Object.entries(definition.environmentPaths ?? {}).map(([name, relative]) => [name, path.resolve(root, relative)]));
const seen = new Set();
const results = [];
for (const entry of definition.entries) {
  if (!/^[A-Z0-9-]+$/.test(entry.id) || seen.has(entry.id)) throw new Error('Invalid/duplicate execution ID');
  seen.add(entry.id);
  if (selected && !selected.has(entry.id)) continue;
  if (!entry.execute) {
    if (!entry.reason || !entry.prerequisites.length) throw new Error('Missing NOT_RUN reason/prerequisites');
    results.push({ ...entry, status: 'NOT_RUN' });
    continue;
  }
  const startedAt = new Date().toISOString();
  const result = spawnSync(entry.command[0], entry.command.slice(1), {
    cwd: path.join(root, entry.cwd), encoding: 'utf8', timeout: 180_000,
    maxBuffer: 32 * 1024 * 1024, env: { ...process.env, CI: '1', ...environment },
  });
  const log = `${entry.id}.log`;
  const logContent = `${result.stdout ?? ''}${result.stderr ?? ''}${result.error ? `\nPROCESS_ERROR: ${result.error.message}\n` : ''}`;
  fs.writeFileSync(path.join(output, log), logContent);
  const status = result.status === 0 && !result.error ? 'PASS' : 'FAIL';
  results.push({ ...entry, startedAt, finishedAt: new Date().toISOString(), status,
    exitCode: result.status, signal: result.signal, error: result.error?.message ?? null,
    log, logSha256: createHash('sha256').update(logContent).digest('hex') });
  console.log(`${entry.id}: ${status} (exit ${result.status})`);
}
fs.writeFileSync(path.join(output, 'test-execution.json'), `${JSON.stringify({ schemaVersion: 1,
  environment,
  definition: { path: definitionPath, sha256: createHash('sha256').update(content).digest('hex') }, results }, null, 2)}\n`);
