import type { ProbeResult } from '../utils/exec';

export type Probe = (file: string, args: string[], opts?: { timeoutMs?: number }) => ProbeResult;

export interface CheckContext {
  projectRoot: string | null;
  probe: Probe;
  existsSync: (p: string) => boolean;
}

export interface CheckResult {
  id: string;
  label: string;
  status: 'ok' | 'warn' | 'fail' | 'skip';
  level: 'required' | 'build';
  detail?: string;
  hint?: string;
}

export type Check = (ctx: CheckContext) => CheckResult;
