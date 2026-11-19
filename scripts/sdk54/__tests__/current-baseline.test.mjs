import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawn } from 'node:child_process';
import { executeBaselineCommand, baselineScenarios, validateBaselineResults, requireEmptyDirectory, runCurrentBaseline } from '../current-baseline.mjs';

const temp = t => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-current-test-')); t.after(() => fs.rmSync(dir, { recursive: true, force: true })); return dir; };

test('current baseline: six fixed scenarios preserve template/package-manager/sdk identity', () => {
  assert.equal(baselineScenarios.length, 6);
  assert.equal(new Set(baselineScenarios.map(s => s.id)).size, 6);
  assert.equal(baselineScenarios.filter(s => s.sdk === '54').length, 4);
  assert.equal(baselineScenarios.filter(s => s.sdk === '52').length, 2);
});

test('current baseline: commands stream stdout/stderr and retain nonzero exits', async t => {
  const dir = temp(t);
  const result = await executeBaselineCommand({ id: 'test', command: [process.execPath, '-e', 'console.log("stdout-marker"); console.error("stderr-marker"); process.exit(7)'], cwd: dir, output: dir, timeoutMs: 5000 });
  assert.equal(result.status, 'FAIL'); assert.equal(result.exitCode, 7);
  const log = fs.readFileSync(path.join(dir, result.log), 'utf8');
  assert.match(log, /stdout-marker/); assert.match(log, /stderr-marker/);
  assert.equal(result.logSha256.length, 64);
});

test('current baseline: spawn failures are explicit and logged', async t => {
  const dir = temp(t);
  const result = await executeBaselineCommand({ id: 'missing', command: [path.join(dir, 'missing-command')], cwd: dir, output: dir, timeoutMs: 1000 });
  assert.equal(result.status, 'FAIL'); assert.match(result.error, /ENOENT/);
});

test('current baseline: timeout preserves partial output and terminates owned child', async t => {
  const dir = temp(t);
  const result = await executeBaselineCommand({ id: 'timeout', command: [process.execPath, '-e', 'console.log("partial-marker"); setInterval(()=>{},1000)'], cwd: dir, output: dir, timeoutMs: 1000 });
  assert.equal(result.status, 'FAIL'); assert.equal(result.timedOut, true);
  assert.match(fs.readFileSync(path.join(dir, result.log), 'utf8'), /partial-marker/);
  assert.throws(() => process.kill(result.pid, 0), /ESRCH/);
});

test('current baseline: nonempty directories and duplicate command logs are rejected', async t => {
  const dir = temp(t); fs.writeFileSync(path.join(dir, 'owned'), 'keep');
  assert.throws(() => requireEmptyDirectory(dir), /empty/);
  const options = { id: 'repeat', command: [process.execPath, '-e', ''], cwd: dir, output: dir, timeoutMs: 1000 };
  await executeBaselineCommand(options);
  await assert.rejects(executeBaselineCommand(options), /exist/);
  assert.equal(fs.readFileSync(path.join(dir, 'owned'), 'utf8'), 'keep');
});

test('current baseline: invalid IDs and timeout configuration fail before execution', async t => {
  const dir = temp(t);
  for (const change of [{ id: '../escape' }, { timeoutMs: 0 }, { command: [] }]) {
    await assert.rejects(executeBaselineCommand({ id: 'valid', command: [process.execPath, '-e', ''], cwd: dir, output: dir, timeoutMs: 1000, ...change }));
  }
});

test('current baseline: missing cases and fake product success cannot pass collection validation', () => {
  const result = validateBaselineResults({ schemaVersion: 1, scenarios: [], productAllPassed: true, stageClosable: true }, '.');
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => /scenario/i.test(e)));
  assert.ok(result.errors.some(e => /stage|product/i.test(e)));
});

