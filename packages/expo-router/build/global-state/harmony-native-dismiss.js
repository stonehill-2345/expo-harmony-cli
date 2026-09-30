"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitHarmonyNativeDismissTo = emitHarmonyNativeDismissTo;
const react_native_1 = require("react-native");
/**
 * Harmony Screens must start a one-screen pop natively so the leaving screen
 * stays mounted until its close transition finishes. The native `dismissed`
 * event performs the matching React Navigation pop after the animation.
 */
function emitHarmonyNativeDismissTo(action, navigationState) {
    if (react_native_1.Platform.OS !== 'harmony' || action.type !== 'POP_TO') {
        return false;
    }
    const currentIndex = navigationState.index;
    const previousRoute = navigationState.routes[currentIndex - 1];
    const targetName = action.payload?.name;
    if (currentIndex < 1 || !targetName || previousRoute?.name !== targetName) {
        return false;
    }
    react_native_1.DeviceEventEmitter.emit('screensJSRouterBack', {
        target: action.target ?? navigationState.key,
        data: { action },
    });
    return true;
}
//# sourceMappingURL=harmony-native-dismiss.js.map