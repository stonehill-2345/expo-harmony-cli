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
    def test_real_archive_registers_navigation_components_and_is_repeatable(self):
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
                self.assertEqual(
                    set(changed),
                    {
                        screens.SOURCE,
                        screens.SCREEN_SOURCE,
                        screens.BOTTOM_TABS_SCREEN_SOURCE,
                        screens.CPP_PACKAGE_SOURCE,
                    },
                )
                fixed = b.extractfile(screens.SOURCE).read()
                self.assertIn(b'.set(RNSScreenContentWrapper.NAME, wrapBuilder(componentBuilder))', fixed)
                self.assertEqual(fixed.count(b'.set(RNSScreenContentWrapper.NAME'), 1)
                self.assertIn(b'.set(RNSBottomTabs.NAME, wrapBuilder(componentBuilder))', fixed)
                self.assertNotIn(b'.set(RNSBottomTabsScreen.NAME, wrapBuilder(componentBuilder))', fixed)
                self.assertIn(b'} else if (ctx.componentName == RNSBottomTabs.NAME) {', fixed)
                self.assertNotIn(b'} else if (ctx.componentName == RNSBottomTabsScreen.NAME) {', fixed)
                fixed_screen = b.extractfile(screens.SCREEN_SOURCE).read()
                self.assertIn(screens.BACK_AFTER, fixed_screen)
                self.assertNotIn(screens.BACK_BEFORE, fixed_screen)
                fixed_bottom_tabs_screen = b.extractfile(screens.BOTTOM_TABS_SCREEN_SOURCE).read()
                self.assertIn(screens.BOTTOM_TABS_TOUCH_AFTER, fixed_bottom_tabs_screen)
                self.assertNotIn(screens.BOTTOM_TABS_TOUCH_BEFORE, fixed_bottom_tabs_screen)
                fixed_cpp = b.extractfile(screens.CPP_PACKAGE_SOURCE).read()
                self.assertIn(b'RNSBottomTabsJSIBinder.h', fixed_cpp)
                self.assertIn(b'RNSBottomTabsScreenJSIBinder.h', fixed_cpp)
                self.assertIn(b'RNSBottomTabsComponentDescriptor>()', fixed_cpp)
                self.assertIn(b'RNSBottomTabsScreenComponentDescriptor>()', fixed_cpp)
                self.assertIn(b'{"RNSBottomTabs", std::make_shared<RNSBottomTabsJSIBinder>()}', fixed_cpp)
                self.assertIn(
                    b'{"RNSBottomTabsScreen", std::make_shared<RNSBottomTabsScreenJSIBinder>()}',
                    fixed_cpp,
                )
            target.write_bytes(b'conflicting output')
            with self.assertRaisesRegex(ValueError, 'conflict'):
                screens.prepare(original, target)
            unknown = Path(directory) / 'unknown.har'
            unknown.write_bytes(b'unknown version')
            with self.assertRaisesRegex(ValueError, 'input SHA256'):
                screens.prepare(unknown, Path(directory) / 'no.har')


if __name__ == '__main__':
    unittest.main()
