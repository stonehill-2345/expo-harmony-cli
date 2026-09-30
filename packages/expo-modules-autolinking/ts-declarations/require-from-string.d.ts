declare module 'require-from-string' {
  function requireFromString(
    code: string,
    filename?: string,
    options?: { appendPaths?: string[]; prependPaths?: string[] }
  ): any;
  export = requireFromString;
}
