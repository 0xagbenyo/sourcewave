/**
 * Subscription catalog (GHS, Paystack). Plan names must match your billing configuration.
 */
export type SubscriptionPlanId = 'sw-3m' | 'sw-6m' | 'sw-9m';

/** Plan codes returned by the billing integration (must match server plan names). */
export const ERP_SUBSCRIPTION_PLAN_NAMES: Record<SubscriptionPlanId, string> = {
  'sw-3m': '3 months access',
  'sw-6m': '6 months access',
  'sw-9m': '9 months access',
};

const ERP_PLAN_ENV_OVERRIDE: Record<SubscriptionPlanId, string | undefined> = {
  'sw-3m': process.env.EXPO_PUBLIC_ERPNEXT_SUB_PLAN_SW_3M,
  'sw-6m': process.env.EXPO_PUBLIC_ERPNEXT_SUB_PLAN_SW_6M,
  'sw-9m': process.env.EXPO_PUBLIC_ERPNEXT_SUB_PLAN_SW_9M,
};

/** Plan document name sent when creating a subscription. */
export function getErpSubscriptionPlanName(planId: SubscriptionPlanId): string {
  const override = ERP_PLAN_ENV_OVERRIDE[planId];
  if (typeof override === 'string' && override.trim().length > 0) {
    return override.trim();
  }
  return ERP_SUBSCRIPTION_PLAN_NAMES[planId];
}

/**
 * Map billing plan document name (from `plans[].plan`) to app plan id.
 * Unknown names default to `sw-6m` for typing / gating only; UI should use plan title from the server when possible.
 */
export function inferPlanIdFromErpPlanName(erpPlanName: string | undefined | null): SubscriptionPlanId {
  const n = (erpPlanName || '').trim();
  if (!n) return 'sw-6m';
  const ids: SubscriptionPlanId[] = ['sw-3m', 'sw-6m', 'sw-9m'];
  for (const id of ids) {
    if (getErpSubscriptionPlanName(id) === n) return id;
  }
  return 'sw-6m';
}

/** Company name on the subscription document (must exist on the server). */
export function getErpSubscriptionCompany(): string {
  const c = process.env.EXPO_PUBLIC_ERPNEXT_SUBSCRIPTION_COMPANY;
  return typeof c === 'string' && c.trim().length > 0 ? c.trim() : 'SourceWave';
}

export interface SubscriptionPlan {
  id: SubscriptionPlanId;
  title: string;
  durationLabel: string;
  months: number;
  /** Price in Ghana Cedis */
  priceGhs: number;
  description: string;
}

export const SOURCEWAVE_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'sw-3m',
    title: 'Quarterly',
    durationLabel: '3 months',
    months: 3,
    priceGhs: 3699,
    description: 'Directory access and in-app messaging for one quarter.',
  },
  {
    id: 'sw-6m',
    title: 'Half-year',
    durationLabel: '6 months',
    months: 6,
    priceGhs: 5499,
    description: 'Best value for active sourcing teams.',
  },
  {
    id: 'sw-9m',
    title: 'Extended',
    durationLabel: '9 months',
    months: 9,
    priceGhs: 7999,
    description: 'Longer access for steady ordering and repeat purchases.',
  },
];

export const getPlanById = (id: SubscriptionPlanId): SubscriptionPlan | undefined =>
  SOURCEWAVE_SUBSCRIPTION_PLANS.find((p) => p.id === id);
