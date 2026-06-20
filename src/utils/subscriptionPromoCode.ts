import { isRuleActive } from './pricingRules';

/** Fields on Pricing Rule that may hold the promo code entered by the user. */
const PROMO_CODE_FIELDS = [
  'custom_promo_code',
  'coupon_code',
  'promo_code',
  'title',
  'name',
] as const;

export interface SubscriptionPromoDiscount {
  percent: number;
  flatAmountGhs: number;
}

export interface AppliedSubscriptionPromo {
  /** Code as entered by the user (trimmed). */
  code: string;
  pricingRuleName: string;
  discountPercent: number;
  discountAmountGhs: number;
  originalPriceGhs: number;
  finalPriceGhs: number;
}

export function normalizePromoCode(code: string): string {
  return code.trim();
}

export function pricingRuleMatchesPromoCode(rule: Record<string, unknown>, rawCode: string): boolean {
  const normalized = normalizePromoCode(rawCode).toUpperCase();
  if (!normalized) return false;

  for (const field of PROMO_CODE_FIELDS) {
    const value = rule[field];
    if (typeof value === 'string' && value.trim().toUpperCase() === normalized) {
      return true;
    }
  }
  return false;
}

export function getSubscriptionDiscountFromRule(rule: Record<string, unknown>): SubscriptionPromoDiscount {
  const percent = Number(rule.discount_percentage) || 0;
  if (percent > 0) {
    return { percent, flatAmountGhs: 0 };
  }

  const flatAmount = Number(rule.discount_amount) || 0;
  if (flatAmount > 0) {
    return { percent: 0, flatAmountGhs: flatAmount };
  }

  return { percent: 0, flatAmountGhs: 0 };
}

export function computeSubscriptionCheckoutPrice(
  originalPriceGhs: number,
  discount: SubscriptionPromoDiscount
): { finalPriceGhs: number; discountAmountGhs: number; discountPercent: number } {
  const original = Number.isFinite(originalPriceGhs) ? originalPriceGhs : 0;
  if (original <= 0) {
    return { finalPriceGhs: 0, discountAmountGhs: 0, discountPercent: 0 };
  }

  if (discount.percent > 0) {
    const finalPriceGhs = roundGhs(original * (1 - discount.percent / 100));
    const discountAmountGhs = roundGhs(original - finalPriceGhs);
    return { finalPriceGhs, discountAmountGhs, discountPercent: discount.percent };
  }

  if (discount.flatAmountGhs > 0) {
    const finalPriceGhs = roundGhs(Math.max(0, original - discount.flatAmountGhs));
    const discountAmountGhs = roundGhs(original - finalPriceGhs);
    const discountPercent = Math.round((discountAmountGhs / original) * 100);
    return { finalPriceGhs, discountAmountGhs, discountPercent };
  }

  return { finalPriceGhs: original, discountAmountGhs: 0, discountPercent: 0 };
}

export function buildAppliedSubscriptionPromo(
  code: string,
  pricingRuleName: string,
  originalPriceGhs: number,
  discount: SubscriptionPromoDiscount
): AppliedSubscriptionPromo | null {
  const pricing = computeSubscriptionCheckoutPrice(originalPriceGhs, discount);
  if (pricing.discountAmountGhs <= 0 && discount.percent <= 0 && discount.flatAmountGhs <= 0) {
    return null;
  }
  if (pricing.finalPriceGhs <= 0) {
    return null;
  }

  return {
    code: normalizePromoCode(code),
    pricingRuleName,
    discountPercent: pricing.discountPercent,
    discountAmountGhs: pricing.discountAmountGhs,
    originalPriceGhs,
    finalPriceGhs: pricing.finalPriceGhs,
  };
}

export function isPricingRuleValidForPromo(rule: Record<string, unknown>): boolean {
  if (!isRuleActive(rule as Parameters<typeof isRuleActive>[0])) {
    return false;
  }
  const discount = getSubscriptionDiscountFromRule(rule);
  return discount.percent > 0 || discount.flatAmountGhs > 0;
}

function roundGhs(value: number): number {
  return Math.round(value * 100) / 100;
}
