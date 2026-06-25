import { CommonActions, createNavigationContainerRef } from '@react-navigation/native';
import type { RootStackParamList } from '../types';

export const rootNavigationRef = createNavigationContainerRef<RootStackParamList>();

/** Reset the root stack to the login flow (works from any nested tab or stack). */
export function resetToAuthScreen(): void {
  if (!rootNavigationRef.isReady()) return;
  rootNavigationRef.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: 'Auth' }],
    })
  );
}

/** Reset the root stack to the signed-in app shell. */
export function resetToMainScreen(): void {
  if (!rootNavigationRef.isReady()) return;
  rootNavigationRef.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{ name: 'Main' }],
    })
  );
}
