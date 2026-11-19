import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOUi5rGwMDAxMDAwMDAAAAMWgESNbkt0AAAAABJRU5ErkJggg==', 'base64');
export const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQgJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDjqKKK+oPnD//Z', 'base64');
export function evidenceFile(root, file, bytes) {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), bytes);
  return { path: file, sha256: sha256(bytes) };
}
export function candidateBytes(root) {
  const archive = Buffer.from('isolated candidate test bytes');
  const ref = evidenceFile(root, 'fixture.tgz', archive);
  return Buffer.from(JSON.stringify({ packages: [{ name: 'fixture', version: '1.0.0', file: ref.path,
    bytes: archive.length, sha256: ref.sha256 }], failures: [] }));
}
export function commandResult(root, id, stdout = 'command completed\n', argv = [process.execPath, '-e', '0']) {
  return { id, argv, cwd: root, exitCode: 0, signal: null, timedOut: false, interrupted: false,
    stdout: evidenceFile(root, `evidence/${id}.stdout.log`, stdout),
    stderr: evidenceFile(root, `evidence/${id}.stderr.log`, '') };
}
export function deviceAssertion(root, target = 'device-1') {
  const bundleName = 'dev.example.test', pid = '4321';
  return { schemaVersion: 1, kind: 'device-preflight', target, bundleName, pid,
    pidCommand: commandResult(root, 'pid', pid + '\n', ['hdc', '-t', target, 'shell', 'pidof', bundleName]),
    logCommand: commandResult(root, 'hilog', 'device log\n', ['hdc', '-t', target, 'shell', 'hilog', '-x', '-P', pid]) };
}
