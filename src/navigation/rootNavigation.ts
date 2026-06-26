import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '../types';

export const rootNavigationRef = createNavigationContainerRef<RootStackParamList>();

function dispatchRootReset(routeName: keyof RootStackParamList): boolean {
  if (!rootNavigationRef.isReady()) return false;
  rootNavigationRef.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: routeName }],
    })
  );
  return true;
}

function dispatchRootResetWithRetry(routeName: keyof RootStackParamList): void {
  if (dispatchRootReset(routeName)) return;
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    if (dispatchRootReset(routeName) || attempts >= 24) {
      clearInterval(timer);
    }
  }, 50);
}

/** Reset the root stack to the login flow (works from any nested tab or stack). */
export function resetToAuthScreen(): void {
  dispatchRootResetWithRetry('Auth');
}

/** Reset the root stack to the signed-in app shell. */
export function resetToMainScreen(): void {
  dispatchRootResetWithRetry('Main');
}
