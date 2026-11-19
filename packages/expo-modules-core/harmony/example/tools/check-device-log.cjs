const fs = require('node:fs');
const log = fs.readFileSync(process.argv[2], 'utf8');
const groups = Object.entries(require('./core-test-cases.cjs')).map(([marker, names]) => [marker + '=', names]);
let passed = true;
for (const [marker, names] of groups) {
  const matches = log.split('\n').filter((line) => line.includes(marker));
  if (!matches.length) { console.error(`Missing ${marker}`); passed = false; continue; }
  for (const line of matches) {
    const json = line.slice(line.indexOf(marker) + marker.length);
    let results;
    try { results = JSON.parse(json); } catch { console.error(`Invalid/truncated ${marker}`); passed = false; continue; }
    if (!Array.isArray(results) || results.some(r => !r || typeof r.name !== 'string' ||
        typeof r.passed !== 'boolean' || typeof r.detail !== 'string')) {
      console.error(`Invalid result rows ${marker}`); passed = false; continue;
    }
    const ok = results.filter((r) => r.passed === true).length;
    console.log(`${marker}${ok}/${results.length}`);
    if (results.length !== names.length || ok !== names.length ||
        new Set(results.map(r => r.name)).size !== names.length ||
        results.some(r => !names.includes(r.name))) {
      console.error(`Failed or mismatched case identities ${marker}`);
      passed = false;
      for (const r of results.filter((r) => r.passed !== true)) console.error(`${r.name}: ${r.detail}`);
    }
  }
}
if (/EXPO_CORE_STALE_(CALLBACK|REJECTION)|EXPO_CORE_PUBLIC_RELOAD_ERROR=|\b[Ff]atal signal\b/.test(log)) passed = false;
if (process.argv.includes('--reload')) {
  const segments = log.split('EXPO_CORE_BOOT=').slice(1);
  const boots = segments.map(segment => {
    try { return JSON.parse(segment.split('\n')[0]); }
    catch { return { id: null }; }
  });
  const completeBoots = segments.every((segment, index) =>
    Number.isSafeInteger(boots[index].id) && typeof boots[index].dev === 'boolean' &&
    groups.every(([marker]) => segment.includes(marker)) &&
    [...segment.matchAll(/EXPO_CORE_PUBLIC_RELOAD_REQUEST=([^\n]*)/g)]
      .every(match => Number(match[1].trim()) === boots[index].id));
  const requestOffset = log.lastIndexOf('EXPO_CORE_PUBLIC_RELOAD_REQUEST=');
  const bootOffset = log.lastIndexOf('EXPO_CORE_BOOT=');
  const newRuntimeLog = log.slice(bootOffset);
  const requests = [...log.matchAll(/EXPO_CORE_PUBLIC_RELOAD_REQUEST=([^\n]*)/g)];
  const completeTransitions = requests.length === boots.length - 1 &&
    segments.slice(0, -1).every(segment => segment.split('EXPO_CORE_PUBLIC_RELOAD_REQUEST=').length === 2) &&
    requests.every((request, index) => {
      const transition = log.slice(request.index, requests[index + 1]?.index);
      return Number(request[1].trim()) === boots[index].id &&
        [...transition.matchAll(/EXPO_CORE_VIEW_PENDING_RELOAD=([^\n]*)/g)].some(match => Number(match[1].trim()) === boots[index].id) &&
        transition.includes('EXPO_CORE_INTEROP_NATIVE_LATE_REJECTION destroyed=true') &&
        transition.includes('EXPO_CORE_VIEW_DELAYED_READ_FINISHED invalid=1 delay=1000');
    });
  if (requestOffset < 0 || requestOffset > bootOffset ||
      !completeBoots || !completeTransitions || boots.length < 2 ||
      new Set(boots.map(b => b.id)).size !== boots.length ||
      new Set(boots.map(b => b.dev)).size !== 1 ||
      !log.slice(requestOffset).includes('EXPO_CORE_INTEROP_NATIVE_LATE_REJECTION destroyed=true') ||
      !log.slice(requestOffset).includes('EXPO_CORE_VIEW_PENDING_RELOAD=') ||
      !log.slice(requestOffset).includes('EXPO_CORE_VIEW_DELAYED_READ_FINISHED invalid=1 delay=1000') ||
      groups.some(([marker]) => !newRuntimeLog.includes(marker)) ||
      groups.some(([marker]) => log.split('\n').filter(line => line.includes(marker)).length < 2)) {
    console.error('Incomplete public reload/new-runtime/late-native-completion evidence');
    passed = false;
  }
}
process.exitCode = passed ? 0 : 1;
