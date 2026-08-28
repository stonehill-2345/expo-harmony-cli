import * as fs from 'fs';

const RETRYABLE = new Set(['EPERM', 'EACCES', 'EBUSY']);

export function renameAtomic(from: string, to: string): void {
  const maxAttempts = process.platform === 'win32' ? 3 : 1;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      lastErr = err;
      const code = (err as NodeJS.ErrnoException).code;
      if (process.platform !== 'win32' || !code || !RETRYABLE.has(code)) throw err;
    }
  }
  throw lastErr;
}
