const assert = require('node:assert/strict');
const test = require('node:test');
const { getRoutes } = require('../../build/getRoutes');
const { getTypedRoutesDeclarationFile } = require('../../build/typed-routes/generate');

// Route enumeration unit input, not a native module or a device acceptance fixture.
function context(keys) {
  const files = Object.fromEntries(keys.map((key) => [key, { default: () => null }]));
  const ctx = (key) => files[key];
  ctx.keys = () => Object.keys(files);
  return ctx;
}

function routes(keys, options = {}) {
  return getRoutes(context(keys), {
    platform: 'harmony', skipGenerated: true, ignoreEntryPoints: true,
    importMode: 'async', ...options,
  });
}

const variants = ['index.tsx', 'index.native.tsx', 'index.harmony.tsx', 'index.android.tsx', 'index.ios.tsx', 'index.web.tsx'];

test('Harmony override wins without creating an index.harmony URL', () => {
  const tree = routes(variants.map((file) => `./${file}`));
  assert.deepEqual(tree.children.map(({ route, contextKey }) => ({ route, contextKey })), [
    { route: 'index', contextKey: './index.harmony.tsx' },
  ]);
});

test('Harmony keeps native then universal fallback precedence', () => {
  assert.equal(routes(['./index.tsx', './index.native.tsx']).children[0].contextKey, './index.native.tsx');
  assert.equal(routes(['./index.tsx']).children[0].contextKey, './index.tsx');
});

for (const platform of ['android', 'ios', 'web']) {
  test(`${platform} ignores Harmony routes and keeps its own override`, () => {
    const tree = routes(variants.map((file) => `./${file}`), { platform });
    assert.equal(tree.children.length, 1);
    assert.equal(tree.children[0].contextKey, `./index.${platform}.tsx`);
  });
}

for (const options of [{ platform: undefined }, { platformRoutes: false }]) {
  test(`platform-neutral enumeration ignores Harmony files: ${JSON.stringify(options)}`, () => {
    const tree = routes(variants.map((file) => `./${file}`), options);
    assert.equal(tree.children.length, 1);
    assert.equal(tree.children[0].contextKey, './index.tsx');
  });
}

test('Harmony layouts and dynamic routes retain their logical names', () => {
  const tree = routes([
    './_layout.tsx', './_layout.native.tsx', './_layout.harmony.tsx',
    './(account)/[id].tsx', './(account)/[id].harmony.tsx',
  ]);
  assert.equal(tree.contextKey, './_layout.harmony.tsx');
  assert.equal(tree.children.length, 1);
  assert.equal(tree.children[0].route, '(account)/[id]');
  assert.deepEqual(tree.children[0].dynamic, [{ name: 'id', deep: false }]);
});

test('Harmony platform routes still require a universal sibling', () => {
  assert.throws(() => routes(['./index.harmony.tsx']), /fallback sibling file/);
});

test('API routes reject Harmony platform suffixes like other native platforms', () => {
  assert.throws(() => routes(['./hello+api.harmony.ts'], { preserveApiRoutes: true }),
    /API routes cannot have platform extensions/);
});

test('typed routes never expose platform suffixes as public hrefs', () => {
  const declaration = getTypedRoutesDeclarationFile(context([
    './index.tsx', './index.harmony.tsx', './[id].tsx', './[id].harmony.tsx',
  ]));
  assert.ok(declaration.includes('href:'));
  assert.ok(declaration.includes('id: string'));
  assert.ok(!declaration.includes('.harmony'), declaration);
});
