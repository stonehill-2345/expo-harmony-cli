import React from 'react';
import { requireNativeModule } from 'expo-modules-core';
import App from './App';
import { checkConstants } from './constants-public-checks';
import { checkAssets } from './asset-public-checks';
import config from './app.json';
import build from './expected-build.json';

const boot = Date.now();
let sequence = 0;
const server = 'http://127.0.0.1:18080';
async function runModules() {
  const runId = `${build.runId}-${boot}-${++sequence}`;
  try {
    const constants = await checkConstants(config.expo, build.debugMode);
    console.log('I0_CONSTANTS_PASS=' + JSON.stringify({ boot, runId, ...constants }));
    const assets = await checkAssets(server, runId, require('./fixtures/lane-b.svg'));
    console.log('I0_ASSET_PASS=' + JSON.stringify({ boot, runId, ...assets }));
  } catch (error) {
    console.error('I0_MODULE_FAIL=' + JSON.stringify({ boot, runId, error: String(error) }));
  }
}
async function beginReload() {
  const url = `${server}/slow?run=${build.runId}-${boot}`;
  requireNativeModule('ExpoAsset').downloadAsync(url, null, 'txt').then(
    () => console.error('I0_STALE_ASSET_CALLBACK=' + boot),
    () => console.error('I0_STALE_ASSET_REJECTION=' + boot));
  // Confirm the real request reached the server before destroying this Runtime.
  for (let attempt = 0; attempt < 50; attempt++) {
    const counts = await (await fetch(`${server}/stats`)).json();
    if (counts[url.slice(server.length)] > 0) {
      console.log('I0_PENDING_ASSET=' + JSON.stringify({ boot, url }));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('I0 slow request never reached server');
}
export default function I0App() {
  return <App onTestsComplete={runModules} onBeforeReload={beginReload} />;
}
