import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

function physicalPath(target) {
  const missing = [];
  let ancestor = path.resolve(target);
  while (!fs.existsSync(ancestor)) {
    missing.unshift(path.basename(ancestor));
    const parent = path.dirname(ancestor);
    assert.notEqual(parent, ancestor, 'Cannot resolve consumer workspace');
    ancestor = parent;
  }
  return path.join(fs.realpathSync(ancestor), ...missing);
}

export function assertExternalConsumerWorkspace(work, repository) {
  const target = physicalPath(work);
  const root = fs.realpathSync(repository);
  assert.ok(target !== root && !target.startsWith(root + path.sep), 'Consumers must be outside the source repository');
}
