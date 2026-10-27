import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Load repository TypeScript with its real package dependencies; only callers'
// explicit side-effect boundaries are replaced.
export function loadM1Source(filename, overrides = {}, cache = new Map()) {
  filename = path.resolve(filename);
  if (cache.has(filename)) return cache.get(filename).exports;
  const localRequire = createRequire(filename);
  const module = { exports: {} };
  cache.set(filename, module);
  const require = id => {
    if (Object.hasOwn(overrides, id)) return overrides[id];
    if (id === 'expo/harmony-config.schema.json') return localRequire(path.resolve('packages/expo/harmony-config.schema.json'));
    if (id.startsWith('.')) {
      const target = path.resolve(path.dirname(filename), id);
      for (const candidate of [target + '.ts', path.join(target, 'index.ts')]) {
        if (fs.existsSync(candidate)) return loadM1Source(candidate, overrides, cache);
      }
    }
    return localRequire(id);
  };
  require.resolve = localRequire.resolve;
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, resolveJsonModule: true },
  }).outputText;
  new Function('require', 'module', 'exports', '__filename', '__dirname', source)(require, module, module.exports, filename, path.dirname(filename));
  return module.exports;
}
