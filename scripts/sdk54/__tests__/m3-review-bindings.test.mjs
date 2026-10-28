import assert from 'node:assert/strict';
import test from 'node:test';
import { validateInstall, validateMetro } from '../m3-review-bindings.mjs';

test('install evidence identifies the exact HAP', () => {
  const log = '[Info]App install path:/tmp/a.hap msg:install bundle successfully.\nAppMod finish\n';
  assert.equal(validateInstall(log, '/tmp/a.hap'), true);
  assert.equal(validateInstall(log, '/tmp/b.hap'), false);
  assert.equal(validateInstall('install bundle successfully', '/tmp/a.hap'), false);
});

test('Metro evidence identifies the consumer project and Harmony bundle', () => {
  const log = 'Starting project at /private/tmp/project\nharmony Bundled 740ms index.ts (726 modules)\n';
  assert.equal(validateMetro(log, '/private/tmp/project'), true);
  assert.equal(validateMetro(log, '/private/tmp/other'), false);
  assert.equal(validateMetro(log.replace('harmony Bundled', 'ios Bundled'), '/private/tmp/project'), false);
});
