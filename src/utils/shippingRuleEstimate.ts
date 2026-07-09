import type { ShippingMeasureUnit } from '../constants/shippingOptions';

export type ErpShippingRuleCondition = {
  from_value: number;
  to_value: number;
  shipping_amount: number;
};

export type ErpShippingRuleDetail = {
  name: string;
  calculate_based_on: string;
  conditions: ErpShippingRuleCondition[];
};

export function parseShippingRuleDetail(raw: Record<string, unknown> | null | undefined): ErpShippingRuleDetail | null {
  if (!raw) return null;
  const name = String(raw.name || '').trim();
  if (!name) return null;
  const rows = Array.isArray(raw.shipping_rule_conditions)
    ? (raw.shipping_rule_conditions as Record<string, unknown>[])
    : [];
  const conditions: ErpShippingRuleCondition[] = [];
  for (const row of rows) {
    const from = Number(row.from_value);
    const to = Number(row.to_value);
    const amount = Number(row.shipping_amount);
    if (!Number.isFinite(amount)) continue;
    conditions.push({
      from_value: Number.isFinite(from) ? from : 0,
      to_value: Number.isFinite(to) && to > 0 ? to : Number.POSITIVE_INFINITY,
      shipping_amount: amount,
    });
  }
  return {
    name,
    calculate_based_on: String(raw.calculate_based_on || '').trim(),
    conditions,
  };
}

export type ShippingEstimateBasis = {
  netTotal: number;
  weightKg: number;
  weightCbm: number;
};

/**
 * Client-side estimate from ERPNext Shipping Rule tiers (preview before/at save).
 * ERPNext may adjust taxes on save; this powers real-time draft UI.
 */
export function estimateShippingRuleCharge(
  rule: ErpShippingRuleDetail,
  basis: ShippingEstimateBasis,
  measureUnit: ShippingMeasureUnit
): number | null {
  const calc = String(rule.calculate_based_on || '').trim().toLowerCase();
  if (calc === 'fixed') {
    const fixed = rule.conditions[0]?.shipping_amount;
    return fixed != null && Number.isFinite(fixed) ? fixed : null;
  }

  let basisValue: number;
  if (calc.includes('weight')) {
    basisValue = measureUnit === 'cbm' ? basis.weightCbm : basis.weightKg;
  } else if (calc.includes('net total') || calc === 'net total') {
    basisValue = basis.netTotal;
  } else {
    basisValue = measureUnit === 'cbm' ? basis.weightCbm : basis.weightKg;
  }

  if (!Number.isFinite(basisValue) || basisValue <= 0) return null;

  for (const tier of rule.conditions) {
    if (basisValue >= tier.from_value && basisValue <= tier.to_value) {
      const amt = tier.shipping_amount;
      if (calc.includes('net total') && amt > 0 && amt <= 100) {
        return Math.round(basis.netTotal * (amt / 100) * 100) / 100;
      }
      if (calc.includes('weight')) {
        return Math.round(amt * basisValue * 100) / 100;
      }
      return amt;
    }
  }
  const fallback = rule.conditions[0]?.shipping_amount;
  if (fallback == null) return null;
  if (calc.includes('weight')) {
    return Math.round(fallback * basisValue * 100) / 100;
  }
  return fallback;
}
