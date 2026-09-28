const fs = require('node:fs');
const path = require('node:path');

// Re-emit the changed public Platform declaration from source, not by patching
// an installed declaration. This is a targeted build, not full Core typechecking.
module.exports = function emitPlatformTypes(ts, stage, toolingRoot) {
  const dependencies = path.join(stage, 'node_modules');
  if (fs.existsSync(dependencies)) throw new Error('Declaration staging already has node_modules');
  fs.symlinkSync(path.join(toolingRoot, 'node_modules'), dependencies, 'dir');
  try {
    const program = ts.createProgram([path.join(stage, 'src/Platform.ts')], {
      target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Node10, jsx: ts.JsxEmit.ReactJSX,
      strict: true, skipLibCheck: true, esModuleInterop: true,
      declaration: true, declarationMap: true, emitDeclarationOnly: true,
      rootDir: path.join(stage, 'src'), outDir: path.join(stage, 'build'),
      typeRoots: [path.join(toolingRoot, 'node_modules/@types')],
      types: ['node', 'react'],
    });
    const diagnostics = [...ts.getPreEmitDiagnostics(program), ...program.emit().diagnostics];
    const errors = diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error);
    if (errors.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(errors, {
      getCurrentDirectory: () => stage,
      getCanonicalFileName: f => f,
      getNewLine: () => '\n',
    }));
  } finally {
    fs.unlinkSync(dependencies);
  }
};
