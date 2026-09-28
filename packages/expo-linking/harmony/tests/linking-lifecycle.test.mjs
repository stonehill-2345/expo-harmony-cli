import assert from 'node:assert/strict';
import test from 'node:test';
import { ExpoLinkingLifecycle } from '../src/main/ets/ExpoLinkingLifecycle.ts';

test('real lifecycle input is nullable until received, then preserves the URI bytes', () => {
  const lifecycle = new ExpoLinkingLifecycle();
  assert.equal(lifecycle.getLinkingURL(), null);
  lifecycle.onCreate({});
  assert.equal(lifecycle.getLinkingURL(), null);
  lifecycle.onNewWant({ uri: 'test://details/42?query=%E8%B5%84%E6%BA%90%20space' });
  assert.equal(lifecycle.getLinkingURL(), 'test://details/42?query=%E8%B5%84%E6%BA%90%20space');
  lifecycle.onNewWant({ uri: '' });
  assert.equal(lifecycle.getLinkingURL(), 'test://details/42?query=%E8%B5%84%E6%BA%90%20space');
});

test('only real nonempty Want updates emit; subscription removal is idempotent', () => {
  const lifecycle = new ExpoLinkingLifecycle();
  lifecycle.onCreate({ uri: 'test://cold' });
  const received = [];
  const unsubscribe = lifecycle.subscribe((url) => received.push(url));
  assert.deepEqual(received, []);
  lifecycle.onNewWant({});
  lifecycle.onNewWant({ uri: 'test://warm' });
  lifecycle.onNewWant({ uri: 'test://warm' });
  assert.deepEqual(received, ['test://warm', 'test://warm']);
  unsubscribe();
  unsubscribe();
  lifecycle.onNewWant({ uri: 'test://removed' });
  assert.equal(received.length, 2);
  assert.equal(lifecycle.getLinkingURL(), 'test://removed');
});

test('runtime resubscription preserves latest URI without replaying events', () => {
  const lifecycle = new ExpoLinkingLifecycle();
  lifecycle.onCreate({ uri: 'test://cold' });
  const oldEvents = [];
  const stop = lifecycle.subscribe((url) => oldEvents.push(url));
  lifecycle.onNewWant({ uri: 'test://before-reload' });
  stop();
  const newEvents = [];
  const stopNew = lifecycle.subscribe((url) => newEvents.push(url));
  assert.equal(lifecycle.getLinkingURL(), 'test://before-reload');
  assert.deepEqual(newEvents, []);
  lifecycle.onNewWant({ uri: 'test://after-reload' });
  assert.deepEqual(oldEvents, ['test://before-reload']);
  assert.deepEqual(newEvents, ['test://after-reload']);
  stopNew();
});

test('Ability instances are isolated and destruction releases listeners and URI', () => {
  const first = new ExpoLinkingLifecycle();
  const second = new ExpoLinkingLifecycle();
  const events = [];
  first.subscribe((url) => events.push(url));
  first.onCreate({ uri: 'test://first' });
  assert.equal(second.getLinkingURL(), null);
  first.onDestroy();
  assert.equal(first.getLinkingURL(), null);
  assert.throws(() => first.onNewWant({ uri: 'test://late' }), /destroyed/);
  assert.throws(() => first.subscribe(() => {}), /destroyed/);
  assert.deepEqual(events, ['test://first']);
});
