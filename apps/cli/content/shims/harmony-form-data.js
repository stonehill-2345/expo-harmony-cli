// Expo Winter runs as a Metro premodule, before index.harmony.js.
// RNOH 0.77 uses CJS (module.exports), 0.82 uses ESM (export default).
// require() of ESM returns { default: ... }, so unwrap when needed.
const fd = require('@react-native-oh/react-native-harmony/Libraries/Network/FormData');
globalThis.FormData = fd.default || fd;
