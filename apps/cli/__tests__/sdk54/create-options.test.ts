import { describe, expect, it } from 'vitest';
import {
  assertCreateSelectionSupported,
  parseCreateArgs,
} from '../../src/sdk54/create-options';

describe('parseCreateArgs', () => {
  it('defaults SDK54 create options to default template and pnpm', () => {
    expect(parseCreateArgs(['myapp'])).toEqual({
      projectName: 'myapp',
      requestedSdk: null,
      template: 'default',
      packageManager: 'pnpm',
      rawArgs: ['myapp'],
    });
  });

  it.each([
    [['myapp', '--template', 'blank-typescript'], 'blank-typescript'],
    [['myapp', '--template=default'], 'default'],
  ] as const)('parses template arguments: %j', (args, template) => {
    expect(parseCreateArgs([...args]).template).toBe(template);
  });

  it.each([
    [['myapp', '--sdk=52'], 'sdk-52'],
    [['--sdk', '54', 'myapp'], 'sdk-54'],
  ] as const)('parses SDK arguments: %j', (args, requestedSdk) => {
    expect(parseCreateArgs([...args]).requestedSdk).toBe(requestedSdk);
  });

  it.each([
    [['myapp', '--npm'], 'npm'],
    [['myapp', '--pnpm'], 'pnpm'],
    [['myapp', '--yarn'], 'yarn'],
    [['myapp', '--bun'], 'bun'],
  ] as const)('parses package manager arguments: %j', (args, packageManager) => {
    expect(parseCreateArgs([...args]).packageManager).toBe(packageManager);
  });

  it.each([
    { args: ['myapp', '--template'], message: /--template.*缺少/ },
    { args: ['myapp', '--template='], message: /--template.*blank-typescript.*default/ },
    { args: ['myapp', '--template', 'tabs'], message: /--template.*blank-typescript.*default/ },
    { args: ['myapp', '--template=default', '--template', 'default'], message: /--template.*一次/ },
    { args: ['myapp', '--npm', '--pnpm'], message: /包管理器.*一次/ },
    { args: ['myapp', 'other'], message: /一个项目名/ },
    { args: ['myapp', '--sdk=55'], message: /--sdk.*52.*54/ },
    { args: ['myapp', '--sdk'], message: /--sdk.*52.*54/ },
  ])('rejects invalid create arguments before creating a directory: $args', ({ args, message }) => {
    expect(() => parseCreateArgs(args)).toThrow(message);
  });
});

describe('assertCreateSelectionSupported', () => {
  it('rejects blank-typescript for SDK52', () => {
    const parsed = parseCreateArgs(['myapp', '--template', 'blank-typescript', '--pnpm']);
    expect(() => assertCreateSelectionSupported(parsed, 'sdk-52')).toThrow(/SDK 52.*default/);
  });

  it.each(['yarn', 'bun'] as const)('rejects %s for SDK54', packageManager => {
    const parsed = parseCreateArgs(['myapp', `--${packageManager}`]);
    expect(() => assertCreateSelectionSupported(parsed, 'sdk-54')).toThrow(/SDK 54.*npm.*pnpm/);
  });

  it.each([
    ['sdk-52', ['myapp', '--npm']],
    ['sdk-54', ['myapp', '--npm']],
    ['sdk-54', ['myapp', '--pnpm', '--template', 'blank-typescript']],
  ] as const)('accepts supported selection %s %j', (sdk, args) => {
    const parsed = parseCreateArgs([...args]);
    expect(() => assertCreateSelectionSupported(parsed, sdk)).not.toThrow();
  });
});
