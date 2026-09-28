// Real Metro + Expo's message websocket, not an embedded dev bundle workaround.
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const root = fs.realpathSync(process.argv[2]);
const requireApp = createRequire(path.join(root, 'package.json'));
process.chdir(root);
process.env.NODE_ENV = 'development';
const port = Number(process.env.EXPO_HARMONY_METRO_PORT || 8081);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid EXPO_HARMONY_METRO_PORT');
async function start() {
  const { getDefaultConfig } = requireApp('@expo/metro-config');
  const { loadConfig } = requireApp('@expo/metro/metro-config');
  const metro = requireApp('@expo/metro/metro');
  const config = await loadConfig({ cwd: root }, getDefaultConfig(root, { platform: 'harmony' }));
  config.maxWorkers = 2;
  config.server.port = port;
  const requireExpo = createRequire(requireApp.resolve('expo/package.json'));
  const cli = path.dirname(requireExpo.resolve('@expo/cli/package.json'));
  const { createMessagesSocket } = require(path.join(cli, 'build/src/start/server/metro/dev-server/createMessageSocket'));
  const message = createMessagesSocket({ serverBaseUrl: `http://127.0.0.1:${port}`, logger: console });
  message.server.on('connection', () => console.log('I0_MESSAGE_SOCKET_CONNECTED'));
  await metro.runServer(config, { host: '127.0.0.1', websocketEndpoints: { [message.endpoint]: message.server } });
  console.log(`I0_METRO_READY=http://127.0.0.1:${port}`);
}
start().catch(error => { console.error(error); process.exitCode = 1; });
