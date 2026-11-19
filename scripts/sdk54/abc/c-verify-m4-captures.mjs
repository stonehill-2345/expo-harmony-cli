#!/usr/bin/env node
// C 侧多应用 M4 Other 消费校验（2026-11-14，对齐 b-other-capture-handoff.md
// 与 run-manifest.schema.json 的 m4.other.caseCaptures 契约）。
//
// 输入是 B producer 交付的多应用采集清单。本工具不信任任何自报状态，
// 从 run-manifest 与 capture 原件独立重算身份、命令回执、boot 对应与
// 日志语义；截图必须真实解码、layout 必须可解析。缺任何独立身份、命令
// 或原件即 FAIL（fail-closed）。完整 Other 在视觉 Oracle 接合前只能输出
// BLOCKED 并保留 logSemantics 明细，不以日志 PASS 或图片可解码替代。
//
// 用法：node c-verify-m4-captures.mjs --manifest <multi-app run-manifest.json> [--output <new dir>]

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { repository, sha256, writeJSON, isMain } from './a-common.mjs';
import { decodeScreenshot } from '../ai-e2e/evidence.mjs';

export const M4_OTHER_CASES = Object.freeze([
  'M4-A03-splash', 'M4-A03-system-ui', 'M4-A03-status-bar', 'M4-A04-linking-router', 'M4-A05-browser',
]);
export const M4_OTHER_PHYSICAL_CASES = Object.freeze(M4_OTHER_CASES.filter(id => id !== 'M4-A03-status-bar'));
export const M4_OTHER_DERIVED_CASE = 'M4-A07-package-sync';
const ALL_CASES = Object.freeze([...M4_OTHER_CASES, M4_OTHER_DERIVED_CASE]);
const CHECKER = 'scripts/sdk54/abc/check-other-log.cjs';
const REFERENCE_PATTERN = /^(?!\.\.?(?:\/|$))[^/\\\u0000]+(?:\/(?!\.\.?(?:\/|$))[^/\\\u0000]+)*$/;
const BOOT_MARKERS = Object.freeze({
  'M4-A03-splash': 'A04_SPLASH_STATUS',
  'M4-A03-status-bar': 'A04_SPLASH_STATUS',
  'M4-A03-system-ui': 'A04_SYSTEM_UI',
  'M4-A04-linking-router': 'A_ROUTER_PROBE',
  'M4-A05-browser': 'A04_WEB_BROWSER',
});
const validBootId = value => (typeof value === 'string' && value.length > 0 && !value.includes('\0'))
  || (Number.isSafeInteger(value) && value > 0);

function readReference(root, ref, label) {
  if (!ref || typeof ref.path !== 'string' || !REFERENCE_PATTERN.test(ref.path) || !/^[a-f0-9]{64}$/.test(ref.sha256 ?? '')) {
    throw new Error(`invalid ${label} reference`);
  }
  const file = fs.realpathSync(path.join(root, ref.path));
  if (!file.startsWith(root + path.sep)) throw new Error(`${label} reference escapes the manifest root`);
  const bytes = fs.readFileSync(file);
  if (sha256(bytes) !== ref.sha256) throw new Error(`${label} hash mismatch: ${ref.path}`);
  return bytes;
}

function commandBytes(root, row, expectedArgv, captureCwd, label) {
  if (!row || row.cwd !== captureCwd || row.exitCode !== 0 || row.signal !== null
    || row.timedOut !== false || row.interrupted !== false
    || JSON.stringify(row.argv) !== JSON.stringify(expectedArgv)) {
    throw new Error(`${label} command does not match the captured device/process`);
  }
  const stdout = readReference(root, row.stdout, `${label} stdout`);
  readReference(root, row.stderr, `${label} stderr`);
  return stdout;
}

