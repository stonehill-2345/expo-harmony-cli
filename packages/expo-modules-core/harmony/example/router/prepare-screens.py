#!/usr/bin/env python3
"""Build the pinned Screens HAR with its content-wrapper builder registered."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import tarfile

INPUT_SHA = '133a75df8e05117c79c30b492aa0137c076801f2f82367696eeb8101afce11dd'
SOURCE = 'package/src/main/ets/RNOHScreensPackage.ets'
SOURCE_SHA = 'c17b0ec1419d7ef6f713081bdb5f8bc87a0e11f1d3a41321201054ff6619c488'
BEFORE = b'      .set(RNSScreenStackHeaderConfig.NAME, wrapBuilder(componentBuilder))\n      .set(RNSSearchBar.NAME, wrapBuilder(componentBuilder))'
AFTER = b'      .set(RNSScreenStackHeaderConfig.NAME, wrapBuilder(componentBuilder))\n      .set(RNSScreenContentWrapper.NAME, wrapBuilder(componentBuilder))\n      .set(RNSSearchBar.NAME, wrapBuilder(componentBuilder))'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def prepare(source, target):
    original = source.read_bytes()
    if sha(original) != INPUT_SHA:
        raise ValueError('Unsupported Screens HAR: input SHA256 mismatch')
    with tarfile.open(fileobj=io.BytesIO(original), mode='r:gz') as archive:
        data = archive.extractfile(SOURCE).read()
        if sha(data) != SOURCE_SHA:
            raise ValueError('Screens package source SHA256 mismatch')
        if data.count(BEFORE) != 1 or AFTER in data:
            raise ValueError('Screens content-wrapper registration source mismatch')
        patched = data.replace(BEFORE, AFTER)
        output = io.BytesIO()
        with gzip.GzipFile(filename='', mode='wb', fileobj=output, mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode='w|') as result:
                for member in archive:
                    payload = archive.extractfile(member) if member.isfile() else None
                    if member.name == SOURCE:
                        member.size = len(patched)
                        payload = io.BytesIO(patched)
                    result.addfile(member, payload)
    result_bytes = output.getvalue()
    manifest = {
        'profile': 'screens-4.9.0-content-wrapper-v1',
        'inputSHA256': INPUT_SHA,
        'outputSHA256': sha(result_bytes),
        'source': SOURCE,
        'sourceSHA256': SOURCE_SHA,
        'patchedSourceSHA256': sha(patched),
    }
    record = Path(str(target) + '.manifest.json')
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
