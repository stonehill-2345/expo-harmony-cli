const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { createRequire } = require('node:module');
const { execFileSync } = require('node:child_process');
const root = fs.realpathSync(process.argv[2]);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'source-manifest.json')));
const hash = (data) => createHash('sha256').update(data).digest('hex');
const result = { packages: {}, coreConsumers: {}, expectedCore: null };
function packageFiles(directory) {
  return fs.readdirSync(directory, { recursive: true }).filter(file =>
    !file.startsWith('node_modules' + path.sep) && path.basename(file) !== '.gitignore' &&
    fs.statSync(path.join(directory, file)).isFile());
}
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'core-install-check-'));
try {
  for (const [name, pkg] of Object.entries(manifest.packages)) {
    const archive = path.join(root, 'artifacts', pkg.archive);
    if (hash(fs.readFileSync(archive)) !== pkg.sha256) throw new Error(`Archive hash mismatch: ${name}`);
    const target = path.join(scratch, name);
    fs.mkdirSync(target, { recursive: true });
    execFileSync('tar', ['-xzf', archive, '-C', target]);
    const source = path.join(target, 'package');
    const mismatches = [];
    let checked = 0;
    // npm omits .gitignore; nested package dependencies aren't files owned by
    // this archive. Every other installed file must also exist in the archive.
    const expectedFiles = new Set(packageFiles(source));
    for (const file of expectedFiles) {
      const full = path.join(source, file);
      const installed = path.join(root, 'node_modules', name, file);
      if (!fs.existsSync(installed) || hash(fs.readFileSync(full)) !== hash(fs.readFileSync(installed))) mismatches.push(file);
      checked++;
    }
    const unexpectedFiles = packageFiles(path.join(root, 'node_modules', name)).filter(file => {
      if (expectedFiles.has(file)) return false;
      // npm may rename an archived .gitignore to .npmignore. Accept only that
      // exact metadata transformation, not arbitrary extra installed files.
      const originalIgnore = path.join(source, path.dirname(file), '.gitignore');
      return !(path.basename(file) === '.npmignore' && fs.existsSync(originalIgnore) &&
        hash(fs.readFileSync(originalIgnore)) === hash(fs.readFileSync(path.join(root, 'node_modules', name, file))));
    });
    result.packages[name] = { checked, mismatches, unexpectedFiles, archiveMatches: true };
  }
  result.expectedCore = createRequire(path.join(root, 'package.json')).resolve('expo-modules-core');
  for (const name of ['expo', 'expo-asset', 'expo-constants', ...(manifest.packages['expo-linking'] ? ['expo-linking'] : []), ...(manifest.packages['expo-router'] ? ['expo-router'] : []), ...(manifest.packages['expo-font'] ? ['expo-font'] : []), ...(manifest.packages['expo-status-bar'] ? ['expo-status-bar'] : [])]) {
    result.coreConsumers[name] = createRequire(path.join(root, 'node_modules', name, 'package.json')).resolve('expo-modules-core');
  }
  console.log(JSON.stringify(result, null, 2));
  if (Object.values(result.packages).some(p => p.mismatches.length || p.unexpectedFiles.length) ||
      Object.values(result.coreConsumers).some(source => source !== result.expectedCore)) process.exitCode = 1;
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
