import { execFileSync, execSync, spawn } from 'child_process';

const WINDOWS_NODE_COMMANDS = new Set(['npx', 'npm', 'pnpm', 'yarn', 'bun', 'expo', 'react-native']);

export interface CommandInvocation {
  command: string;
  shell: boolean;
}

/** Windows 的 Node CLI 在 PATH 中以 .cmd 包装器提供，spawn/execFile 不经 shell 时需显式使用它。*/
export function resolveCommand(file: string, platform: NodeJS.Platform = process.platform): string {
  if (
    platform !== 'win32' ||
    !WINDOWS_NODE_COMMANDS.has(file) ||
    file.endsWith('.cmd') ||
    file.includes('/') ||
    file.includes('\\')
  ) {
    return file;
  }

  return `${file}.cmd`;
}

/** Windows 的 .cmd 不能直接由 spawn/execFile 执行，必须交给 cmd.exe 处理。 */
export function resolveCommandInvocation(file: string, platform: NodeJS.Platform = process.platform): CommandInvocation {
  const command = resolveCommand(file, platform);
  const isKnownWindowsCommand = WINDOWS_NODE_COMMANDS.has(file) ||
    WINDOWS_NODE_COMMANDS.has(file.replace(/\.cmd$/, ''));

  return {
    command,
    shell: platform === 'win32' && isKnownWindowsCommand && !file.includes('/') && !file.includes('\\'),
  };
}

/** @deprecated 使用 runFile，避免 shell 解析用户参数。 */
export function run(cmd: string, opts: { cwd?: string } = {}): void {
  execSync(cmd, { stdio: 'inherit', ...opts });
}

/** 参数化执行命令，避免将用户输入拼接进 shell。*/
export function runFile(file: string, args: string[], opts: { cwd?: string } = {}): void {
  const invocation = resolveCommandInvocation(file);
  execFileSync(invocation.command, args, { stdio: 'inherit', shell: invocation.shell, ...opts });
}

/** 静默执行命令：成功时不透传第三方 CLI 的通用提示，失败时由调用方统一展示诊断。*/
export function runFileQuiet(file: string, args: string[], opts: { cwd?: string } = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const invocation = resolveCommandInvocation(file);
    const child = spawn(invocation.command, args, {
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: invocation.shell,
    });
    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      const error = new Error(`${file} exited with code ${code}`) as Error & { stdout?: string; stderr?: string };
      error.stdout = stdout;
      error.stderr = stderr;
      reject(error);
    });
  });
}

/** execSync 取输出（不 inherit）。*/
export function getOutput(cmd: string, opts: { cwd?: string } = {}): string {
  return execSync(cmd, { encoding: 'utf8', ...opts }).trim();
}
