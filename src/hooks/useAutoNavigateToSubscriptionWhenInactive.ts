import { useEffect } from 'react';
import { useIsFocused } from '@react-navigation/native';

type NavigationLike = { navigate: (name: string) => void };

type Options = {
  email?: string | null;
  isLoading: boolean;
  isActive: boolean;
  /** When false, skip redirect (e.g. supplier portal users). */
  enabled?: boolean;
};

/** Sends subscribed-gated buyers to the Subscription screen instead of showing a gate or alert. */
export function useAutoNavigateToSubscriptionWhenInactive(
  navigation: NavigationLike,
  { email, isLoading, isActive, enabled = true }: Options
): void {
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!enabled) return;
    if (!isFocused) return;
    if (!email?.trim()) return;
    if (isLoading) return;
    if (isActive) return;
    navigation.navigate('Subscription');
  }, [enabled, isFocused, email, isLoading, isActive, navigation]);
}