test('current baseline: offline packed fixture validates failures and canonical symlink parent paths', async t => {
  const dir = temp(t), packageDir = path.join(dir, 'package'); fs.mkdirSync(path.join(packageDir, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(packageDir, 'package.json'), '{"name":"expo-harmony-cli","version":"0.0.0","main":"dist/index.js"}');
  fs.writeFileSync(path.join(packageDir, 'dist/index.js'), 'if(process.argv.includes("--version"))console.log("0.0.0");else{console.error("fixture create intentionally fails");process.exit(9);}');
  const archive = path.join(dir, 'fixture.tgz'); execFileSync('tar', ['-czf', archive, '-C', dir, 'package']);
  const real = path.join(dir, 'real'); fs.mkdirSync(real); const alias = path.join(dir, 'alias'); fs.symlinkSync(real, alias, 'dir');
  const output = path.join(dir, 'evidence');
  const previous = process.env.npm_config_offline; process.env.npm_config_offline = 'true';
  t.after(() => { if(previous === undefined) delete process.env.npm_config_offline; else process.env.npm_config_offline = previous; });
  const result = await runCurrentBaseline({ cliTgz: archive, workDir: path.join(alias, 'work'), output, timeoutMs: 15000 });
  assert.equal(result.executionState, 'FINISHED');
  assert.equal(result.setup.find(s => s.id === 'install-cli').status, 'PASS');
  assert.equal(result.scenarios.filter(s => s.steps[0].exitCode === 9).length, 6);
  assert.equal(validateBaselineResults(result, output).valid, true);
  for(const mutate of [v => v.scenarios.pop(), v => v.candidate.sha256 = '0'.repeat(64), v => v.scenarios[0].steps[0].status = 'PASS', v => v.productAllPassed = true]) {
    const changed = structuredClone(result); mutate(changed); assert.equal(validateBaselineResults(changed, output).valid, false);
  }
  for(const mutate of [v => v.candidate.installed.entrySha256 = '0'.repeat(64), v => v.candidate.harnessLockSha256 = '0'.repeat(64)]) {
    const changed = structuredClone(result); mutate(changed); assert.equal(validateBaselineResults(changed, output).valid, false);
  }
  fs.appendFileSync(path.join(output, result.scenarios[0].steps[0].log), 'tampered');
  assert.equal(validateBaselineResults(result, output).valid, false);
});

test('current baseline: SIGTERM interrupts an owned command and retains its result', async t => {
  const dir = temp(t);
  const module = new URL('../current-baseline.mjs', import.meta.url).href;
  const script = `import {executeBaselineCommand} from ${JSON.stringify(module)};
    console.log('runner-ready');
    const result=await executeBaselineCommand({id:'interrupted',command:[process.execPath,'-e','console.log("child-ready");setInterval(()=>{},1000)'],cwd:process.argv[1],output:process.argv[1],timeoutMs:10000});
    console.log(JSON.stringify(result));`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script, dir]);
  let output = '', signaled = false;
  child.stdout.on('data', buffer => {
    output += buffer;
    if (!signaled && output.includes('runner-ready')) { signaled = true; setTimeout(() => child.kill('SIGTERM'), 100); }
  });
  const exit = await new Promise((resolve, reject) => { child.on('error', reject); child.on('close', resolve); });
  assert.equal(exit, 0);
  const result = JSON.parse(output.trim().split('\n').at(-1));
  assert.equal(result.interrupted, true); assert.equal(result.status, 'FAIL');
  assert.equal(result.timedOut, false); assert.match(result.error, /SIGTERM/);
});

test('current baseline: timeout kills stubborn descendants without stopping unrelated child', async t => {
  const dir = temp(t);
  const unrelated = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  t.after(() => unrelated.kill('SIGTERM'));
  const grandchild = 'process.on("SIGTERM",()=>{}); console.log("descendant-ready"); setInterval(()=>{},1000)';
  const script = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'inherit'}); setInterval(()=>{},1000);`;
  const started = Date.now();
  const result = await executeBaselineCommand({ id: 'descendant', command: [process.execPath, '-e', script], cwd: dir, output: dir, timeoutMs: 1000 });
  assert.equal(result.timedOut, true); assert.equal(result.status, 'FAIL');
  assert.match(fs.readFileSync(path.join(dir, result.log), 'utf8'), /descendant-ready/);
  assert.ok(Date.now() - started < 8000);
  assert.doesNotThrow(() => process.kill(unrelated.pid, 0));
});
