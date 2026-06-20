import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import { inferPlanIdFromErpPlanName, type SubscriptionPlanId } from '../constants/subscriptions';
import { useUserSession } from './UserContext';
import { getERPNextClient } from '../services/erpnext';
import {
  pickAppRelevantERPSubscription,
  endOfDayIsoFromYmd,
} from '../utils/subscriptionErpnext';

/** Far-future ISO when ERP subscription has no end_date but is Active (app gate). */
const OPEN_ENDED_PLACEHOLDER_ISO = new Date(
  Date.now() + 10 * 365 * 24 * 60 * 60 * 1000
).toISOString();

export interface ActiveSubscription {
  planId: SubscriptionPlanId;
  planTitle: string;
  /** ISO date string */
  expiresAt: string;
  /** Subscription document name when synced from server */
  erpSubscriptionName?: string;
}

export interface SubscriptionRefreshResult {
  isActive: boolean;
  subscription: ActiveSubscription | null;
}

interface SubscriptionContextValue {
  subscription: ActiveSubscription | null;
  isActive: boolean;
  expiresAtDate: Date | null;
  /** True while the first / current refresh is running (avoid showing paywall before ERP check). */
  isLoading: boolean;
  refresh: () => Promise<SubscriptionRefreshResult>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | undefined>(undefined);

function parseExpires(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

function computeIsActive(sub: ActiveSubscription | null): boolean {
  if (!sub?.expiresAt) return false;
  const d = parseExpires(sub.expiresAt);
  if (!d) return false;
  return d.getTime() > Date.now();
}

function activeSubscriptionFromErpRow(erp: any, openEndedIso: string): ActiveSubscription {
  const expiresAt = erp.end_date
    ? endOfDayIsoFromYmd(String(erp.end_date))
    : openEndedIso;

  const firstPlan = Array.isArray(erp.plans) ? erp.plans[0] : null;
  const planLink =
    typeof firstPlan?.plan === 'string'
      ? firstPlan.plan.trim()
      : typeof firstPlan?.plan_name === 'string'
        ? String(firstPlan.plan_name).trim()
        : '';

  const planId = inferPlanIdFromErpPlanName(planLink || null);
  const planTitle = planLink || `Active plan (${erp.name})`;

  return {
    planId,
    planTitle,
    expiresAt,
    erpSubscriptionName: erp.name,
  };
}

export const SubscriptionProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user } = useUserSession();
  const [subscription, setSubscription] = useState<ActiveSubscription | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Suppliers never pay for the app — the premium gate only applies to buyers.
  const isSupplierUser = user?.appMode === 'supplier' || !!user?.supplierId?.trim();

  const refresh = useCallback(async (): Promise<SubscriptionRefreshResult> => {
    setIsLoading(true);

    if (isSupplierUser) {
      setSubscription(null);
      setIsLoading(false);
      return { isActive: true, subscription: null };
    }

    if (!user?.email) {
      setSubscription(null);
      setIsLoading(false);
      return { isActive: false, subscription: null };
    }

    let merged: ActiveSubscription | null = null;

    try {
      const client = getERPNextClient();
      const customer = await client.getCustomerByEmail(user.email);
      if (customer?.name) {
        const rows = await client.listSubscriptionsForCustomer(customer.name);
        const erp = pickAppRelevantERPSubscription(rows);
        if (erp) {
          merged = activeSubscriptionFromErpRow(erp, OPEN_ENDED_PLACEHOLDER_ISO);
        }
      }
    } catch (e) {
      console.warn('SubscriptionContext: subscription fetch failed', e);
      merged = null;
    }

    setSubscription(merged);
    setIsLoading(false);
    const active = computeIsActive(merged);
    return { isActive: active, subscription: merged };
  }, [user?.email, isSupplierUser]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const expiresAtDate = useMemo(() => {
    if (!subscription?.expiresAt) return null;
    return parseExpires(subscription.expiresAt);
  }, [subscription?.expiresAt]);

  const isActive = useMemo(
    () => isSupplierUser || computeIsActive(subscription),
    [isSupplierUser, subscription]
  );

  const value = useMemo(
    () => ({
      subscription,
      isActive,
      expiresAtDate,
      isLoading,
      refresh,
    }),
    [subscription, isActive, expiresAtDate, isLoading, refresh]
  );

  return (
    <SubscriptionContext.Provider value={value}>{children}</SubscriptionContext.Provider>
  );
};

export const useSubscription = (): SubscriptionContextValue => {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) {
    throw new Error('useSubscription must be used within SubscriptionProvider');
  }
  return ctx;
};
