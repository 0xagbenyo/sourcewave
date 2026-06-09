import { useContext } from 'react';
import { BottomTabBarHeightContext } from '@react-navigation/bottom-tabs';

/**
 * Tab bar inset for padding composers etc. Returns 0 when the screen is not
 * under a bottom tab navigator (e.g. stack-only routes like RavenUIMessages).
 * `useBottomTabBarHeight()` throws in that case; this hook does not.
 */
export function useOptionalBottomTabBarHeight(): number {
  return useContext(BottomTabBarHeightContext) ?? 0;
}
