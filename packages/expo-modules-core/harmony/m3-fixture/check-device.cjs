const REQUIRED = ['sync.value', 'sync.error', 'numeric.nonfinite', 'async.resolve', 'async.reject', 'event.unsubscribe', 'shared.release', 'shared.ref', 'view.props-event-ref', 'view.unmount', 'view.remount-stale-ref'];
function checkLog(log) {
  const errors = [];
  if (![...log.matchAll(/M3_NATIVE_BUILD=m3-review-20261028-v2\b/g)].length ||
      [...log.matchAll(/M3_JS_BUILD=m3-review-20261028-v2\b/g)].length !== 2) {
    errors.push('Missing native or JS build identity');
  }
  const boots = [...log.matchAll(/M3_BOOT=(\d+)/g)];
  const pending = [...log.matchAll(/M3_RELOAD_PENDING=(\d+)/g)];
  const observed = [...log.matchAll(/M3_RELOAD_OBSERVED=(\d+)/g)];
  const quiet = [...log.matchAll(/M3_QUIET_WINDOW=(\d+)/g)];
  const turnover = boots.length === 2 && pending.length === 1 && observed.length === 1 && quiet.length === 1 &&
    boots[0][1] !== boots[1][1] && pending[0][1] === boots[0][1] &&
    observed[0][1] === boots[1][1] && quiet[0][1] === boots[1][1] &&
    boots[0].index < pending[0].index && pending[0].index < boots[1].index &&
    boots[1].index < observed[0].index && observed[0].index < quiet[0].index;
  if (!turnover) errors.push('Missing real runtime turnover or invalid reload order');
  const inReloadWindow = pattern => turnover && [...log.matchAll(pattern)].some(match =>
    pending[0].index < match.index && match.index < quiet[0].index);
  if (!inReloadWindow(/M3_NATIVE_DELAY_FINISHED cancelled=1\b/g)) errors.push('Missing cancelled native completion in reload window');
  if (!inReloadWindow(/M3_NATIVE_VIEW_DELAY_FINISHED invalid=1 delay=1000\b/g)) errors.push('Missing revoked native view completion in reload window');
  const held = [...log.matchAll(/M3_RESOURCE_HELD=(\d+)/g)];
  const fresh = [...log.matchAll(/M3_RESOURCE_NEW=(\d+)/g)];
  if (held.length !== 1 || fresh.length !== 1 || held[0][1] === fresh[0][1] || !turnover) {
    errors.push('Missing distinct runtime resources');
  } else {
    const oldId = held[0][1], newId = fresh[0][1];
    const creates = [...log.matchAll(/M3_RESOURCE_CREATE id=(\d+)\b/g)];
    const destroys = [...log.matchAll(/M3_RESOURCE_DESTROY id=(\d+)\b/g)];
    const oldCreate = creates.filter(m => m[1] === oldId), newCreate = creates.filter(m => m[1] === newId);
    const oldDestroy = destroys.filter(m => m[1] === oldId), newDestroy = destroys.filter(m => m[1] === newId);
    if (oldCreate.length !== 1 || newCreate.length !== 1 || oldDestroy.length !== 1 || newDestroy.length !== 1 ||
        !(boots[0].index < oldCreate[0].index && oldCreate[0].index < held[0].index && held[0].index < pending[0].index &&
          pending[0].index < oldDestroy[0].index && oldDestroy[0].index < quiet[0].index &&
          boots[1].index < newCreate[0].index && newCreate[0].index < fresh[0].index && fresh[0].index < newDestroy[0].index && newDestroy[0].index < observed[0].index)) {
      errors.push('Missing or out-of-order runtime resource lifecycle');
    }
  }
  if (/M3_STALE_|M3_FAILURE=/.test(log)) errors.push('Stale runtime callback or probe failure');
  const batches = [...log.matchAll(/M3_RESULTS=([^\r\n]*)/g)];
  // Each runtime must execute its own assertions before its reload marker.
  if (batches.length !== 2) errors.push('Expected one assertion batch per runtime');
  if (turnover) {
    for (let index = 0; index < boots.length; index++) {
      const end = index === 0 ? boots[1].index : log.length;
      const runtimeBatches = batches.filter(batch => boots[index].index < batch.index && batch.index < end);
      const marker = index === 0 ? pending[0] : observed[0];
      if (runtimeBatches.length !== 1 || runtimeBatches[0].index > marker.index) {
        errors.push('Missing unique assertions before reload marker for runtime ' + boots[index][1]);
      }
    }
  }
  for (const batch of batches) {
    try {
      const rows = JSON.parse(batch[1]);
      if (!Array.isArray(rows) || rows.length !== REQUIRED.length || rows.some(row => !row || typeof row !== 'object')) {
        errors.push('Malformed assertion rows');
        continue;
      }
      for (const name of REQUIRED) if (rows.filter(row => row.name === name && row.passed === true).length !== 1) errors.push('Missing/duplicate/failed: ' + name);
      if (rows.some(row => row.passed !== true)) errors.push('Failed assertion');
    } catch { errors.push('Malformed assertions'); }
  }
  return { passed: errors.length === 0, errors, deviceStatus: errors.length ? 'FAIL' : 'PASS' };
}
module.exports = { REQUIRED, checkLog };
if (require.main === module) {
  const result = checkLog(require('node:fs').readFileSync(process.argv[2], 'utf8'));
  console.log(JSON.stringify(result, null, 2)); process.exitCode = result.passed ? 0 : 1;
}
