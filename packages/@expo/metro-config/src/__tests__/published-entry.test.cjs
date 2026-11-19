const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('published getDefaultConfig preserves the source platform integration', () => {
  const emitted = ts.transpileModule(read('src/ExpoMetroConfig.ts'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.Node16, esModuleInterop: true },
    fileName: 'ExpoMetroConfig.ts',
  }).outputText;
  const functionText = (text) => {
    const file = ts.createSourceFile('entry.js', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    const declaration = file.statements.find(
      (node) => ts.isFunctionDeclaration(node) && node.name?.text === 'getDefaultConfig'
    );
    assert.ok(declaration, 'getDefaultConfig must be exported by the build entry');
    return ts.createPrinter({ removeComments: true }).printNode(ts.EmitHint.Unspecified, declaration, file);
  };
  assert.equal(functionText(read('build/ExpoMetroConfig.js')), functionText(emitted));
});

test('published options expose the explicit Harmony platform', () => {
  const file = ts.createSourceFile('entry.d.ts', read('build/ExpoMetroConfig.d.ts'), ts.ScriptTarget.Latest, true);
  const options = file.statements.find((node) => ts.isInterfaceDeclaration(node) && node.name.text === 'DefaultConfigOptions');
  const platform = options.members.find((node) => node.name?.getText(file) === 'platform');
  assert.ok(platform?.questionToken, 'platform must be an optional public option');
  assert.equal(platform.type.getText(file), "'harmony'");
});

test('published EXPO_DEBUG retains its boolean contract', () => {
  const file = ts.createSourceFile('entry.d.ts', read('build/ExpoMetroConfig.d.ts'), ts.ScriptTarget.Latest, true);
  const declaration = file.statements.filter(ts.isVariableStatement)
    .flatMap((node) => [...node.declarationList.declarations])
    .find((node) => node.name.getText(file) === 'EXPO_DEBUG');
  assert.equal(declaration?.type?.kind, ts.SyntaxKind.BooleanKeyword);
});
