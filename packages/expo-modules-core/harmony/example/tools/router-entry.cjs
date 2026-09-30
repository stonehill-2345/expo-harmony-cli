const fs = require('node:fs');
const path = require('node:path');
module.exports = function routerEntry(root, dev = false) {
  if (JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).main !== 'expo-router/entry') return null;
  return dev ? 'http://127.0.0.1:8081/node_modules/expo-router/entry.bundle?platform=harmony&dev=true&minify=false'
    : 'node_modules/expo-router/entry.js';
};
