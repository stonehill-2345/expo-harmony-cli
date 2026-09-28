#!/usr/bin/env bash
set -euo pipefail
# Node 22 must be on PATH. DEVECO_HOME is the application Contents directory.
ROOT="$(cd "${1:?fixture root required}" && pwd -P)"
MODE="${2:?debug or release required}"
case "$MODE" in debug|release) ;; *) echo 'Expected debug or release' >&2; exit 1;; esac
: "${DEVECO_HOME:?set DEVECO_HOME to DevEco Studio Contents}"
export DEVECO_SDK_HOME="${DEVECO_SDK_HOME:-$DEVECO_HOME/sdk}"
export PATH="$DEVECO_HOME/tools/ohpm/bin:$PATH"
if [ "$MODE" = debug ]; then
  node "$ROOT/node_modules/expo-modules-core/harmony/example/bundle.cjs" "$ROOT" --dev
else
  node "$ROOT/node_modules/expo-modules-core/harmony/example/bundle.cjs" "$ROOT"
fi
cd "$ROOT/harmony/entry"
ohpm install
cd "$ROOT/harmony"
"$DEVECO_HOME/tools/hvigor/bin/hvigorw" --mode module -p product=default -p module=entry@default \
  -p buildMode="$MODE" assembleHap --no-daemon --stacktrace
cp entry/build/default/outputs/default/entry-default-unsigned.hap "$ROOT/artifacts/core-a0-$MODE.hap"
