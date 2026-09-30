const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const file = process.argv[2];
const mode = process.argv[3];
if (!['debug', 'release'].includes(mode)) throw new Error('Expected debug or release');
const log = fs.readFileSync(file, 'utf8');
const reload = process.argv.includes('--reload');
const core = spawnSync(process.execPath, [path.join(__dirname, 'check-device-log.cjs'), file,
  ...(reload ? ['--reload'] : [])], { encoding: 'utf8' });
process.stdout.write(core.stdout);
process.stderr.write(core.stderr);
let passed = core.status === 0;
const fail = message => { console.error(message); passed = false; };
if (/I0_MODULE_FAIL=|I0_STALE_ASSET_(CALLBACK|REJECTION)=/.test(log)) fail('Module failure or old Runtime callback');
const segments = log.split('EXPO_CORE_BOOT=').slice(1);
const sessions = [];
for (const segment of segments) {
  let boot;
  try { boot = JSON.parse(segment.split('\n')[0]); } catch { fail('Malformed boot'); continue; }
  if (boot.dev !== (mode === 'debug')) fail('JS mode mismatch');
  if (!segment.includes('EXPO_STANDARD_STARTUP_REGISTERED')) fail('Missing standard initialization');
  const records = {};
  for (const marker of ['I0_CONSTANTS_PASS', 'I0_ASSET_PASS']) {
    records[marker] = [];
    for (const line of segment.split('\n').filter(line => line.includes(marker + '='))) {
      try { records[marker].push(JSON.parse(line.slice(line.indexOf(marker + '=') + marker.length + 1))); }
      catch { fail('Malformed ' + marker); }
    }
    if (!records[marker].length) fail('Missing ' + marker);
  }
  const constants = records.I0_CONSTANTS_PASS;
  const assets = records.I0_ASSET_PASS;
  if (constants.length !== assets.length) fail('Incomplete module run');
  constants.forEach((value, index) => {
    if (value.debugMode !== (mode === 'debug') || value.jsDev !== (mode === 'debug')) fail('Native/JS mode mismatch');
    if (!value.sessionId || !value.publicConfig?.scheme || value.fontCount <= 0) fail('Missing real constants');
    if (value.runId !== assets[index]?.runId || value.boot !== assets[index]?.boot) fail('Module run identity mismatch');
    if (!assets[index]?.localUri?.startsWith('file://') || !assets[index]?.embeddedUri?.startsWith('file://')) fail('Missing local asset outputs');
  });
  if (constants[0]) {
    sessions.push(constants[0].sessionId);
    if (constants.some(value => value.sessionId !== constants[0].sessionId)) fail('Session changed within Runtime');
  }
}
if (!segments.length) fail('Missing boot');
if (reload && new Set(sessions).size !== sessions.length) fail('Session reused after Runtime rebuild');
if (mode === 'debug' && !log.includes('http://127.0.0.1:8081/expo-entry.bundle?platform=harmony&dev=true')) fail('Missing real Metro bundle URL');
console.log(`I0_${mode.toUpperCase()}_BOOTS=${segments.length} RESULT=${passed ? 'PASS' : 'FAIL'}`);
process.exitCode = passed ? 0 : 1;
