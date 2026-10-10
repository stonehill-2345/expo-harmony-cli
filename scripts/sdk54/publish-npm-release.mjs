import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { verifyRelease } from './verify-npm-release.mjs';

export function assertReleaseAccepted(report, acceptance) {
  if (acceptance.release !== report.release) throw new Error('Acceptance release mismatch');
  for (const name of ['npm-blank', 'npm-default', 'pnpm-blank', 'pnpm-default', 'debug-device', 'clean-release-device', 'cold-start-device']) {
    const check = acceptance.checks?.[name];
    if (check?.status !== 'passed' || typeof check.evidence !== 'string' || !check.evidence.trim()) throw new Error(`Missing acceptance evidence: ${name}`);
  }
  for (const item of report.packages) {
    if (acceptance.artifacts?.[item.name] !== item.integrity) throw new Error(`Acceptance artifact mismatch: ${item.name}`);
  }
}

async function getPublishedIntegrity(name, version) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error(`Cannot verify registry version: ${name}@${version} (${response.status})`);
      return (await response.json()).dist?.integrity ?? null;
    } catch (error) {
      if (attempt === 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}

async function waitForPublishedIntegrity(item) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const actual = await getPublishedIntegrity(item.name, item.version);
    if (actual) return actual;
    await new Promise(resolve => setTimeout(resolve, 5000));
  }
  throw new Error(`Published version did not become visible: ${item.name}@${item.version}`);
}

export async function publishRelease(directory, publish = false, otp = process.env.NPM_OTP) {
  const failures = await verifyRelease(directory);
  if (failures.length) throw new Error(failures.join('\n'));
  const report = JSON.parse(fs.readFileSync(path.join(directory, 'release.json')));
  const acceptance = JSON.parse(fs.readFileSync(path.join(directory, 'acceptance.json')));
  assertReleaseAccepted(report, acceptance);
  for (const item of [...report.packages].sort((a, b) => a.batch.localeCompare(b.batch) || a.name.localeCompare(b.name))) {
    if (publish) {
      const existing = await getPublishedIntegrity(item.name, item.version);
      if (existing) {
        if (existing !== item.integrity) throw new Error(`Version already exists with different content: ${item.name}@${item.version}`);
        console.log(`Already published and verified: ${item.name}@${item.version}`);
        continue;
      }
    }
    const args = ['publish', path.resolve(directory, item.file), '--access', 'public', '--tag', 'harmony', '--registry=https://registry.npmjs.org/'];
    if (publish && otp) args.push(`--otp=${otp}`);
    if (!publish) args.push('--dry-run');
    execFileSync('npm', args, { stdio: 'inherit' });
    if (publish) {
      const actual = await waitForPublishedIntegrity(item);
      if (actual !== item.integrity) throw new Error(`Published integrity mismatch: ${item.name}`);
      console.log(`Published and verified: ${item.name}@${item.version}`);
    }
  }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await publishRelease(
    path.resolve(process.argv[2] ?? 'outputs/sdk54/npm-release'),
    process.argv.includes('--publish'),
    process.env.NPM_OTP,
  );
}
