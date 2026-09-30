#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "${1:?fixture root required}" && pwd -P)"
MODE="${2:?debug or release required}"
TOOLS="$(cd "$(dirname "$0")" && pwd -P)"
: "${DEVECO_HOME:?set DEVECO_HOME to DevEco Studio Contents}"
export DEVECO_SDK_HOME="${DEVECO_SDK_HOME:-$DEVECO_HOME/sdk}"
export PATH="$DEVECO_HOME/tools/ohpm/bin:$PATH"
if node -e 'process.exit(require(process.argv[1]).main === "expo-router/entry" ? 0 : 1)' "$ROOT/package.json"; then
  node - "$ROOT" <<'NODE'
const fs = require('node:fs');
const root = process.argv[2];
const read = file => JSON.parse(fs.readFileSync(root + file, 'utf8'));
const entry = read('/harmony/entry/oh-package.json5').dependencies;
const overrides = read('/harmony/oh-package.json5').overrides;
if (entry['@react-native-ohos/react-native-worklets'] !== 'file:../../artifacts/worklets-1.0.0-private-symbols-v2.har' ||
    overrides['@react-native-ohos/react-native-worklets'] !== 'file:../artifacts/worklets-1.0.0-private-symbols-v2.har' ||
    entry['@react-native-ohos/react-native-screens'] !== 'file:../../artifacts/screens-4.9.0-content-wrapper-v1.har' ||
    overrides['@react-native-ohos/react-native-screens'] !== 'file:../artifacts/screens-4.9.0-content-wrapper-v1.har') {
  throw new Error('Router host references an older navigation artifact; prepare a fresh fixture');
}
NODE
  "${EXPO_HARMONY_PYTHON:-python3}" "$TOOLS/../router/prepare-screens.py" \
    --input-har "$ROOT/node_modules/@react-native-ohos/react-native-screens/harmony/screens.har" \
    --output-har "$ROOT/artifacts/screens-4.9.0-content-wrapper-v1.har"
  "${EXPO_HARMONY_PYTHON:-python3}" "$TOOLS/../router/prepare-worklets.py" \
    --input-har "$ROOT/node_modules/@react-native-ohos/react-native-worklets/harmony/worklets.har" \
    --output-har "$ROOT/artifacts/worklets-1.0.0-private-symbols-v2.har"
fi
node "$TOOLS/configure-i0.cjs" "$ROOT" "$MODE"
if [ "$MODE" = release ]; then
  NODE_ENV=production node "$TOOLS/../bundle.cjs" "$ROOT" --expo
fi
cd "$ROOT/harmony/entry"
ohpm install
cd "$ROOT/harmony"
"$DEVECO_HOME/tools/hvigor/bin/hvigorw" --mode module -p product=default -p module=entry@default \
  -p buildMode="$MODE" assembleHap --no-daemon --stacktrace
cp entry/build/default/outputs/default/entry-default-unsigned.hap "$ROOT/artifacts/i0-$MODE.hap"
