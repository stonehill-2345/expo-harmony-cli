import contextlib
import importlib.util
import io
import os
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('worklets', Path(__file__).resolve().parents[1] / 'router/prepare-worklets.py')
worklets = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worklets)


class WorkletsArtifactTest(unittest.TestCase):
    def test_real_archive_changes_only_private_classes_and_is_repeatable(self):
        original = Path(os.environ['EXPO_HARMONY_WORKLETS_HAR'])
        before = original.read_bytes()
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            target = Path(directory) / 'worklets.har'
            worklets.prepare(original, target)
            first = target.read_bytes()
            worklets.prepare(original, target)
            self.assertEqual(first, target.read_bytes())
            self.assertEqual(before, original.read_bytes())
            with tarfile.open(original) as a, tarfile.open(target) as b:
                self.assertEqual(a.getnames(), b.getnames())
                changed = []
                for member in a:
                    if member.isfile() and a.extractfile(member).read() != b.extractfile(member.name).read():
                        changed.append(member.name)
                self.assertEqual(set(changed), set(worklets.SOURCES))
                fixed = b.extractfile(worklets.SOURCE).read()
                self.assertNotIn(b'ReanimatedTurboModuleFactoryDelegate', fixed)
                self.assertNotIn(b'ReanimatedArkTsMessage', fixed)
                self.assertIn(b'name == "WorkletsModule"', fixed)
                scheduler = b.extractfile('package/src/main/cpp/ReanimatedUIScheduler.cpp').read()
                self.assertIn(b'#include "ReanimatedUIScheduler.h"', scheduler)
                self.assertIn(b'WorkletsUIScheduler::scheduleOnUI', scheduler)
            target.write_bytes(b'conflicting output')
            with self.assertRaisesRegex(ValueError, 'conflict'):
                worklets.prepare(original, target)
            unknown = Path(directory) / 'unknown.har'
            unknown.write_bytes(b'unknown version')
            with self.assertRaisesRegex(ValueError, 'input SHA256'):
                worklets.prepare(unknown, Path(directory) / 'no.har')


if __name__ == '__main__':
    unittest.main()
