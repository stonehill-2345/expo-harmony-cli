import type { NavigationAction, NavigationState } from '@react-navigation/native';
import { DeviceEventEmitter, Platform } from 'react-native';

type PopToAction = NavigationAction & {
  type: 'POP_TO';
  payload: { name?: string };
};

/**
 * Harmony Screens must start a one-screen pop natively so the leaving screen
 * stays mounted until its close transition finishes. The native `dismissed`
 * event performs the matching React Navigation pop after the animation.
 */
export function emitHarmonyNativeDismissTo(
  action: NavigationAction,
  navigationState: NavigationState
): boolean {
  if ((Platform.OS as string) !== 'harmony' || action.type !== 'POP_TO') {
    return false;
  }

  const currentIndex = navigationState.index;
  const previousRoute = navigationState.routes[currentIndex - 1];
  const targetName = (action as PopToAction).payload?.name;

  if (currentIndex < 1 || !targetName || previousRoute?.name !== targetName) {
    return false;
  }

  DeviceEventEmitter.emit('screensJSRouterBack', {
    target: action.target ?? navigationState.key,
    data: { action },
  });
  return true;
}
