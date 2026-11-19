import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function run(ninjaPath, args) {
  const result = spawnSync(ninjaPath, args, { encoding: 'utf8', shell: false, maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  return { command: [ninjaPath, ...args], exitCode: result.status, signal: result.signal, stdout: result.stdout, stderr: result.stderr };
}

function assertSuccess(result, label) {
  const diagnostic = `${result.stdout}\n${result.stderr}`;
  if (result.exitCode !== 0 || /^ninja: error:/im.test(diagnostic)) {
    throw new Error(`Ninja ${label} failed: ${diagnostic.trim()}`);
  }
}

function explanationKind(line) {
  if (/phony edge with no inputs/i.test(line)) return 'PHONY_ALWAYS_DIRTY';
  if (/cmake\.verify_globs|VerifyGlobs\.cmake_force/i.test(line)) return 'GLOB_VERIFY_DIRTY';
  if (/stored deps info out of date/i.test(line)) return 'DEPS_MTIME_OUT_OF_DATE';
  if (/older than (?:most recent )?input/i.test(line)) return 'OUTPUT_OLDER_THAN_INPUT';
  if (/command line changed/i.test(line)) return 'COMMAND_CHANGED';
  if (/depfile.*missing|missing.*depfile/i.test(line)) return 'DEPFILE_MISSING';
  if (/output .* (?:does not exist|missing)/i.test(line)) return 'OUTPUT_MISSING';
  return 'OTHER';
}

function explanation(line) {
  const row = { kind: explanationKind(line), text: line };
  const deps = line.match(/stored deps info out of date for '([^']+)' \((\d+) vs (\d+)\)/i);
  if (deps) Object.assign(row, {
    output: deps[1],
    storedMtimeNs: deps[2],
    currentMtimeNs: deps[3],
    deltaNs: (BigInt(deps[3]) - BigInt(deps[2])).toString(),
  });
  return row;
}

function inputIdentity(file, roots) {
  const absolute = path.resolve(file);
  const allowed = roots.some((root) => inside(root, absolute));
  const row = { path: absolute, allowed, exists: fs.existsSync(absolute) };
  if (!row.exists) return row;
  const stat = fs.lstatSync(absolute, { bigint: true });
  Object.assign(row, {
    type: stat.isSymbolicLink() ? 'symlink' : stat.isFile() ? 'file' : stat.isDirectory() ? 'directory' : 'other',
    size: stat.size.toString(),
    mode: Number(stat.mode & 0o7777n),
    inode: stat.ino.toString(),
    device: stat.dev.toString(),
    mtimeNs: stat.mtimeNs.toString(),
    ctimeNs: stat.ctimeNs.toString(),
  });
  if (stat.isSymbolicLink()) row.link = fs.readlinkSync(absolute);
  else if (allowed && stat.isFile()) row.sha256 = sha256(fs.readFileSync(absolute));
  return row;
}

export async function diagnoseNinja({ ninjaPath, buildDirectory, target, allowedRoots }) {
  if (typeof target !== 'string' || !target || target.startsWith('-') || target.includes('\0')) {
    throw new Error('Ninja target must be a non-option string');
  }
  if (!Array.isArray(allowedRoots) || allowedRoots.length === 0) throw new Error('allowedRoots must be non-empty');
  const lexicalBuild = path.resolve(buildDirectory);
  if (fs.lstatSync(lexicalBuild).isSymbolicLink()) throw new Error('Ninja build directory must not be a symlink');
  const build = fs.realpathSync(lexicalBuild);
  if (!fs.statSync(path.join(build, 'build.ninja')).isFile()) throw new Error('build.ninja is missing');
  fs.accessSync(ninjaPath, fs.constants.X_OK);
  const roots = allowedRoots.map((root) => fs.realpathSync(root));

  const dryRun = run(ninjaPath, ['-C', build, '-n', '-d', 'explain', target]);
  assertSuccess(dryRun, 'dry-run');
  const inputTool = run(ninjaPath, ['-C', build, '-t', 'inputs', target]);
  assertSuccess(inputTool, 'inputs');
  const explanations = `${dryRun.stdout}\n${dryRun.stderr}`.split(/\r?\n/)
    .filter((line) => line.startsWith('ninja explain:'))
    .map(explanation);
  const inputs = [...new Set(inputTool.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))]
    .map((file) => inputIdentity(path.isAbsolute(file) ? file : path.join(build, file), roots));
  return { schemaVersion: 1, buildDirectory: build, target, allowedRoots: roots, dryRun, inputTool, explanations, inputs };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const value = (name) => args[args.indexOf(name) + 1];
  const roots = args.flatMap((arg, index) => arg === '--allow-root' ? [args[index + 1]] : []);
  const report = await diagnoseNinja({
    ninjaPath: path.resolve(value('--ninja')),
    buildDirectory: path.resolve(value('--build-dir')),
    target: value('--target'),
    allowedRoots: roots.map((root) => path.resolve(root)),
  });
  const output = value('--output');
  if (output) fs.writeFileSync(path.resolve(output), `${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
