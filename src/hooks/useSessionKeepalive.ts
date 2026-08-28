import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { useUserSession } from '../context/UserContext';
import { getErpNextUrl } from '../constants/env';
import { tryRestoreFrappeRavenSession } from '../services/frappeRavenSession';
import { silentReloginFrappeSession } from '../utils/restoreAppSession';

const KEEPALIVE_MS = 20 * 60 * 1000;

/** Refresh Frappe session when returning to foreground and periodically while signed in. */
export function useSessionKeepalive(): void {
  const { user } = useUserSession();
  const userRef = useRef(user);
  userRef.current = user;

  useEffect(() => {
    if (!user) return;

    const baseUrl = getErpNextUrl();
    let running = false;

    const refresh = async () => {
      if (!userRef.current || running) return;
      running = true;
      try {
        const ok = await tryRestoreFrappeRavenSession(baseUrl);
        if (!ok) {
          await silentReloginFrappeSession();
        }
      } catch (e) {
        console.warn('[useSessionKeepalive] refresh failed', e);
      } finally {
        running = false;
      }
    };

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        void refresh();
      }
    };

    const sub = AppState.addEventListener('change', onAppState);
    const interval = setInterval(() => {
      void refresh();
    }, KEEPALIVE_MS);

    return () => {
      sub.remove();
      clearInterval(interval);
    };
  }, [user?.email]);
}
