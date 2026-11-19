import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export const writeJSON = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
export const isMain = url => process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === url;
export function options(names, usage) {
  const { values } = parseArgs({options:Object.fromEntries([...names.map(name=>[name,{type:'string'}]),['help',{type:'boolean'}]])});
  if (values.help) { console.log(usage); return null; }
  for (const name of names) assert.ok(values[name], `--${name} is required\n${usage}`);
  return values;
}
export function scenario(value) { assert.ok(['resources','navigation'].includes(value),'scenario must be resources or navigation'); return value; }
export function readRef(root, ref) {
  assert.ok(ref && typeof ref.path === 'string' && /^[a-f0-9]{64}$/.test(ref.sha256), 'Invalid evidence reference');
  assert.ok(!path.isAbsolute(ref.path) && !ref.path.split(/[\\/]/).some(part=>part==='..'), 'Unsafe evidence path');
  const file = fs.realpathSync(path.join(root,ref.path));
  assert.ok(file.startsWith(fs.realpathSync(root)+path.sep), 'Evidence escapes root');
  const bytes = fs.readFileSync(file);
  assert.equal(sha256(bytes),ref.sha256,`SHA256 mismatch: ${ref.path}`);
  return bytes;
}
