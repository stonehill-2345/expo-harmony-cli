import assert from 'node:assert/strict';
import test from 'node:test';

import { ExpoSplashScreenController } from '../src/main/ets/ExpoSplashScreenController.ts';

test('content appearance auto-hides an unclaimed splash screen', () => {
  const controller = new ExpoSplashScreenController();
  const runtime = controller.beginRuntime();

  assert.equal(controller.getState().visible, true);
  controller.onContentAppeared(runtime);
  assert.equal(controller.getState().visible, false);
});

test('Router internal prevent holds until internal maybe-hide', async () => {
  const controller = new ExpoSplashScreenController();
  const runtime = controller.beginRuntime();

  await controller.internalPreventAutoHideAsync(runtime);
  controller.onContentAppeared(runtime);
  assert.equal(controller.getState().visible, true);

  await controller.internalMaybeHideAsync(runtime);
  assert.equal(controller.getState().visible, false);
});

test('user prevention wins over Router maybe-hide until an explicit hide', async () => {
  const controller = new ExpoSplashScreenController();
  const runtime = controller.beginRuntime();

  assert.equal(await controller.preventAutoHideAsync(runtime), true);
  await controller.internalMaybeHideAsync(runtime);
  controller.onContentAppeared(runtime);
  assert.equal(controller.getState().visible, true);

  controller.hide(runtime);
  assert.equal(controller.getState().visible, false);
});

test('options use native defaults, notify the view and reject invalid values', () => {
  const controller = new ExpoSplashScreenController();
  const runtime = controller.beginRuntime();
  const states = [];
  const unsubscribe = controller.subscribe((state) => states.push(state));

  controller.setOptions(runtime, { fade: true, duration: 250 });
  assert.deepEqual(controller.getState().options, { fade: true, duration: 250 });
  controller.setOptions(runtime, {});
  assert.deepEqual(controller.getState().options, { fade: false, duration: 400 });
  assert.throws(() => controller.setOptions(runtime, { duration: -1 }), /duration/);
  assert.throws(() => controller.setOptions(runtime, { fade: 'yes' }), /fade/);

  unsubscribe();
  controller.hide(runtime);
  assert.equal(states.length, 2);
});

test('reload creates isolated runtime state and ignores stale callbacks', async () => {
  const controller = new ExpoSplashScreenController();
  const oldRuntime = controller.beginRuntime();
  await controller.preventAutoHideAsync(oldRuntime);
  controller.hide(oldRuntime);

  const newRuntime = controller.beginRuntime();
  assert.notEqual(newRuntime, oldRuntime);
  assert.deepEqual(controller.getState(), {
    runtime: newRuntime,
    visible: true,
    options: { fade: false, duration: 400 },
  });

  controller.onContentAppeared(oldRuntime);
  assert.equal(controller.getState().visible, true);
  controller.onContentAppeared(newRuntime);
  assert.equal(controller.getState().visible, false);
});

test('destroy clears listeners and rejects later runtime work', () => {
  const controller = new ExpoSplashScreenController();
  const runtime = controller.beginRuntime();
  let notifications = 0;
  controller.subscribe(() => notifications++);

  controller.destroy();
  assert.equal(controller.getState().visible, false);
  assert.throws(() => controller.beginRuntime(), /destroyed/);
  assert.throws(() => controller.hide(runtime), /destroyed/);
  assert.equal(notifications, 1);
});
