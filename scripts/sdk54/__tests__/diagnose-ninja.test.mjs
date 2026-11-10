import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { diagnoseNinja } from '../diagnose-ninja.mjs';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-ninja-diagnostic-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'project');
  const build = path.join(project, 'build');
  const source = path.join(project, 'src/a.cpp');
  const config = path.join(build, 'config.h');
  const outside = path.join(root, 'outside.txt');
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.mkdirSync(build, { recursive: true });
  fs.writeFileSync(source, 'int main() { return 0; }\n');
  fs.writeFileSync(config, '#define VALUE 1\n');
  fs.writeFileSync(outside, 'must not hash\n');
  fs.writeFileSync(path.join(build, 'build.ninja'), 'rule noop\n  command = true\n');
  const calls = path.join(root, 'calls.jsonl');
  const ninja = path.join(root, 'ninja');
  fs.writeFileSync(calls, '');
  fs.writeFileSync(ninja, `#!${process.execPath}
const fs=require('fs');
const args=process.argv.slice(2);
fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify(args)+'\\n');
if(args.includes('inputs')) process.stdout.write('../src/a.cpp\\nconfig.h\\n../../outside.txt\\n');
else {
  process.stdout.write('[1/2] c++ -c ../src/a.cpp\\n');
  process.stderr.write('ninja explain: output CMakeFiles/VerifyGlobs.cmake_force of phony edge with no inputs does not exist\\n');
  process.stderr.write('ninja explain: CMakeFiles/cmake.verify_globs is dirty\\n');
  process.stderr.write("ninja explain: stored deps info out of date for 'obj/a.o' (1001 vs 1000)\\n");
  process.stderr.write('ninja explain: output obj/a.o older than most recent input ../src/a.cpp\\n');
  process.stderr.write('ninja explain: command line changed for obj/b.o\\n');
}
`, { mode: 0o755 });
  return { root, project, build, source, config, outside, calls, ninja };
}

test('captures dry-run explanations and hashes only inputs inside allowed roots', async (t) => {
  const f = fixture(t);
  const buildNinjaBefore = fs.readFileSync(path.join(f.build, 'build.ninja'));
  const report = await diagnoseNinja({
    ninjaPath: f.ninja,
    buildDirectory: f.build,
    target: 'app',
    allowedRoots: [f.project],
  });

  assert.equal(report.dryRun.exitCode, 0);
  assert.deepEqual(report.explanations.map(({ kind }) => kind), [
    'PHONY_ALWAYS_DIRTY', 'GLOB_VERIFY_DIRTY', 'DEPS_MTIME_OUT_OF_DATE', 'OUTPUT_OLDER_THAN_INPUT', 'COMMAND_CHANGED',
  ]);
  assert.deepEqual(report.explanations[2], {
    kind: 'DEPS_MTIME_OUT_OF_DATE',
    text: "ninja explain: stored deps info out of date for 'obj/a.o' (1001 vs 1000)",
    output: 'obj/a.o',
    storedMtimeNs: '1001',
    currentMtimeNs: '1000',
    deltaNs: '-1',
  });
  assert.deepEqual(JSON.parse(`[${fs.readFileSync(f.calls, 'utf8').trim().split('\n').join(',')}]`), [
    ['-C', f.build, '-n', '-d', 'explain', 'app'],
    ['-C', f.build, '-t', 'inputs', 'app'],
  ]);
  const source = report.inputs.find(({ path: file }) => file === f.source);
  assert.equal(source.allowed, true);
  assert.equal(source.sha256, sha256(fs.readFileSync(f.source)));
  assert.match(source.mtimeNs, /^\d+$/);
  const outside = report.inputs.find(({ path: file }) => file === f.outside);
  assert.equal(outside.allowed, false);
  assert.equal('sha256' in outside, false);
  assert.deepEqual(fs.readFileSync(path.join(f.build, 'build.ninja')), buildNinjaBefore);
});

test('rejects option-like targets and symlinked build directories before invoking Ninja', async (t) => {
  const f = fixture(t);
  await assert.rejects(diagnoseNinja({
    ninjaPath: f.ninja, buildDirectory: f.build, target: '-bad', allowedRoots: [f.project],
  }), /target/);
  const alias = path.join(f.root, 'build-alias');
  fs.symlinkSync(f.build, alias);
  await assert.rejects(diagnoseNinja({
    ninjaPath: f.ninja, buildDirectory: alias, target: 'app', allowedRoots: [f.project],
  }), /symlink/);
  assert.equal(fs.readFileSync(f.calls, 'utf8'), '');
});

test('rejects Ninja fatal diagnostics even when the process exits zero', async (t) => {
  const f = fixture(t);
  fs.writeFileSync(f.ninja, `#!${process.execPath}\nprocess.stderr.write('ninja: error: WriteFile(.ninja_lock): denied\\n')\n`, { mode: 0o755 });
  await assert.rejects(diagnoseNinja({
    ninjaPath: f.ninja, buildDirectory: f.build, target: 'app', allowedRoots: [f.project],
  }), /ninja_lock/);
});
