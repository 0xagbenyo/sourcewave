/**
 * Subscription catalog (GHS, Paystack). Plan names must match your billing configuration.
 */
export type SubscriptionPlanId = 'sw-test-1ghc' | 'sw-2m' | 'sw-4m' | 'sw-6m';

/** Show GH₵1 dummy plan in dev or when EXPO_PUBLIC_ENABLE_TEST_SUBSCRIPTION=true */
export const SHOW_TEST_SUBSCRIPTION_PLAN =
  typeof __DEV__ !== 'undefined' && __DEV__
    ? true
    : process.env.EXPO_PUBLIC_ENABLE_TEST_SUBSCRIPTION === 'true';

/** Plan codes returned by the billing integration (must match server plan names). */
export const ERP_SUBSCRIPTION_PLAN_NAMES: Record<SubscriptionPlanId, string> = {
  'sw-test-1ghc': '3 months access',
  'sw-2m': '2 months access',
  'sw-4m': '4 months access',
  'sw-6m': '6 months access',
};

const ERP_PLAN_ENV_OVERRIDE: Record<SubscriptionPlanId, string | undefined> = {
  'sw-test-1ghc': process.env.EXPO_PUBLIC_ERPNEXT_SUB_PLAN_SW_TEST,
  'sw-2m':
    process.env.EXPO_PUBLIC_ERPNEXT_SUB_PLAN_SW_2M ??
    process.env.EXPO_PUBLIC_ERPNEXT_SUB_PLAN_SW_3M,
  'sw-4m': process.env.EXPO_PUBLIC_ERPNEXT_SUB_PLAN_SW_4M,
  'sw-6m': process.env.EXPO_PUBLIC_ERPNEXT_SUB_PLAN_SW_6M,
};

/** Plan document name sent when creating a subscription. */
export function getErpSubscriptionPlanName(planId: SubscriptionPlanId): string {
  const override = ERP_PLAN_ENV_OVERRIDE[planId];
  if (typeof override === 'string' && override.trim().length > 0) {
    return override.trim();
  }
  return ERP_SUBSCRIPTION_PLAN_NAMES[planId];
}

/** Baseline monthly rate (2-month plan) used for savings badges. */
export const SUBSCRIPTION_BASELINE_MONTHLY_GHS = 250;

/**
 * Map billing plan document name (from `plans[].plan`) to app plan id.
 * Unknown names default to `sw-6m` for typing / gating only; UI should use plan title from the server when possible.
 */
export function inferPlanIdFromErpPlanName(erpPlanName: string | undefined | null): SubscriptionPlanId {
  const n = (erpPlanName || '').trim();
  if (!n) return 'sw-6m';

  const legacy: Record<string, SubscriptionPlanId> = {
    '3 months access': 'sw-test-1ghc',
    '9 months access': 'sw-6m',
  };
  if (legacy[n]) return legacy[n];

  const ids: SubscriptionPlanId[] = ['sw-test-1ghc', 'sw-2m', 'sw-4m', 'sw-6m'];
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
  /** Rounded monthly equivalent shown in the plan picker */
  monthlyRateGhs: number;
  /** Percent saved vs baseline monthly rate; omit on baseline tier */
  savingsPercent?: number;
  /** Highlights the recommended upgrade tier in the UI */
  isBestValue?: boolean;
  /** GH₵1 Paystack test plan — not shown in production unless env flag is set */
  isTestPlan?: boolean;
  description: string;
}

const TEST_SUBSCRIPTION_PLAN: SubscriptionPlan = {
  id: 'sw-test-1ghc',
  title: 'Payment test',
  durationLabel: '3 months access',
  months: 3,
  priceGhs: 1,
  monthlyRateGhs: 1,
  isTestPlan: true,
  description:
    'Dummy plan for live payment testing — Paystack charges GH₵1; ERPNext subscription uses 3 months access.',
};

const PRODUCTION_SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: 'sw-2m',
    title: '2-month',
    durationLabel: '2 months',
    months: 2,
    priceGhs: 500,
    monthlyRateGhs: 250,
    description: 'Standard rate — ideal to try SourceWave supplier access.',
  },
  {
    id: 'sw-4m',
    title: '4-month',
    durationLabel: '4 months',
    months: 4,
    priceGhs: 850,
    monthlyRateGhs: 212,
    savingsPercent: 15,
    description: '15% lower monthly cost — more runway for active sourcing.',
  },
  {
    id: 'sw-6m',
    title: '6-month',
    durationLabel: '6 months',
    months: 6,
    priceGhs: 1100,
    monthlyRateGhs: 183,
    savingsPercent: 27,
    isBestValue: true,
    description: '27% off the monthly rate — best value for repeat orders and steady sourcing.',
  },
];

export const SOURCEWAVE_SUBSCRIPTION_PLANS: SubscriptionPlan[] = SHOW_TEST_SUBSCRIPTION_PLAN
  ? [TEST_SUBSCRIPTION_PLAN, ...PRODUCTION_SUBSCRIPTION_PLANS]
  : PRODUCTION_SUBSCRIPTION_PLANS;

export const DEFAULT_SUBSCRIPTION_PLAN_ID: SubscriptionPlanId = SHOW_TEST_SUBSCRIPTION_PLAN
  ? 'sw-test-1ghc'
  : 'sw-6m';

export const getPlanById = (id: SubscriptionPlanId): SubscriptionPlan | undefined =>
  SOURCEWAVE_SUBSCRIPTION_PLANS.find((p) => p.id === id);

/** Whole-number monthly label, e.g. GH₵183/mo */
export function formatSubscriptionMonthlyRate(monthlyGhs: number): string {
  const rounded = Math.round(monthlyGhs);
  return `GH₵${rounded.toLocaleString('en-GH')}/mo`;
}

/** Total GHS saved vs paying the baseline monthly rate for the same duration. */
export function getPlanTotalSavingsGhs(plan: SubscriptionPlan): number {
  const baselineTotal = SUBSCRIPTION_BASELINE_MONTHLY_GHS * plan.months;
  return Math.max(0, baselineTotal - plan.priceGhs);
}
