/**
 * Wipe all on-device data tied to the signed-out account (chat, subscription, session marks).
 * Call after push unregister (still needs Frappe session) and before clearing credentials.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { appStorage } from '../services/appStorage';
import { clearRavenMessagingLocalCache } from './ravenMessagingLocalCache';
import { clearSubscriptionLocalSnapshot } from './subscriptionLocalCache';
import { clearSharedSalesOrderMarksLocally } from './salesOrderShareMarks';

const USER_DATA_KEY_PREFIXES = [
  '@raven_inbox_snap_v1_',
  '@raven_chan_msgs_v1_',
  '@raven_ws_chans_v1_',
  '@sourcewave_sub_snap_v1_',
  '@raven_last_chat_v1_',
] as const;

/** Session-scoped keys (not email-prefixed) cleared on every logout. */
const SESSION_GLOBAL_KEYS = ['@sourcewave/shared_sales_orders_v1'] as const;

function normalizeUserKey(email: string | undefined | null): string {
  return (email || '').trim().toLowerCase().replace(/[^a-z0-9@._+-]/gi, '_') || 'anon';
}

function isUserScopedKey(key: string, userKey: string): boolean {
  for (const prefix of USER_DATA_KEY_PREFIXES) {
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    if (rest === userKey || rest.startsWith(`${userKey}_`)) return true;
  }
  return false;
}

/** Remove disk + in-memory snapshots for one account. */
export async function clearUserLocalDataOnLogout(userEmail: string | undefined | null): Promise<void> {
  const userKey = normalizeUserKey(userEmail);

  await Promise.all([
    clearRavenMessagingLocalCache(userEmail),
    clearSubscriptionLocalSnapshot(userEmail),
    clearSharedSalesOrderMarksLocally(),
  ]);

  try {
    const [asyncKeys, appKeys] = await Promise.all([
      AsyncStorage.getAllKeys(),
      appStorage.getAllKeys(),
    ]);
    const allKeys = [...new Set([...asyncKeys, ...appKeys])];
    const toRemove = allKeys.filter(
      (k) => SESSION_GLOBAL_KEYS.includes(k as (typeof SESSION_GLOBAL_KEYS)[number]) || isUserScopedKey(k, userKey)
    );
    await Promise.all([
      ...toRemove.map((k) => AsyncStorage.removeItem(k).catch(() => {})),
      ...toRemove.map((k) => appStorage.removeItem(k)),
    ]);
  } catch {
    /* ignore */
  }
}
