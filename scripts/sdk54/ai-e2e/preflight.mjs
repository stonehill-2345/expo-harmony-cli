import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { verifyCandidateManifest } from './evidence.mjs';
import { validateCaseSet, validateRunManifest } from './schema.mjs';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function referencedFile(runDirectory, reference, label, errors) {
  if (!reference || typeof reference.path !== 'string') return null;
  const file = path.resolve(runDirectory, reference.path);
  if (!inside(runDirectory, file)) {
    errors.push(`${label} path escapes run directory`);
    return null;
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    errors.push(`${label} is not a file`);
    return null;
  }
  if (!inside(runDirectory, fs.realpathSync(file))) {
    errors.push(`${label} resolves outside run directory`);
    return null;
  }
  const actual = sha256(fs.readFileSync(file));
  if (actual !== reference.sha256) errors.push(`${label} hash mismatch`);
  return file;
}

export function preflightRun(manifestFile, stage) {
  const errors = [];
  const absoluteManifest = path.resolve(manifestFile);
  const runDirectory = fs.realpathSync(path.dirname(absoluteManifest));
  const manifest = JSON.parse(fs.readFileSync(absoluteManifest, 'utf8'));
  errors.push(...validateRunManifest(manifest));
  if (manifest.stage !== stage) errors.push(`manifest stage ${manifest.stage ?? '<missing>'} does not match ${stage}`);
  if (manifest.source?.dirty === true) errors.push('source must be clean');

  const repositoryRoot = path.resolve(manifest.repositoryRoot ?? '');
  const consumerRoot = path.resolve(manifest.consumerRoot ?? '');
  if (inside(repositoryRoot, consumerRoot)) errors.push('consumerRoot must be outside repositoryRoot');

  const caseSetFile = referencedFile(runDirectory, manifest.caseSet, 'case-set', errors);
  const candidateFile = referencedFile(runDirectory, manifest.candidate, 'candidate', errors);
  if (candidateFile) errors.push(...verifyCandidateManifest(candidateFile));
  for (const tool of ['node', 'npm', 'pnpm']) {
    const toolPath = manifest.tools?.[tool];
    try {
      if (!path.isAbsolute(toolPath ?? '') || !fs.statSync(toolPath).isFile()) throw new Error();
      fs.accessSync(toolPath, fs.constants.X_OK);
    } catch {
      errors.push(`tools.${tool} is not an executable file`);
    }
  }

  if (caseSetFile) {
    const caseSet = JSON.parse(fs.readFileSync(caseSetFile, 'utf8'));
    errors.push(...validateCaseSet(caseSet));
    if (caseSet.cases?.some((definition) => definition.required && definition.requiresDevice)
      && (!manifest.device?.target || !manifest.device?.platformVersion)) {
      errors.push(`stage ${stage} requires an explicit device`);
    }
  }
  return { ready: errors.length === 0, errors };
}
