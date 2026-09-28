import type { NavigationAction, NavigationState } from '@react-navigation/native';
/**
 * Harmony Screens must start a one-screen pop natively so the leaving screen
 * stays mounted until its close transition finishes. The native `dismissed`
 * event performs the matching React Navigation pop after the animation.
 */
export declare function emitHarmonyNativeDismissTo(action: NavigationAction, navigationState: NavigationState): boolean;
//# sourceMappingURL=harmony-native-dismiss.d.ts.map