import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { preflightRun } from './preflight.mjs';
import { runCommand } from './process.mjs';
import { verifyRunReport } from './report.mjs';

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function writeJson(file, value) {
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, file);
}

function inside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

function commonResult(manifest, definition, status, reason) {
  const now = new Date().toISOString();
  return {
    caseId: definition.id,
    attemptId: 'attempt-1',
    runId: manifest.runId,
    caseSetSha256: manifest.caseSet.sha256,
    candidateSha256: manifest.candidate.sha256,
    status,
    startedAt: status === 'NOT_RUN' ? null : now,
    endedAt: status === 'NOT_RUN' ? null : now,
    timedOut: false,
    interrupted: false,
    evidence: [],
    reason,
  };
}

function evidenceEntry(runDirectory, evidence, errors) {
  const file = path.resolve(runDirectory, evidence.path);
  if (!inside(runDirectory, file) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    errors.push(`Evidence is missing or outside run directory: ${evidence.path}`);
    return null;
  }
  return { type: evidence.type, path: evidence.path, sha256: sha256(fs.readFileSync(file)) };
}

export async function runValidation(manifestFile, stage, { signal } = {}) {
  const absoluteManifest = path.resolve(manifestFile);
  const runDirectory = fs.realpathSync(path.dirname(absoluteManifest));
  const manifest = JSON.parse(fs.readFileSync(absoluteManifest, 'utf8'));
  const resultsDocument = { schemaVersion: 1, runId: manifest.runId, results: [] };
  const resultsFile = path.join(runDirectory, 'results.json');
  const preflight = preflightRun(absoluteManifest, stage);
  let caseSet = { cases: [] };
  if (typeof manifest.caseSet?.path === 'string') {
    const caseSetFile = path.resolve(runDirectory, manifest.caseSet.path);
    if (inside(runDirectory, caseSetFile) && fs.existsSync(caseSetFile) && fs.statSync(caseSetFile).isFile()) {
      try { caseSet = JSON.parse(fs.readFileSync(caseSetFile, 'utf8')); } catch { /* report records invalid case-set */ }
    }
  }

  if (!preflight.ready) {
    resultsDocument.results = (Array.isArray(caseSet.cases) ? caseSet.cases : [])
      .map((definition) => commonResult(manifest, definition, 'BLOCKED', preflight.errors));
    writeJson(resultsFile, resultsDocument);
  } else {
    for (const definition of caseSet.cases) {
      const command = manifest.caseCommands?.[definition.id];
      if (!command) {
        resultsDocument.results.push(commonResult(manifest, definition, 'NOT_RUN', ['No command configured']));
        writeJson(resultsFile, resultsDocument);
        continue;
      }
      const cwd = path.resolve(command.cwd);
      if (!inside(path.resolve(manifest.consumerRoot), cwd) && !inside(runDirectory, cwd)) {
        resultsDocument.results.push(commonResult(manifest, definition, 'BLOCKED', ['Command cwd must be inside consumerRoot or run directory']));
        writeJson(resultsFile, resultsDocument);
        continue;
      }
      const commandResult = await runCommand({
        id: definition.id,
        argv: command.argv,
        cwd,
        outputDirectory: runDirectory,
        timeoutMs: command.timeoutMs,
        signal,
      });
      const evidenceErrors = [];
      const evidence = [
        { type: 'command-log', ...commandResult.stdout },
        { type: 'command-log', ...commandResult.stderr },
        ...(command.evidence ?? []).map((entry) => evidenceEntry(runDirectory, entry, evidenceErrors)).filter(Boolean),
      ];
      const passed = commandResult.exitCode === 0 && !commandResult.timedOut
        && !commandResult.interrupted && evidenceErrors.length === 0;
      resultsDocument.results.push({
        caseId: definition.id,
        attemptId: 'attempt-1',
        runId: manifest.runId,
        caseSetSha256: manifest.caseSet.sha256,
        candidateSha256: manifest.candidate.sha256,
        status: passed ? 'PASS' : 'FAIL',
        startedAt: commandResult.startedAt,
        endedAt: commandResult.endedAt,
        timedOut: commandResult.timedOut,
        interrupted: commandResult.interrupted,
        evidence,
        command: commandResult,
        reason: evidenceErrors,
      });
      writeJson(resultsFile, resultsDocument);
    }
  }

  const report = verifyRunReport(runDirectory);
  writeJson(path.join(runDirectory, 'closure-report.json'), report);
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  const manifestIndex = args.indexOf('--manifest');
  const stageIndex = args.indexOf('--stage');
  if (manifestIndex < 0 || stageIndex < 0 || !args[manifestIndex + 1] || !args[stageIndex + 1]) {
    throw new Error('Usage: run.mjs --manifest /absolute/path/run-manifest.json --stage V-01');
  }
  const report = await runValidation(args[manifestIndex + 1], args[stageIndex + 1]);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.canClose) process.exitCode = 1;
}
