import { inject } from 'vitest';

export interface PackedCli {
  root: string;
  files: string[];
  archivePath: string;
  archiveName: string;
}

declare module 'vitest' {
  export interface ProvidedContext {
    packedCli: PackedCli;
  }
}

export function readPackedCli(): PackedCli {
  return inject('packedCli');
}
