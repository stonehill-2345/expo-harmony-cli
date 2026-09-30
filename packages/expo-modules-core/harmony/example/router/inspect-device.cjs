// A-owned manual acceptance driver: real UI actions and immutable observations.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const [hdc, device, output, action = 'capture', value] = process.argv.slice(2);
if (!hdc || !device || !output) throw new Error('Usage: HDC DEVICE NEW_OUTPUT [capture|click|back|cold|warm] [text|uri]');
assert.ok(['capture', 'click', 'back', 'cold', 'warm'].includes(action));
assert.ok(!fs.existsSync(output), 'Use a new evidence directory');
fs.mkdirSync(output, { recursive: true });
const app = 'dev.expo.harmony.router';
const command = (...args) => execFileSync(hdc, ['-t', device, ...args], { encoding: 'utf8', timeout: 20000, maxBuffer: 16 * 1024 * 1024 });
const quote = s => "'" + s.replaceAll("'", "'\\''") + "'";
const shell = (...args) => command('shell', args.map(quote).join(' '));
function layout(name) {
  const remote = '/data/local/tmp/expo-router-acceptance-layout.json';
  shell('uitest', 'dumpLayout', '-p', remote);
  const file = path.join(output, name + '.json');
  command('file', 'recv', remote, file);
  return JSON.parse(fs.readFileSync(file));
}
function texts(root) {
  const rows = [];
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.attributes?.text && node.attributes.visible === 'true') rows.push(node.attributes);
    for (const child of Object.values(node)) walk(child);
  }
  walk(root);
  return rows;
}
async function main() {
  let response;
  if (action === 'click') {
    const labels = texts(layout('before')).filter(a => a.text === value);
    const buttons = labels.filter(a => a.type === 'Button');
    const matches = buttons.length ? buttons : labels;
    assert.equal(matches.length, 1, `Expected one visible ${value}: ${JSON.stringify(matches)}`);
    const [x1, y1, x2, y2] = matches[0].bounds.match(/-?\d+/g).map(Number);
    response = shell('uitest', 'uiInput', 'click', String(Math.round((x1 + x2) / 2)), String(Math.round((y1 + y2) / 2)));
  } else if (action === 'back') {
    response = shell('uitest', 'uiInput', 'keyEvent', 'Back');
  } else if (action === 'cold' || action === 'warm') {
    if (action === 'cold') shell('aa', 'force-stop', app);
    response = shell('aa', 'start', '-b', app, '-a', 'EntryAbility', ...(value ? ['-U', value] : []));
    assert.match(response, /start ability successfully/);
  }
  fs.writeFileSync(path.join(output, 'action.json'), JSON.stringify({ action, value, response }, null, 2));
  await new Promise(resolve => setTimeout(resolve, action === 'cold' ? 4000 : 1500));
  const pid = shell('pidof', app).trim();
  assert.match(pid, /^\d+$/, 'Router process is not alive');
  const log = shell('hilog', '-x', '-P', pid);
  fs.writeFileSync(path.join(output, 'device.log'), log);
  const observed = texts(layout('after'));
  const probes = log.split('\n').filter(line => line.includes('A_ROUTER_PROBE='))
    .map(line => JSON.parse(line.slice(line.indexOf('A_ROUTER_PROBE=') + 'A_ROUTER_PROBE='.length)));
  const params = log.split('\n').filter(line => line.includes('LANE_B_ROUTER_PARAMS'));
  const result = { pid, probes: probes.slice(-2), params: params.slice(-2), visible: observed.map(a => ({ text: a.text, bounds: a.bounds })) };
  fs.writeFileSync(path.join(output, 'observed.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  const screenshot = '/data/local/tmp/expo-router-acceptance.jpeg';
  shell('snapshot_display', '-f', screenshot);
  command('file', 'recv', screenshot, path.join(output, 'screen.jpeg'));
}
main().catch(error => {
  fs.writeFileSync(path.join(output, 'failure.txt'), String(error.stack || error));
  console.error(error); process.exitCode = 1;
});
