import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';
import { isMain } from './a-common.mjs';

import { validateOtherCaptureIdentities } from '../ai-e2e/schema.mjs';

const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');

// Packages raw material only. C independently checks command semantics and device behavior.
export function exportOtherCaptures({ manifestFile, output }) {
  const root = fs.realpathSync(path.dirname(path.resolve(manifestFile)));
  const destination = path.resolve(output);
  if (fs.existsSync(destination)) throw new Error('output exists');
  const manifestBytes = fs.readFileSync(manifestFile);
  const manifest = JSON.parse(manifestBytes);
  const cases = manifest.m4?.other?.caseCaptures;
  if (!manifest.runId || !manifest.device?.target || !manifest.device?.platformVersion
    || validateOtherCaptureIdentities(cases).length) {
    throw new Error('complete Other case identities and device are required');
  }
  const files = new Map();
  const parsed = new Set();
  function collect(ref, capture = false) {
    if (!ref || typeof ref.path !== 'string' || !ref.path || path.isAbsolute(ref.path)
      || ref.path.includes('\\') || ref.path.split('/').some(s => ['..', '.', ''].includes(s))
      || !/^[a-f0-9]{64}$/.test(ref.sha256 ?? '')) throw new Error('unsafe evidence reference');
    const actual = fs.realpathSync(path.join(root, ref.path));
    if (!actual.startsWith(root + path.sep)) throw new Error('evidence escapes root');
    const bytes = fs.readFileSync(actual);
    if (sha(bytes) !== ref.sha256) throw new Error(`hash mismatch: ${ref.path}`);
    files.set(ref.path, bytes);
    // A capture is JSON by contract; its filename is not a content type.
    const requiredJSON = capture || /\.json$/i.test(ref.path);
    const firstByte = bytes.find(byte => ![9, 10, 13, 32].includes(byte));
    if (requiredJSON || firstByte === 123 || firstByte === 91) {
      let value;
      try { value = JSON.parse(bytes); }
      catch (error) {
        if (requiredJSON) throw error;
        return; // Non-JSON logs and binary evidence remain opaque original bytes.
      }
      if (capture && (!value || typeof value !== 'object' || Array.isArray(value))) {
        throw new Error(`capture must be a JSON object: ${ref.path}`);
      }
      if (!parsed.has(ref.path)) {
        parsed.add(ref.path);
        visit(value);
      }
    }
  }
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, 'path') && Object.hasOwn(value, 'sha256')) collect(value);
    for (const child of Object.values(value)) visit(child);
  }
  collect(manifest.candidate);
  for (const row of Object.values(cases)) {
    collect(row.hap); collect(row.capture, true);
  }
  const result = { schemaVersion: 1, kind: 'm4-other-capture-handoff', status: 'CAPTURED_NOT_VERIFIED',
    runId: manifest.runId, candidate: manifest.candidate, device: manifest.device, cases,
    runManifest: { path: 'source-run-manifest.json', sha256: sha(manifestBytes) } };
  for (const reserved of ['source-run-manifest.json','other-captures.json']) {
    if (files.has(reserved)) throw new Error(`reserved output reference: ${reserved}`);
  }
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const temp = fs.mkdtempSync(path.join(path.dirname(destination), '.other-captures-'));
  try {
    for (const [name, bytes] of files) {
      const file = path.join(temp, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes);
    }
    fs.writeFileSync(path.join(temp, 'source-run-manifest.json'), manifestBytes);
    fs.writeFileSync(path.join(temp, 'other-captures.json'), JSON.stringify(result, null, 2) + '\n');
    if (fs.existsSync(destination)) throw new Error('output exists');
    fs.renameSync(temp, destination);
  } catch (error) { fs.rmSync(temp, { recursive: true, force: true }); throw error; }
  return result;
}
if (isMain(import.meta.url)) {
  const { values } = parseArgs({ options: { 'run-manifest': { type: 'string' }, output: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) console.log('b-export-other-captures.mjs --run-manifest <independent manifest> --output <new directory>');
  else try { console.log(JSON.stringify(exportOtherCaptures({ manifestFile: values['run-manifest'], output: values.output }))); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
