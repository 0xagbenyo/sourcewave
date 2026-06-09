import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useUserSession } from './UserContext';
import { getUnreadCountForChannels } from '../services/ravenNativeApi';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
  }),
});

type RavenUnreadContextValue = {
  unreadByChannelId: Record<string, number>;
  unreadTotal: number;
  /** Sum of unreads in channels other than `channelId` (for “other channels” badges). */
  unreadOutsideChannel: (channelId: string | null | undefined) => number;
  activeChannelId: string | null;
  setActiveChannelId: (id: string | null) => void;
  refreshUnreadCounts: () => Promise<void>;
};

const RavenUnreadContext = createContext<RavenUnreadContextValue | undefined>(undefined);

const GLOBAL_NOTIFY_COOLDOWN_MS = 18_000;

function sumUnread(map: Record<string, number>): number {
  return Object.values(map).reduce((a, b) => a + (Number(b) || 0), 0);
}

export function RavenUnreadProvider({ children }: { children: ReactNode }) {
  const { user } = useUserSession();
  const [unreadByChannelId, setUnreadByChannelId] = useState<Record<string, number>>({});
  const [activeChannelId, setActiveChannelIdState] = useState<string | null>(null);
  const activeChannelIdRef = useRef<string | null>(null);
  const prevUnreadRef = useRef<Record<string, number> | null>(null);
  const initDoneRef = useRef(false);
  const lastGlobalNotifyAtRef = useRef(0);
  const notifSetupRef = useRef(false);

  const setActiveChannelId = useCallback((id: string | null) => {
    activeChannelIdRef.current = id;
    setActiveChannelIdState(id);
  }, []);

  const setupNotifications = useCallback(async () => {
    if (notifSetupRef.current) return;
    notifSetupRef.current = true;
    try {
      await Notifications.requestPermissionsAsync();
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('raven-chat', {
          name: 'Team chat',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  const refreshUnreadCounts = useCallback(async () => {
    if (!user?.email) {
      setUnreadByChannelId({});
      prevUnreadRef.current = null;
      initDoneRef.current = false;
      if (Platform.OS === 'ios') {
        try {
          await Notifications.setBadgeCountAsync(0);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    try {
      const rows = await getUnreadCountForChannels();
      const next: Record<string, number> = {};
      for (const r of rows) {
        const id = String(r.name ?? '').trim();
        if (!id) continue;
        const c = Number(r.unread_count) || 0;
        if (c > 0) next[id] = c;
      }

      const total = sumUnread(next);

      if (Platform.OS === 'ios') {
        try {
          await Notifications.setBadgeCountAsync(total);
        } catch {
          /* ignore */
        }
      }

      if (!initDoneRef.current) {
        initDoneRef.current = true;
        prevUnreadRef.current = { ...next };
        setUnreadByChannelId(next);
        return;
      }

      const prev = prevUnreadRef.current || {};
      const active = activeChannelIdRef.current;
      let gainedElsewhere = false;
      for (const [id, newC] of Object.entries(next)) {
        const oldC = prev[id] ?? 0;
        if (newC > oldC && id !== active && newC > 0) {
          gainedElsewhere = true;
          break;
        }
      }

      const now = Date.now();
      if (gainedElsewhere && now - lastGlobalNotifyAtRef.current > GLOBAL_NOTIFY_COOLDOWN_MS) {
        lastGlobalNotifyAtRef.current = now;
        void setupNotifications().then(async () => {
          try {
            await Notifications.scheduleNotificationAsync({
              content: {
                title: 'New message',
                body: 'You have new unread messages.',
                data: { source: 'raven-unread' },
              },
              /** `null` = immediate; on Android `{ channelId }` ties the fire to the notification channel. */
              trigger: Platform.OS === 'android' ? { channelId: 'raven-chat' } : null,
            });
          } catch {
            /* ignore */
          }
        });
      }

      prevUnreadRef.current = { ...next };
      setUnreadByChannelId(next);
    } catch {
      /* ignore */
    }
  }, [user?.email, setupNotifications]);

  const unreadOutsideChannel = useCallback((channelId: string | null | undefined) => {
    const cur = channelId?.trim() || null;
    let s = 0;
    for (const [id, n] of Object.entries(unreadByChannelId)) {
      if (!cur || id !== cur) s += Number(n) || 0;
    }
    return s;
  }, [unreadByChannelId]);

  const unreadTotal = useMemo(() => sumUnread(unreadByChannelId), [unreadByChannelId]);

  const value = useMemo<RavenUnreadContextValue>(
    () => ({
      unreadByChannelId,
      unreadTotal,
      unreadOutsideChannel,
      activeChannelId,
      setActiveChannelId,
      refreshUnreadCounts,
    }),
    [
      unreadByChannelId,
      unreadTotal,
      unreadOutsideChannel,
      activeChannelId,
      setActiveChannelId,
      refreshUnreadCounts,
    ]
  );

  useEffect(() => {
    if (!user?.email) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshUnreadCounts();
    });
    return () => sub.remove();
  }, [user?.email, refreshUnreadCounts]);

  /** First load + login: supplier portal never mounts retail Header (which refetches on focus). */
  useEffect(() => {
    if (!user?.email) return;
    void refreshUnreadCounts();
  }, [user?.email, refreshUnreadCounts]);

  useEffect(() => {
    if (!user?.email) return;
    const id = setInterval(() => {
      void refreshUnreadCounts();
    }, 45_000);
    return () => clearInterval(id);
  }, [user?.email, refreshUnreadCounts]);

  return <RavenUnreadContext.Provider value={value}>{children}</RavenUnreadContext.Provider>;
}

export function useRavenUnread(): RavenUnreadContextValue {
  const ctx = useContext(RavenUnreadContext);
  if (!ctx) {
    throw new Error('useRavenUnread must be used within RavenUnreadProvider');
  }
  return ctx;
}
