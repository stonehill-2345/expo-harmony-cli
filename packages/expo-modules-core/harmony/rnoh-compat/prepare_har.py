#!/usr/bin/env python3
"""Build a pinned SDK dependency artifact; never patch an installed application."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile
import tempfile


def sha256_file(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def prepare(input_har, output_har, profile):
    base = Path(__file__).resolve().parent
    name = f'rnoh-0.82.30-{profile}.json' if profile != 'structured-rejection-v1' else 'rnoh-0.82.30.json'
    lock = json.loads((base / name).read_text())
    patches = lock.get('patches', [lock])
    record_path = Path(str(output_har) + '.manifest.json')
    if output_har.exists() or record_path.exists():
        raise ValueError('Output HAR or manifest already exists; use a new output path')
    input_hash = sha256_file(input_har)
    if input_hash != lock['inputHARSHA256']:
        raise ValueError('Input HAR SHA256 mismatch; only the pinned RNOH 0.82.30 is supported')
    patched_files = {}
    with tarfile.open(input_har, 'r:gz') as archive:
        package = json.load(archive.extractfile('package/oh-package.json5'))
        if package['version'] != lock['version']:
            raise ValueError('RNOH version mismatch')
        with tempfile.TemporaryDirectory(prefix='expo-rnoh-patch-') as directory:
            root = Path(directory)
            for entry in patches:
                patch = base / entry['patch']
                if sha256_file(patch) != entry['patchSHA256']:
                    raise ValueError('Patch SHA256 mismatch')
                source = archive.extractfile(entry['source']).read()
                if hashlib.sha256(source).hexdigest() != entry['sourceSHA256']:
                    raise ValueError('RNOH source SHA256 mismatch')
                target = root / entry['source'].removeprefix('package/')
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(source)
                subprocess.run(['patch', '-p1', '--fuzz=0', '--batch', '-i', str(patch)],
                               cwd=root, check=True, capture_output=True, text=True)
                patched = target.read_bytes()
                if hashlib.sha256(patched).hexdigest() != entry['patchedSourceSHA256']:
                    raise ValueError('Patched source SHA256 mismatch')
                patched_files[entry['source']] = patched

    output_har.parent.mkdir(parents=True, exist_ok=True)
    # Fixed gzip timestamp/name and preserved tar metadata make this reproducible.
    with output_har.open('xb') as output:
        try:
            with gzip.GzipFile(filename='', mode='wb', fileobj=output, mtime=0) as compressed:
                with tarfile.open(input_har, 'r|gz') as original, tarfile.open(fileobj=compressed, mode='w|') as result:
                    for member in original:
                        data = original.extractfile(member) if member.isfile() else None
                        if member.name in patched_files:
                            patched = patched_files[member.name]
                            member.size = len(patched)
                            data = io.BytesIO(patched)
                        result.addfile(member, data)
        except BaseException:
            output_har.unlink(missing_ok=True)
            raise
    record = {**lock, 'inputHAR': str(input_har.resolve()), 'outputHAR': str(output_har.resolve()),
              'inputSHA256': input_hash, 'outputSHA256': sha256_file(output_har)}
    with record_path.open('x') as stream:
        json.dump(record, stream, indent=2)
        stream.write('\n')
    print(json.dumps(record, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-har', required=True, type=Path)
    parser.add_argument('--output-har', required=True, type=Path)
    parser.add_argument('--profile', choices=['structured-rejection-v1', 'core-v1-v3'], default='core-v1-v3')
    args = parser.parse_args()
    prepare(args.input_har, args.output_har, args.profile)
