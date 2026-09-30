import contextlib
import importlib.util
import io
import os
from pathlib import Path
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('screens', Path(__file__).resolve().parents[1] / 'router/prepare-screens.py')
screens = importlib.util.module_from_spec(spec)
spec.loader.exec_module(screens)


class ScreensArtifactTest(unittest.TestCase):
    def test_real_archive_registers_only_content_wrapper_and_is_repeatable(self):
        original = Path(os.environ['EXPO_HARMONY_SCREENS_HAR'])
        before = original.read_bytes()
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            target = Path(directory) / 'screens.har'
            screens.prepare(original, target)
            first = target.read_bytes()
            screens.prepare(original, target)
            self.assertEqual(first, target.read_bytes())
            self.assertEqual(before, original.read_bytes())
            with tarfile.open(original) as a, tarfile.open(target) as b:
                self.assertEqual(a.getnames(), b.getnames())
                changed = []
                for member in a:
                    if member.isfile() and a.extractfile(member).read() != b.extractfile(member.name).read():
                        changed.append(member.name)
                self.assertEqual(changed, [screens.SOURCE])
                fixed = b.extractfile(screens.SOURCE).read()
                self.assertIn(b'.set(RNSScreenContentWrapper.NAME, wrapBuilder(componentBuilder))', fixed)
                self.assertEqual(fixed.count(b'.set(RNSScreenContentWrapper.NAME'), 1)
            target.write_bytes(b'conflicting output')
            with self.assertRaisesRegex(ValueError, 'conflict'):
                screens.prepare(original, target)
            unknown = Path(directory) / 'unknown.har'
            unknown.write_bytes(b'unknown version')
            with self.assertRaisesRegex(ValueError, 'input SHA256'):
                screens.prepare(unknown, Path(directory) / 'no.har')


if __name__ == '__main__':
    unittest.main()
