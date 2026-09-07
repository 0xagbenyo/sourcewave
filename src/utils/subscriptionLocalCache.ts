/**
 * Offline snapshot of the buyer subscription (plan + expiry range from last successful ERP fetch).
 * Cleared on logout.
 */
import { appStorage } from '../services/appStorage';
import type { SubscriptionPlanId } from '../constants/subscriptions';

const KEY_PREFIX = '@sourcewave_sub_snap_v1_';

export type CachedActiveSubscription = {
  planId: SubscriptionPlanId;
  planTitle: string;
  expiresAt: string;
  erpSubscriptionName?: string;
};

export type SubscriptionLocalSnapshot = {
  v: 1;
  savedAt: number;
  subscription: CachedActiveSubscription;
  /** ERP Subscription.start_date (YYYY-MM-DD) when available */
  startDateYmd?: string | null;
  /** ERP Subscription.end_date (YYYY-MM-DD) when available */
  endDateYmd?: string | null;
  erpStatus?: string | null;
};

function storageKey(userEmail: string | undefined | null): string {
  const norm = (userEmail || '').trim().toLowerCase().replace(/[^a-z0-9@._+-]/gi, '_') || 'anon';
  return `${KEY_PREFIX}${norm}`;
}

export async function getSubscriptionLocalSnapshot(
  userEmail: string | undefined | null
): Promise<SubscriptionLocalSnapshot | null> {
  try {
    const raw = await appStorage.getItem(storageKey(userEmail));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SubscriptionLocalSnapshot;
    if (parsed?.v !== 1 || !parsed.subscription?.expiresAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function setSubscriptionLocalSnapshot(
  userEmail: string | undefined | null,
  snapshot: Omit<SubscriptionLocalSnapshot, 'v' | 'savedAt'>
): Promise<void> {
  if (!(userEmail || '').trim()) return;
  try {
    await appStorage.setItem(
      storageKey(userEmail),
      JSON.stringify({
        v: 1,
        savedAt: Date.now(),
        ...snapshot,
      } satisfies SubscriptionLocalSnapshot)
    );
  } catch {
    /* ignore */
  }
}

export async function clearSubscriptionLocalSnapshot(
  userEmail: string | undefined | null
): Promise<void> {
  try {
    await appStorage.removeItem(storageKey(userEmail));
  } catch {
    /* ignore */
  }
}
