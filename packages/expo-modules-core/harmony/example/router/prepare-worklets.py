#!/usr/bin/env python3
"""Build the pinned Worklets HAR with distinct private C++ class names."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile

INPUT_SHA = '9560c0070ccedef07b5eead5fd9db189794922e05299dac411ea77a5ab7fa6b8'
SOURCE = 'package/src/main/cpp/ReanimatedWorkletPackage.cpp'
SOURCE_SHA = '152df19c8ee655c0a9fad02bfde2948031bf26d9868f8b7b66e4f75fd6b0b0e0'
SOURCES = {
    SOURCE: SOURCE_SHA,
    'package/src/main/cpp/ReanimatedUIScheduler.h': 'e653b2d223866f3bbfd5f8c42c26fc546804b730721fca2c557f623d24b53d72',
    'package/src/main/cpp/ReanimatedUIScheduler.cpp': '77119a7331692b205e161e402e5f29d954bcb7fb42eda6aa287877d6d9bc79c0',
    'package/src/main/cpp/WorkletsModule.cpp': '019648c71bd41c7c48a9b72e7d5d5e3128cc1969acee33adfef0a8551432b50f',
}


def sha(data):
    return hashlib.sha256(data).hexdigest()


def prepare(source, target):
    original = source.read_bytes()
    if sha(original) != INPUT_SHA:
        raise ValueError('Unsupported Worklets HAR: input SHA256 mismatch')
    with tarfile.open(fileobj=io.BytesIO(original), mode='r:gz') as archive:
        patched_files = {}
        for name, expected in SOURCES.items():
            data = archive.extractfile(name).read()
            if sha(data) != expected:
                raise ValueError('Worklets package source SHA256 mismatch: ' + name)
            # Internal classes collide with the Reanimated shared library.
            patched = data.replace(b'ReanimatedTurboModuleFactoryDelegate', b'WorkletsTurboModuleFactoryDelegate')
            patched = patched.replace(b'ReanimatedArkTsMessage', b'WorkletsArkTsMessage')
            # Preserve include filenames; only the C++ type/constructor names change.
            patched = re.sub(rb'\bReanimatedUIScheduler\b(?!\.h)', b'WorkletsUIScheduler', patched)
            patched_files[name] = patched
        output = io.BytesIO()
        with gzip.GzipFile(filename='', mode='wb', fileobj=output, mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode='w|') as result:
                for member in archive:
                    payload = archive.extractfile(member) if member.isfile() else None
                    if member.name in patched_files:
                        patched = patched_files[member.name]
                        member.size = len(patched)
                        payload = io.BytesIO(patched)
                    result.addfile(member, payload)
    result_bytes = output.getvalue()
    manifest = {
        'profile': 'worklets-1.0.0-private-symbols-v2',
        'inputSHA256': INPUT_SHA, 'outputSHA256': sha(result_bytes),
        'sources': {name: {'sourceSHA256': SOURCES[name], 'patchedSourceSHA256': sha(data)} for name, data in patched_files.items()},
    }
    record = Path(str(target) + '.manifest.json')
    # Repeated builds reuse identical artifacts; never overwrite conflicting input.
    if target.exists() or record.exists():
        if not target.exists() or not record.exists() or target.read_bytes() != result_bytes or json.loads(record.read_text()) != manifest:
            raise ValueError('Output HAR/manifest conflict; use a fresh output path')
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open('xb') as stream:
            stream.write(result_bytes)
        with record.open('x') as stream:
            stream.write(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-har', type=Path, required=True)
    parser.add_argument('--output-har', type=Path, required=True)
    args = parser.parse_args()
    prepare(args.input_har, args.output_har)
