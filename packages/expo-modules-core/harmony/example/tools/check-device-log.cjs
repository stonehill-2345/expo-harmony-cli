const fs = require('node:fs');
const log = fs.readFileSync(process.argv[2], 'utf8');
const groups = [['EXPO_CORE_EXAMPLE_RESULTS=', 8], ['EXPO_CORE_INTEROP_RESULTS=', 16], ['EXPO_CORE_CONTEXT_RESULTS=', 7], ['EXPO_CORE_UUID_RESULTS=', 9], ['EXPO_CORE_BOUNDARY_RESULTS=', 5], ['EXPO_CORE_VIEW_RESULTS=', 5]];
let passed = true;
for (const [marker, count] of groups) {
  const matches = log.split('\n').filter((line) => line.includes(marker));
  if (!matches.length) { console.error(`Missing ${marker}`); passed = false; continue; }
  for (const line of matches) {
    const json = line.slice(line.indexOf(marker) + marker.length);
    let results;
    try { results = JSON.parse(json); } catch { console.error(`Invalid/truncated ${marker}`); passed = false; continue; }
    const ok = results.filter((r) => r.passed === true).length;
    console.log(`${marker}${ok}/${results.length}`);
    if (results.length !== count || ok !== count) {
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
  if (requestOffset < 0 || requestOffset > bootOffset ||
      !completeBoots || boots.length < 2 ||
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
