#!/usr/bin/env python3
"""Verify the exact portable SDK54 input set without installing or extracting it."""
import hashlib
import json
from pathlib import Path
import sys
import tarfile


def digest(stream):
    result = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
        result.update(chunk)
    return result.hexdigest()


def verify(target):
    manifest = json.loads(Path(__file__).with_name('inputs.json').read_text())
    expected = {row['path']: row for row in manifest['files']}
    if len(expected) != len(manifest['files']):
        raise ValueError('Duplicate input identity')
    if target.is_dir():
        actual = set()
        for file in target.rglob('*'):
            if file.is_symlink():
                raise ValueError(f'Symlink input: {file}')
            if file.is_file():
                name = file.relative_to(target).as_posix()
                actual.add(name)
                row = expected.get(name)
                if not row or file.stat().st_size != row['bytes']:
                    raise ValueError(f'Unexpected input or size: {name}')
                with file.open('rb') as stream:
                    if digest(stream) != row['sha256']:
                        raise ValueError(f'Input SHA256 mismatch: {name}')
    else:
        actual = set()
        with tarfile.open(target, 'r:') as archive:
            for member in archive:
                prefix = manifest['root'] + '/'
                if not member.isfile() or not member.name.startswith(prefix):
                    raise ValueError(f'Unexpected archive member: {member.name}')
                name = member.name[len(prefix):]
                row = expected.get(name)
                if not row or name in actual or member.size != row['bytes']:
                    raise ValueError(f'Unexpected archive input/size/duplicate: {name}')
                actual.add(name)
                with archive.extractfile(member) as stream:
                    if digest(stream) != row['sha256']:
                        raise ValueError(f'Input SHA256 mismatch: {name}')
    if actual != set(expected):
        raise ValueError(f'Missing inputs: {sorted(set(expected) - actual)}')
    print(json.dumps({'valid': True, 'files': len(actual), 'scope': 'input bytes only; not stage acceptance'}))


if __name__ == '__main__':
    try:
        if len(sys.argv) != 2:
            raise ValueError('Usage: verify-inputs.py <sdk54-abc-inputs directory or .tar>')
        verify(Path(sys.argv[1]))
    except (OSError, ValueError, tarfile.TarError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
