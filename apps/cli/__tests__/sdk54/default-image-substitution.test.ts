import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { renameAtomic } from '../../src/utils/atomic-rename';
import { loadSdk54PatchManifest } from '../../src/sdk54/patch-manifest';
import {
  applyDefaultImageSubstitution,
  planDefaultImageSubstitution,
} from '../../src/sdk54/default-image-substitution';

vi.mock('../../src/utils/atomic-rename', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/utils/atomic-rename')>();
  return { ...actual, renameAtomic: vi.fn(actual.renameAtomic) };
});

const manifest = loadSdk54PatchManifest(path.resolve(__dirname, '../..'));

describe('default Image substitution', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'sdk54-image-substitution-'));
    vi.mocked(renameAtomic).mockReset();
    vi.mocked(renameAtomic).mockImplementation((source, destination) => fs.renameSync(source, destination));
    writeValidFiles(root);
  });

  afterEach(() => {
    vi.mocked(renameAtomic).mockReset();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('plans both replacements without writing, then changes only the two approved files', () => {
    const protectedFile = path.join(root, 'app/_layout.tsx');
    const beforeProtected = fs.readFileSync(protectedFile, 'utf8');
    const beforeTargets = manifest.defaultImage.files.map(file => fs.readFileSync(path.join(root, file), 'utf8'));

    const plan = planDefaultImageSubstitution(root);
    expect(plan.map(change => path.relative(root, change.path).split(path.sep).join('/'))).toEqual(manifest.defaultImage.files);
    expect(manifest.defaultImage.files.map(file => fs.readFileSync(path.join(root, file), 'utf8'))).toEqual(beforeTargets);

    expect(applyDefaultImageSubstitution(root)).toEqual(manifest.defaultImage.files);
    for (const relativePath of manifest.defaultImage.files) {
      const contents = fs.readFileSync(path.join(root, relativePath), 'utf8');
      expect(contents).toContain(manifest.defaultImage.replacementImport);
      expect(contents).not.toContain("from 'expo-image'");
      expect(contents).toContain("<Image source={{ uri: 'x' }} />");
    }
    expect(fs.readFileSync(protectedFile, 'utf8')).toBe(beforeProtected);
  });

  it.each([
    ['missing file', (dir: string) => fs.rmSync(path.join(dir, manifest.defaultImage.files[0]))],
    ['missing import', (dir: string) => replaceFirstTarget(dir, manifest.defaultImage.sourceImport, "import { Image } from 'react-native';")],
    ['duplicate import', (dir: string) => prependFirstTarget(dir, `${manifest.defaultImage.sourceImport}\n`)],
    ['extra expo-image usage', (dir: string) => prependFirstTarget(dir, "import { ImageBackground } from 'expo-image';\n")],
  ])('rejects %s without modifying either target', (_name, mutate) => {
    mutate(root);
    const before = snapshotTargets(root);
    expect(() => planDefaultImageSubstitution(root)).toThrow(/default-image-substitution/);
    expect(snapshotTargets(root)).toEqual(before);
  });

  it('rolls both files back when the second commit rename fails', () => {
    const before = snapshotTargets(root);
    vi.mocked(renameAtomic).mockImplementation((source, destination) => {
      if (vi.mocked(renameAtomic).mock.calls.length === 4) throw new Error('second commit failed');
      fs.renameSync(source, destination);
    });

    expect(() => applyDefaultImageSubstitution(root)).toThrow(/second commit failed/);
    expect(snapshotTargets(root)).toEqual(before);
  });
});

function writeValidFiles(root: string): void {
  for (const relativePath of manifest.defaultImage.files) {
    const absolute = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, `${manifest.defaultImage.sourceImport}\nexport default () => <Image source={{ uri: 'x' }} />;\n`);
  }
  fs.mkdirSync(path.join(root, 'app'), { recursive: true });
  fs.writeFileSync(path.join(root, 'app/_layout.tsx'), 'export default function Layout() { return null; }\n');
}

function replaceFirstTarget(root: string, from: string, to: string): void {
  const file = path.join(root, manifest.defaultImage.files[0]);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(from, to));
}

function prependFirstTarget(root: string, value: string): void {
  const file = path.join(root, manifest.defaultImage.files[0]);
  fs.writeFileSync(file, value + fs.readFileSync(file, 'utf8'));
}

function snapshotTargets(root: string): Array<string | null> {
  return manifest.defaultImage.files.map(relativePath => {
    const absolute = path.join(root, relativePath);
    return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
  });
}
