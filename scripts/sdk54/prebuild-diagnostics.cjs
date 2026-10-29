// Benchmark-only preload. Never loaded by the published CLI.
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const output = process.env.SDK54_PREBUILD_DIAGNOSTICS;
if (output) {
  const report = { pid: process.pid, phases: {}, io: {}, peakMemory: {}, scope: 'This Node process only. Instrumented Promise APIs and read streams; synchronous and child-process IO excluded. Bytes are logical, not physical. Async operation durations are summed and may overlap; phase times overlap.' };
  const sample = () => {
    for (const [key, value] of Object.entries(process.memoryUsage())) report.peakMemory[key] = Math.max(report.peakMemory[key] || 0, value);
  };
  const timer = setInterval(sample, 100); timer.unref(); sample();
  const count = (key, bytes = 0, ms = 0) => {
    const row = report.io[key] ??= { calls: 0, bytes: 0, milliseconds: 0 };
    row.calls++; row.bytes += bytes; row.milliseconds += ms;
  };
  for (const name of ['readFile', 'writeFile', 'copyFile', 'lstat', 'readdir', 'chmod', 'utimes']) {
    const original = fs.promises[name];
    fs.promises[name] = async function (...args) {
      const started = performance.now();
      const result = await original.apply(this, args);
      const bytes = name === 'readFile' ? Buffer.byteLength(result) : name === 'writeFile' ? Buffer.byteLength(args[1]) : name === 'copyFile' ? fs.statSync(args[1]).size : 0;
      count(name, bytes, performance.now() - started); sample(); return result;
    };
  }
  const stream = fs.createReadStream;
  fs.createReadStream = function (...args) {
    const result = stream.apply(this, args), started = performance.now();
    // Observe completed stream bytes without adding a data listener or changing flow mode.
    result.once('close', () => count('streamRead', result.bytesRead, performance.now() - started));
    return result;
  };
  const load = Module._load;
  const wrapped = new WeakSet();
  Module._load = function (...args) {
    const exports = load.apply(this, args);
    if (exports && typeof exports === 'object' && !wrapped.has(exports)) {
      for (const name of ['mergeHarmonyGenerationStateAsync', 'runHarmonyGenerationTransactionAsync']) {
        if (typeof exports[name] !== 'function') continue;
        const original = exports[name];
        exports[name] = async function (...args) {
          const started = performance.now();
          try { return await original.apply(this, args); }
          finally { (report.phases[name] ??= []).push((performance.now() - started) / 1000); }
        };
      }
      wrapped.add(exports);
    }
    return exports;
  };
  process.once('exit', () => {
    clearInterval(timer); sample(); report.resourceUsage = process.resourceUsage();
    fs.writeFileSync(path.join(output, `diagnostics-${process.pid}.json`), JSON.stringify(report, null, 2) + '\n');
  });
}
