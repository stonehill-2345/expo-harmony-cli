import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { copySdk52Project, verifySdk52Installed, fingerprintNativeProject, validateSdk52Replay, canProbeSdk52Release } from '../sdk52-install-replay.mjs';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk52-replay-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, 'source'); fs.mkdirSync(project);
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ name: 'sdk52-test', dependencies: { expo: '52.0.49', react: '18.3.1', 'react-native': '0.77.1', '@react-native-oh/react-native-harmony': '0.77.71', '@react-native-oh/react-native-harmony-cli': '0.77.71' } }));
  fs.writeFileSync(path.join(project, 'app.json'), '{"expo":{"name":"sample","slug":"sample"}}');
  return { root, project };
}

test('SDK52 replay: copies original files with hashes and refuses overwriting', t => {
  const { root, project } = fixture(t), target = path.join(root, 'target');
  fs.mkdirSync(path.join(project, 'scripts')); fs.writeFileSync(path.join(project, 'scripts/start.js'), 'original');
  const result = copySdk52Project(project, target);
  assert.equal(fs.readFileSync(path.join(target, 'scripts/start.js'), 'utf8'), 'original');
  assert.ok(result.files.every(file => file.sha256.length === 64));
  assert.throws(() => copySdk52Project(project, target), /empty|exist/);
});

test('SDK52 replay: rejects another SDK and source symlinks before copying', t => {
  const { root, project } = fixture(t);
  fs.writeFileSync(path.join(project, 'package.json'), '{"dependencies":{"expo":"54.0.37"}}');
  assert.throws(() => copySdk52Project(project, path.join(root, 'wrong')), /SDK52/);
  fs.writeFileSync(path.join(project, 'package.json'), '{"dependencies":{"expo":"52.0.49"}}');
  fs.symlinkSync('app.json', path.join(project, 'linked.json'));
  assert.throws(() => copySdk52Project(project, path.join(root, 'linked')), /symlink/);
});

test('SDK52 replay: installed identities must match declared pins and be isolated', t => {
  const { project } = fixture(t);
  const manifest = JSON.parse(fs.readFileSync(path.join(project, 'package.json')));
  assert.equal(verifySdk52Installed(project).valid, false);
  for (const [name, version] of Object.entries(manifest.dependencies)) {
    const directory = path.join(project, 'node_modules', name); fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name, version }));
  }
  assert.equal(verifySdk52Installed(project).valid, true);
  fs.writeFileSync(path.join(project, 'node_modules/expo/package.json'), '{"name":"expo","version":"54.0.1"}');
  assert.equal(verifySdk52Installed(project).valid, false);
});

test('SDK52 replay: missing generated project cannot pass and native fingerprint detects changes', t => {
  const { project } = fixture(t);
  assert.throws(() => fingerprintNativeProject(project), /Missing/);
  for (const file of ['harmony/entry/src/main/module.json5', 'harmony/AppScope/app.json5', 'harmony/build-profile.json5']) {
    const target = path.join(project, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, '{}');
  }
  const first = fingerprintNativeProject(project), second = fingerprintNativeProject(project);
  assert.equal(first.sha256, second.sha256);
  fs.appendFileSync(path.join(project, 'harmony/build-profile.json5'), '\nchanged');
  assert.notEqual(first.sha256, fingerprintNativeProject(project).sha256);
});

test('SDK52 replay: missing matrix/candidate and fake stage completion fail validation', () => {
  const result = validateSdk52Replay({ scenarios: [], stageClosable: true, productAllPassed: true }, '.');
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(error => /scenario|matrix/i.test(error)));
  assert.ok(result.errors.some(error => /stage|product/i.test(error)));
});

test('SDK52 replay: valid failed baseline is accepted but package-manager and source omissions are rejected', t => {
  const { root, project } = fixture(t), output = path.join(root, 'logs'); fs.mkdirSync(output);
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const candidate = path.join(root, 'candidate.tgz'), reference = path.join(root, 'reference.json');
  fs.writeFileSync(candidate, 'fixture-candidate'); fs.writeFileSync(reference, '{}');
  function command(id, exitCode, args = ['fixture-command']) {
    const log = `${id}.log`; fs.writeFileSync(path.join(output, log), 'fixture only');
    return { id, command: args, status: exitCode === 0 ? 'PASS' : 'FAIL', exitCode, log, logSha256: digest(fs.readFileSync(path.join(output, log))) };
  }
  const result = { schemaVersion: 1, state: 'FINISHED', stageClosable: false, productAllPassed: false,
    candidate: { path: candidate, sha256: digest(fs.readFileSync(candidate)) }, reference: { path: reference, sha256: digest(fs.readFileSync(reference)) },
    setup: ['git-init', 'hdc-version', 'hdc-targets', 'no-git-commits'].map(id => command(id, 0)),
    scenarios: ['npm', 'pnpm'].map(pm => {
      const id = `sdk52-${pm}`, target = path.join(root, id), source = copySdk52Project(project, target);
      return { id, packageManager: pm, project: target, source: { ...source, evidenceRoot: target }, steps: [
        command(`${id}-install`, 1, pm === 'npm' ? ['npm', 'install', '--no-audit', '--no-fund'] : ['pnpm', 'install', '--reporter=append-only']),
        ...['identity', 'prebuild', 'repeat-prebuild', 'repeat-consistency', 'release-bundle', 'native-device'].map(name => ({ id: `${id}-${name}`, status: 'NOT_RUN', reason: 'fixture install failed' })),
      ] };
    }),
  };
  assert.equal(validateSdk52Replay(result, output).valid, true);
  const wrongPm = structuredClone(result); wrongPm.scenarios[0].packageManager = 'pnpm'; wrongPm.scenarios[0].steps[0].command = ['pnpm', 'install', '--reporter=append-only'];
  assert.equal(validateSdk52Replay(wrongPm, output).valid, false);
  const omitted = structuredClone(result); omitted.scenarios[0].source.files.pop(); omitted.scenarios[0].source.sha256 = digest(JSON.stringify(omitted.scenarios[0].source.files));
  assert.equal(validateSdk52Replay(omitted, output).valid, false);
});

test('SDK52 replay: legacy overwrite guard does not block independent bundle of successful first generation', () => {
  const scenario = { nativeFirst: { sha256: 'known', files: [{ path: 'entry/src/main/module.json5' }] }, steps: [
    { status: 'PASS' }, { status: 'PASS' }, { status: 'PASS' }, { status: 'FAIL' }, { status: 'NOT_RUN' },
  ] };
  assert.equal(canProbeSdk52Release(scenario), true);
  for (const index of [0, 1, 2]) {
    const changed = structuredClone(scenario); changed.steps[index].status = 'FAIL'; assert.equal(canProbeSdk52Release(changed), false);
  }
  assert.equal(canProbeSdk52Release({ ...scenario, nativeFirst: null }), false);
});