function decodeArtifacts(root, capture, caseId) {
  const problems = [], decodes = [];
  const images = [];
  if (capture.screenshot) images.push(capture.screenshot);
  if (Array.isArray(capture.screenshots)) images.push(...capture.screenshots);
  if (!images.length) problems.push(`${caseId} capture has no screenshot reference`);
  for (const [index, ref] of images.entries()) {
    try { decodes.push(decodeScreenshot(readReference(root, ref, `${caseId} screenshot ${index}`))); }
    catch (error) { problems.push(`${caseId} screenshot ${index} is not decodable: ${error.message}`); }
  }
  const layouts = [];
  if (capture.layout) layouts.push(capture.layout);
  if (Array.isArray(capture.layouts)) layouts.push(...capture.layouts);
  if (!layouts.length) problems.push(`${caseId} capture has no layout reference`);
  for (const [index, ref] of layouts.entries()) {
    try { JSON.parse(readReference(root, ref, `${caseId} layout ${index}`).toString('utf8')); }
    catch { problems.push(`${caseId} layout ${index} is not parsable JSON`); }
  }
  return { problems, decodes };
}

function replayCaseChecker(log, mode, caseId, reload) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-c-capture-'));
  try {
    const input = path.join(temp, 'device.log');
    fs.writeFileSync(input, log);
    const replay = spawnSync(process.execPath, [path.join(repository, CHECKER), input, mode, ...(reload ? ['--reload'] : [])],
      { encoding: 'utf8', timeout: 30_000, maxBuffer: 4 * 1024 * 1024, env: { PATH: process.env.PATH } });
    if (replay.error || replay.signal) return { ok: false, detail: `checker failed to run: ${replay.error?.message ?? replay.signal}` };
    let verdict;
    for (const line of replay.stdout.split('\n')) {
      if (line === `${caseId}=PASS`) verdict = 'PASS';
      else if (line === `${caseId}=FAIL`) verdict = 'FAIL';
    }
    if (verdict !== 'PASS') {
      const reason = (replay.stderr || replay.stdout).split('\n').filter(line => line.startsWith(`${caseId}:`)).join('; ');
      return { ok: false, detail: reason || `checker verdict for ${caseId} is ${verdict ?? 'absent'}` };
    }
    return { ok: true, stdout: replay.stdout };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

function identityOf(entry) {
  const reference = value => value && typeof value === 'object'
    ? { path: value.path, sha256: value.sha256 }
    : value;
  return JSON.stringify({
    bundle: entry.bundle, pid: entry.pid, mode: entry.mode, bootIds: entry.bootIds,
    captureCwd: entry.captureCwd, hap: reference(entry.hap),
  });
}

function markerBootIds(caseId, log) {
  const marker = BOOT_MARKERS[caseId];
  const token = `${marker}=`;
  const bootIds = [];
  for (const line of log.split('\n')) {
    const index = line.indexOf(token);
    if (index < 0) continue;
    let row;
    try { row = JSON.parse(line.slice(index + token.length)); }
    catch { throw new Error(`${marker} marker is malformed`); }
    const boot = row?.boot;
    if (!validBootId(boot)) {
      throw new Error(`${marker} marker has no valid boot identity`);
    }
    if (!bootIds.includes(boot)) bootIds.push(boot);
  }
  return bootIds;
}

export function validateMultiAppM4Captures(manifestFile) {
  const resolved = path.resolve(manifestFile);
  const root = fs.realpathSync(path.dirname(resolved));
  const manifest = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const result = { schemaVersion: 1, kind: 'c-multi-app-m4-captures', runId: manifest.runId ?? null,
    candidateSha256: manifest.candidate?.sha256 ?? null, target: manifest.device?.target ?? null,
    systemVersion: manifest.device?.platformVersion ?? null,
    cases: {}, logSemantics: 'PASS', artifacts: 'COMPLETE', status: 'PASS', blockers: [] };
  const fail = (caseId, message) => {
    result.cases[caseId] ??= { status: 'FAIL', failures: [] };
    result.cases[caseId].status = 'FAIL';
    result.cases[caseId].failures ??= [];
    result.cases[caseId].failures.push(message);
    result.status = 'FAIL';
  };
  if (manifest.schemaVersion !== 1 || !manifest.runId || !manifest.tools?.hdc
    || !/^[a-f0-9]{64}$/.test(manifest.candidate?.sha256 ?? '')
    || !manifest.device?.target || !manifest.device.platformVersion) throw new Error('multi-app manifest identity is incomplete');
  try { readReference(root, manifest.candidate, 'candidate'); }
  catch (error) { result.blockers.push(`candidate原件不可用: ${error.message}`); result.status = 'FAIL'; }
  const entries = manifest.m4?.other?.caseCaptures;
  if (!entries || JSON.stringify(Object.keys(entries).sort()) !== JSON.stringify([...ALL_CASES].sort())) {
    throw new Error(`caseCaptures must contain exactly ${ALL_CASES.join(', ')}`);
  }
  for (const caseId of ALL_CASES) {
    const entry = entries[caseId];
    if (!/^[A-Za-z0-9_.-]+$/.test(entry?.bundle ?? '') || !Number.isSafeInteger(entry?.pid) || entry.pid < 1
      || !['debug', 'release'].includes(entry?.mode) || !Array.isArray(entry?.bootIds) || !entry.bootIds.length
      || entry.bootIds.some(id => !validBootId(id))
      || new Set(entry.bootIds).size !== entry.bootIds.length
      || typeof entry?.captureCwd !== 'string' || !entry.captureCwd.startsWith('/')) {
      fail(caseId, 'capture entry identity is malformed'); continue;
    }
    let captureBytes;
    try { captureBytes = readReference(root, entry.capture, `${caseId} capture`); readReference(root, entry.hap, `${caseId} HAP`); }
    catch (error) { fail(caseId, error.message); continue; }
    let capture;
    try { capture = JSON.parse(captureBytes.toString('utf8')); }
    catch { fail(caseId, 'capture原件不是 JSON'); continue; }
    if (capture.candidateSha256 !== manifest.candidate.sha256) fail(caseId, 'capture candidateSha256 differs from the manifest');
    if (capture.target !== manifest.device.target || capture.systemVersion !== manifest.device.platformVersion) {
      fail(caseId, 'capture target/systemVersion differ from the manifest');
    }
    if (identityOf(capture) !== identityOf(entry)) fail(caseId, 'capture identity differs from the manifest entry');
    if (result.cases[caseId]?.status === 'FAIL') continue;
    // Physical cases replay commands and logs; package-sync is derived below.
    if (caseId === M4_OTHER_DERIVED_CASE) { result.cases[caseId] = { status: 'PENDING_DERIVED', failures: [] }; continue; }
    try {
      const hdc = manifest.tools.hdc, target = manifest.device.target;
      const pid = commandBytes(root, capture.pidCommand, [hdc, '-t', target, 'shell', 'pidof', entry.bundle], entry.captureCwd, 'PID');
      if (pid.toString('utf8').trim() !== String(entry.pid)) fail(caseId, 'PID output differs from the captured identity');
      const log = commandBytes(root, capture.logCommand, [hdc, '-t', target, 'shell', 'hilog', '-x', '-P', String(entry.pid)], entry.captureCwd, 'hilog');
      const install = commandBytes(root, capture.installCommand, [hdc, '-t', target, 'install', '-r', entry.hap.path], entry.captureCwd, 'HAP install');
      const receipt = install.toString('utf8');
      if (!/install bundle successfully/i.test(receipt) || /\b(fail(?:ed|ure)?|error)\b/i.test(receipt)) fail(caseId, 'HAP install has no successful receipt');
      const text = log.toString('utf8');
      const observedBootIds = markerBootIds(caseId, text);
      if (!observedBootIds.length || JSON.stringify(observedBootIds) !== JSON.stringify(entry.bootIds)) {
        fail(caseId, `${BOOT_MARKERS[caseId]} boot sequence differs from bootIds`);
      }
      const replay = replayCaseChecker(text, entry.mode, caseId, true);
      if (!replay.ok) { fail(caseId, replay.detail); result.logSemantics = 'FAIL'; }
      const artifacts = decodeArtifacts(root, capture, caseId);
      if (artifacts.problems.length) { for (const problem of artifacts.problems) fail(caseId, problem); result.artifacts = 'INCOMPLETE'; }
      if (result.cases[caseId]?.status !== 'FAIL') {
        result.cases[caseId] = { status: 'PASS', identity: identityOf(entry), checker: CHECKER,
          checkerSha256: sha256(fs.readFileSync(path.join(repository, CHECKER))), replay: replay.stdout, decodes: artifacts.decodes };
      }
    } catch (error) { fail(caseId, error.message); }
  }
  // Shared Splash/StatusBar capture: identical physical identity by contract.
  if (entries['M4-A03-splash'] && entries['M4-A03-status-bar']
    && identityOf(entries['M4-A03-splash']) !== identityOf(entries['M4-A03-status-bar'])) {
    fail('M4-A03-status-bar', 'shared Splash/StatusBar capture identity differs from the splash capture');
  }
  if (entries['M4-A03-splash'] && entries['M4-A03-status-bar']
    && (entries['M4-A03-splash'].capture?.path !== entries['M4-A03-status-bar'].capture?.path
      || entries['M4-A03-splash'].capture?.sha256 !== entries['M4-A03-status-bar'].capture?.sha256)) {
    fail('M4-A03-status-bar', 'Splash/StatusBar shared capture reference must have the same path and sha256');
  }
  for (let index = 0; index < M4_OTHER_PHYSICAL_CASES.length; index += 1) {
    const caseId = M4_OTHER_PHYSICAL_CASES[index];
    for (const previousId of M4_OTHER_PHYSICAL_CASES.slice(0, index)) {
      if (entries[caseId].bundle === entries[previousId].bundle || entries[caseId].pid === entries[previousId].pid) {
        fail(caseId, `independent physical applications require a distinct bundle and PID from ${previousId}`);
      }
    }
  }
  // Package-sync derives from five physical captures; its own capture must
  // reference the member identities instead of merely existing.
  const syncProblems = [];
  const syncEntry = entries[M4_OTHER_DERIVED_CASE];
  const syncBytes = (() => { try { return readReference(root, syncEntry.capture, 'package-sync capture'); } catch (error) { syncProblems.push(error.message); return null; } })();
  let memberReferences = null;
  if (syncBytes) {
    try { memberReferences = JSON.parse(syncBytes.toString('utf8')).members ?? null; }
    catch { syncProblems.push('package-sync capture is not JSON'); }
  }
  if (!memberReferences || typeof memberReferences !== 'object') {
    syncProblems.push('package-sync capture does not reference member identities');
  } else {
    for (const caseId of M4_OTHER_CASES) {
      const member = memberReferences[caseId];
      if (!member || identityOf({ ...member, captureCwd: member.captureCwd ?? syncEntry.captureCwd }) !== identityOf(entries[caseId])) {
        syncProblems.push(`package-sync member ${caseId} identity mismatch`);
      }
    }
  }
  for (const caseId of M4_OTHER_CASES) {
    if (result.cases[caseId]?.status !== 'PASS') syncProblems.push(`physical case ${caseId} did not pass`);
  }
  const existingSyncFailures = result.cases[M4_OTHER_DERIVED_CASE]?.failures ?? [];
  if (existingSyncFailures.length || syncProblems.length) {
    result.cases[M4_OTHER_DERIVED_CASE] = {
      status: 'FAIL', failures: [...new Set([...existingSyncFailures, ...syncProblems])],
    };
  } else {
    result.cases[M4_OTHER_DERIVED_CASE] = { status: 'PASS', derived: 'five business cases with matching member references' };
  }
  if (syncProblems.length) result.status = 'FAIL';
  if (result.status === 'PASS') {
    // Full Other acceptance still requires a visual oracle; a complete log
    // replay never closes the scope by itself.
    result.status = 'BLOCKED';
    result.blockers.push('视觉证据 Oracle 未接合：完整输入仅证明身份、命令、日志语义与原件可解码，不证明像素级渲染语义');
  }
  return result;
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({ options: { manifest: { type: 'string' }, output: { type: 'string' }, help: { type: 'boolean' } } });
  if (values.help) console.log('c-verify-m4-captures.mjs --manifest <multi-app run json> [--output <new directory>]');
  else {
    try {
      const result = validateMultiAppM4Captures(path.resolve(values.manifest));
      console.log(JSON.stringify(result, null, 2));
      if (values.output) {
        const output = path.resolve(values.output);
        fs.mkdirSync(output);
        writeJSON(path.join(output, 'multi-app-verification.json'), result);
      }
      if (result.status !== 'PASS') process.exitCode = 1;
    } catch (error) { console.error(error.message); process.exitCode = 1; }
  }
}
