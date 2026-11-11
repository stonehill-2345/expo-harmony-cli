import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REGISTRY_FILE = fileURLToPath(new URL('../ai-e2e/cases/registry.json', import.meta.url));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(file, label) {
  try { return JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')); }
  catch (error) { throw new Error(`${label} is invalid: ${error.message}`); }
}

function executable(name) {
  const directories = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean);
  for (const directory of directories) {
    const file = path.join(directory, name);
    try {
      fs.accessSync(file, fs.constants.X_OK);
      return fs.realpathSync(file);
    } catch {}
  }
  throw new Error(`Cannot find executable: ${name}`);
}

function safeCommand(command, consumerRoot, output) {
  if (!command || !Array.isArray(command.argv) || !command.argv.length
    || command.argv.some((value) => typeof value !== 'string' || !value)
    || command.shell !== undefined) throw new Error('case command must use a non-empty argv array without a shell');
  const cwd = path.resolve(consumerRoot, command.cwd ?? '.');
  const allowed = [consumerRoot, output].some((root) => {
    const relative = path.relative(root, cwd);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });
  if (!allowed) throw new Error(`case command cwd escapes allowed roots: ${command.cwd}`);
  return { argv: command.argv, cwd, timeoutMs: command.timeoutMs ?? 300_000, evidence: command.evidence ?? [] };
}

export async function prepareRun({
  candidate, aContract, caseReview, consumerRoot, target, platformVersion, stage, output,
  repositoryRoot = process.cwd(), sourceRevision, sourceDirty,
}) {
  const repo = path.resolve(repositoryRoot);
  sourceRevision ??= execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  sourceDirty ??= Boolean(execFileSync('git', ['-C', repo, 'status', '--porcelain=v1', '--untracked-files=all'], { encoding: 'utf8' }).trim());
  const destination = path.resolve(output);
  if (fs.existsSync(destination)) throw new Error(`output already exists: ${destination}`);
  if (sourceDirty) throw new Error('source must be clean for a formal run');
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(sourceRevision ?? '')) throw new Error('source revision is invalid');
  const candidateRoot = fs.realpathSync(path.resolve(candidate));
  const candidateFile = path.join(candidateRoot, 'candidate.json');
  const candidateValue = readJson(candidateFile, 'candidate');
  if (!Array.isArray(candidateValue.packages) || !candidateValue.packages.length || candidateValue.failures?.length) {
    throw new Error('candidate is not a complete successful package set');
  }
  const contract = readJson(aContract, 'A contract');
  const review = readJson(caseReview, 'C case review');
  const registryBytes = fs.readFileSync(REGISTRY_FILE);
  const registry = JSON.parse(registryBytes);
  const definitions = registry.stages?.[stage];
  if (!Array.isArray(definitions) || !definitions.length) throw new Error(`No registered cases for stage ${stage}`);
  const contractCases = new Map((contract.cases ?? []).map((item) => [item.id, item]));
  const reviewed = new Map((review.stages?.[stage] ?? []).map((item) => [item.id, item]));
  const commands = {};
  for (const definition of definitions) {
    const contractCase = contractCases.get(definition.id);
    if (!contractCase) throw new Error(`A contract is missing required case: ${definition.id}`);
    const reviewCase = reviewed.get(definition.id);
    if (!reviewCase) throw new Error(`C review is missing required case: ${definition.id}`);
    if (JSON.stringify(reviewCase.requiredEvidence) !== JSON.stringify(definition.requiredEvidence)) {
      throw new Error(`C review evidence differs for case: ${definition.id}`);
    }
    commands[definition.id] = safeCommand(contractCase.command, path.resolve(consumerRoot), destination);
  }
  for (const id of contractCases.keys()) if (!definitions.some((item) => item.id === id)) throw new Error(`A contract contains unregistered case: ${id}`);
  for (const id of reviewed.keys()) if (!definitions.some((item) => item.id === id)) throw new Error(`C review contains unregistered case: ${id}`);
  if (definitions.some(({ requiresDevice }) => requiresDevice) && (!target || !platformVersion)) {
    throw new Error(`stage ${stage} requires an explicit target and platform version`);
  }

  const temporary = `${destination}.tmp-${process.pid}`;
  fs.mkdirSync(temporary, { recursive: true });
  try {
    const copiedCandidate = path.join(temporary, 'candidate');
    fs.cpSync(candidateRoot, copiedCandidate, { recursive: true, dereference: false, errorOnExist: true });
    fs.copyFileSync(path.resolve(aContract), path.join(temporary, 'a-contract.json'));
    fs.copyFileSync(path.resolve(caseReview), path.join(temporary, 'c-case-review.json'));
    const caseSet = {
      schemaVersion: 1,
      registryVersion: registry.registryVersion,
      registrySha256: sha256(registryBytes),
      cases: definitions.map(({ id, required, requiresDevice, requiredEvidence }) => ({ id, required, requiresDevice, requiredEvidence })),
    };
    writeJson(path.join(temporary, 'case-set.json'), caseSet);
    const manifest = {
      schemaVersion: 1,
      runId: path.basename(destination),
      stage,
      source: { revision: sourceRevision, dirty: false },
      repositoryRoot: repo,
      consumerRoot: path.resolve(consumerRoot),
      caseSet: { path: 'case-set.json', sha256: sha256(fs.readFileSync(path.join(temporary, 'case-set.json'))) },
      candidate: { path: 'candidate/candidate.json', sha256: sha256(fs.readFileSync(path.join(copiedCandidate, 'candidate.json'))) },
      tools: { node: executable('node'), npm: executable('npm'), pnpm: executable('pnpm') },
      ...(target ? { device: { target, platformVersion } } : {}),
      caseCommands: commands,
      handoffs: {
        aContract: { path: 'a-contract.json', sha256: sha256(fs.readFileSync(path.join(temporary, 'a-contract.json'))) },
        cCaseReview: { path: 'c-case-review.json', sha256: sha256(fs.readFileSync(path.join(temporary, 'c-case-review.json'))) },
      },
    };
    writeJson(path.join(temporary, 'run-manifest.json'), manifest);
    fs.renameSync(temporary, destination);
    return { caseSet, manifest };
  } catch (error) {
    fs.rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1]) throw new Error(`Missing value for ${name}`);
  return args[index + 1];
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    const repositoryRoot = process.cwd();
    const result = await prepareRun({
      candidate: option(args, '--candidate'),
      aContract: option(args, '--a-contract'),
      caseReview: option(args, '--case-review'),
      consumerRoot: option(args, '--consumer-root'),
      target: option(args, '--target'),
      platformVersion: option(args, '--platform-version'),
      stage: option(args, '--stage'),
      output: option(args, '--output'),
      repositoryRoot,
      sourceRevision: option(args, '--source-revision'),
      sourceDirty: args.includes('--source-dirty') ? option(args, '--source-dirty') === 'true' : undefined,
    });
    process.stdout.write(`${JSON.stringify({ cases: result.caseSet.cases.length, manifest: result.manifest.runId }, null, 2)}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
