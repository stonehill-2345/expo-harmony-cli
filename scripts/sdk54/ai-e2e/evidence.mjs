import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import { validateM4DeviceValue } from '../abc/b-run-m4.mjs';

const SHA256 = /^[a-f0-9]{64}$/;
const sha256 = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

// Both existing pack manifest formats are supported; a hash of an empty manifest is not a candidate.
export function verifyCandidateManifest(file) {
  const errors = [];
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    const packages = Array.isArray(value?.packages) ? value.packages
      : Array.isArray(value?.expoPackages) && Array.isArray(value?.externalPackages)
        ? [...value.expoPackages, ...value.externalPackages] : [];
    if (!packages.length || !Array.isArray(value.failures) || value.failures.length
      || (typeof value.packages === 'number' && value.packages !== packages.length)) {
      throw new Error('requires non-empty packages, a matching count and no packaging failures');
    }
    const root = fs.realpathSync(path.dirname(file));
    const names = new Set(), files = new Set();
    for (const entry of packages) {
      if (typeof entry?.name !== 'string' || !entry.name || names.has(entry.name)
        || typeof entry.version !== 'string' || !entry.version
        || typeof entry.file !== 'string' || !entry.file.endsWith('.tgz') || path.isAbsolute(entry.file)
        || entry.file.includes('\\') || entry.file.split('/').includes('..') || files.has(entry.file)
        || !SHA256.test(entry.sha256 ?? '') || !Number.isSafeInteger(entry.bytes) || entry.bytes <= 0) {
        throw new Error('invalid or duplicate package identity');
      }
      names.add(entry.name); files.add(entry.file);
      const archive = fs.realpathSync(path.resolve(root, entry.file));
      if (!inside(root, archive) || !fs.statSync(archive).isFile()) throw new Error(`unsafe archive: ${entry.file}`);
      const bytes = fs.readFileSync(archive);
      if (bytes.length !== entry.bytes || sha256(bytes) !== entry.sha256) throw new Error(`archive mismatch: ${entry.file}`);
    }
  } catch (error) {
    errors.push(`Candidate manifest invalid: ${error.message}`);
  }
  return errors;
}

export function decodeScreenshot(bytes) {
  if (bytes.length === 0) throw new Error('Screenshot is empty');
  try {
    if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      if (bytes.length < 33 || bytes.toString('ascii', 12, 16) !== 'IHDR'
        || bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 32_000_000) throw new Error('invalid PNG dimensions');
      const decoded = PNG.sync.read(bytes, { checkCRC: true });
      if (!decoded.width || !decoded.height || !decoded.data.length) throw new Error('empty PNG pixels');
      return 'PNG';
    }
    if (bytes.length >= 5 && bytes[0] === 255 && bytes[1] === 216
      && bytes.at(-2) === 255 && bytes.at(-1) === 217) {
      const decoded = jpeg.decode(bytes, { tolerantDecoding: false, maxResolutionInMP: 32, maxMemoryUsageInMB: 256 });
      if (!decoded.width || !decoded.height || !decoded.data.length) throw new Error('empty JPEG pixels');
      return 'JPEG';
    }
    throw new Error('expected PNG or JPEG');
  } catch (error) {
    throw new Error(`Screenshot is not a decodable PNG or JPEG: ${error.message}`);
  }
}

export function verifySuccessfulCommand(command, label, readReference, errors) {
  if (!command || typeof command !== 'object' || command.exitCode !== 0 || command.signal !== null
    || command.timedOut !== false || command.interrupted !== false
    || !Array.isArray(command.argv) || !command.argv.length
    || command.argv.some(value => typeof value !== 'string' || !value)) {
    errors.push(`${label} must contain a successful command result`);
  }
  const stdout = readReference(command?.stdout, `${label} stdout`);
  readReference(command?.stderr, `${label} stderr`);
  return stdout?.bytes;
}

// V01-DEVICE-PREFLIGHT proves one selected process and captured logs, not module/UI assertions.
export function verifyDeviceAssertion(bytes, manifest, readReference, errors) {
  try {
    const value = JSON.parse(bytes);
    if (value?.schemaVersion !== 1 || value.kind !== 'device-preflight'
      || !manifest.device || value.target !== manifest.device.target
      || !/^[1-9]\d*$/.test(value.pid ?? '') || !/^[A-Za-z0-9_.-]+$/.test(value.bundleName ?? '')) {
      throw new Error('invalid device-preflight identity');
    }
    const pid = verifySuccessfulCommand(value.pidCommand, 'Device PID command', readReference, errors);
    const log = verifySuccessfulCommand(value.logCommand, 'Device log command', readReference, errors);
    if (JSON.stringify(value.pidCommand?.argv?.slice(1)) !== JSON.stringify(['-t', value.target, 'shell', 'pidof', value.bundleName])
      || pid?.toString('utf8').trim() !== value.pid) throw new Error('PID evidence does not match selected bundle/process');
    if (JSON.stringify(value.logCommand?.argv?.slice(1)) !== JSON.stringify(['-t', value.target, 'shell', 'hilog', '-x', '-P', value.pid])
      || !log?.toString('utf8').trim()) throw new Error('missing PID-scoped device log');
  } catch (error) {
    errors.push(`Device assertion invalid: ${error.message}`);
  }
}

export function verifyM4DeviceAssertion(bytes, manifest, readReference, errors, scope) {
  try {
    validateM4DeviceValue(JSON.parse(bytes), scope, manifest, readReference);
  } catch (error) {
    errors.push(`M4 device assertion invalid: ${error.message}`);
  }
}
