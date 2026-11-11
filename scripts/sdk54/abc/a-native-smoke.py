#!/usr/bin/env python3
"""Prepare a fresh LOCAL Screens compile host. No device/runtime acceptance is claimed."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--screens-har', type=Path, required=True)
p.add_argument('--rnoh-har', type=Path, required=True)
p.add_argument('--project', type=Path, required=True)
a = p.parse_args()
repo = Path(__file__).resolve().parents[3]
root = a.project.resolve()
if root == repo or repo in root.parents or root.exists():
    p.error('project must be new and outside the repository')
for source in [a.screens_har, a.rnoh_har]:
    if not source.is_file(): p.error('missing HAR: ' + str(source))
shutil.copytree(repo / 'packages/expo-modules-core/harmony/example/host/harmony', root / 'harmony')
(root / 'artifacts').mkdir()
for name, source in [('screens.har', a.screens_har), ('rnoh.har', a.rnoh_har)]:
    shutil.copyfile(source, root / 'artifacts' / name)
def write(relative, value):
    (root / relative).write_text(value if isinstance(value, str) else json.dumps(value, indent=2)+'\n')
deps = {'@rnoh/react-native-openharmony': 'rnoh.har', '@react-native-ohos/react-native-screens':'screens.har'}
write('harmony/oh-package.json5', {'modelVersion':'6.0.2','name':'a-screens-compile','version':'0.0.0','dependencies':{},'overrides':{k:'file:../artifacts/'+v for k,v in deps.items()}})
write('harmony/entry/oh-package.json5', {'name':'entry','version':'0.0.0','dependencies':{k:'file:../../artifacts/'+v for k,v in deps.items()}})
write('harmony/entry/src/main/ets/PackageProvider.ets', """import type { RNPackageContext, RNPackage } from '@rnoh/react-native-openharmony';
import RNOHScreensPackage from '@react-native-ohos/react-native-screens';
export function getRNOHPackages(ctx: RNPackageContext): RNPackage[] {
  return [new RNOHScreensPackage(ctx)];
}
""")
write('harmony/entry/src/main/cpp/PackageProvider.cpp', '''#include "RNOH/PackageProvider.h"
#include "ScreensPackage.h"
using namespace rnoh;
std::vector<std::shared_ptr<Package>> PackageProvider::getPackages(Package::Context ctx) {
  return {std::make_shared<ScreensPackage>(ctx)};
}
''')
write('harmony/entry/src/main/cpp/CMakeLists.txt', '''cmake_minimum_required(VERSION 3.16)
project(a_screens_compile LANGUAGES C CXX ASM)
set(CMAKE_CXX_STANDARD 20)
set(RNOH_APP_DIR "${CMAKE_CURRENT_SOURCE_DIR}")
set(RNOH_CPP_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../oh_modules/@rnoh/react-native-openharmony/src/main/cpp")
set(ENABLE_COMPILE_OPTIMIZATIONS OFF CACHE BOOL "Local compile" FORCE)
add_subdirectory("${RNOH_CPP_DIR}" rnoh)
add_subdirectory("${CMAKE_CURRENT_SOURCE_DIR}/../../../oh_modules/@react-native-ohos/react-native-screens/src/main/cpp" screens)
add_library(rnoh_app SHARED PackageProvider.cpp "${RNOH_CPP_DIR}/RNOHAppNapiBridge.cpp")
target_link_libraries(rnoh_app PUBLIC rnoh rnoh_screens)
''')
write('identity.json', {'scope':'LOCAL_COMPILE_ONLY','inputs':{name:hashlib.sha256((root/'artifacts'/name).read_bytes()).hexdigest() for name in ['screens.har','rnoh.har']}})
print(root)
