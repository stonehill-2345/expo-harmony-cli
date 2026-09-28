"""Exercise the real pinned HAR, not a fabricated replacement native module."""
import hashlib
from itertools import zip_longest
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest

COMPAT = Path(__file__).resolve().parents[2] / 'rnoh-compat'
TOOL = COMPAT / 'prepare_har.py'
INPUT = Path(os.environ['RNOH_INPUT_HAR'])


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def run(input, output):
    return subprocess.run(['python3', str(TOOL), '--input-har', str(input), '--output-har', str(output), '--profile', 'core-v1-v3'],
                          text=True, capture_output=True)


class HarCompatibilityTest(unittest.TestCase):
    def test_pinned_patch_is_reproducible_and_does_not_modify_other_files(self):
        original = digest(INPUT)
        lock = json.loads((COMPAT / 'rnoh-0.82.30-core-v1-v3.json').read_text())
        patches = {entry['source']: entry for entry in lock['patches']}
        with tempfile.TemporaryDirectory(prefix='core-har-test-') as directory:
            root = Path(directory)
            first, second = root / 'first.har', root / 'second.har'
            for output in [first, second]:
                result = run(INPUT, output)
                self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(digest(first), digest(second))
            self.assertEqual(digest(INPUT), original)
            record = json.loads(Path(str(first) + '.manifest.json').read_text())
            self.assertEqual(record['inputSHA256'], original)
            self.assertEqual(record['outputSHA256'], digest(first))
            with tarfile.open(INPUT, 'r|gz') as before, tarfile.open(first, 'r|gz') as after:
                count = 0
                for a, b in zip_longest(before, after):
                    self.assertIsNotNone(a)
                    self.assertIsNotNone(b)
                    self.assertEqual(a.name, b.name)
                    self.assertEqual(a.type, b.type)
                    if not a.isfile():
                        continue
                    old = before.extractfile(a).read()
                    new = after.extractfile(b).read()
                    if a.name in patches:
                        self.assertEqual(hashlib.sha256(new).hexdigest(), patches[a.name]['patchedSourceSHA256'])
                        self.assertNotEqual(old, new)
                        count += 1
                    else:
                        self.assertEqual(old, new, a.name)
                self.assertEqual(count, len(patches))
            overwrite = run(INPUT, first)
            self.assertNotEqual(overwrite.returncode, 0)
            self.assertIn('already exists', overwrite.stderr)
            self.assertEqual(digest(first), record['outputSHA256'])

    def test_changed_input_fails_closed_without_output(self):
        with tempfile.TemporaryDirectory(prefix='core-har-invalid-') as directory:
            root = Path(directory)
            invalid = root / 'unknown.har'
            invalid.write_bytes(b'not the pinned 0.82.30 HAR')
            output = root / 'output.har'
            result = run(invalid, output)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('Input HAR SHA256 mismatch', result.stderr)
            self.assertFalse(output.exists())
            self.assertFalse(Path(str(output) + '.manifest.json').exists())


if __name__ == '__main__':
    unittest.main()
