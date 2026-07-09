export type ShippingOptionId = 'air_cargo' | 'freight_cargo';

export type ShippingMeasureUnit = 'kg' | 'cbm';

export type ShippingOption = {
  id: ShippingOptionId;
  label: string;
  subtitle: string;
  erpValue: string;
  /** Unit shown on line items and totals for this shipping mode. */
  measureUnit: ShippingMeasureUnit;
  measureLabel: string;
};

/** Shipping choices shown before creating a Delivery Note from a paid invoice. */
export const SHIPPING_OPTIONS: ShippingOption[] = [
  {
    id: 'air_cargo',
    label: 'Air Cargo',
    subtitle: 'Max 21 days delivery · KG',
    /** Must match ERPNext Select options on Delivery Note `custom_shipping_option`. */
    erpValue: 'Air Cargo',
    measureUnit: 'kg',
    measureLabel: 'KG',
  },
  {
    id: 'freight_cargo',
    label: 'Freight Cargo',
    subtitle: 'Max 7 weeks delivery · CBM',
    erpValue: 'Freight Cargo',
    measureUnit: 'cbm',
    measureLabel: 'CBM',
  },
];

export function shippingOptionById(id: ShippingOptionId): ShippingOption | undefined {
  return SHIPPING_OPTIONS.find((o) => o.id === id);
}

export function shippingOptionByErpValue(value: string): ShippingOption | undefined {
  const v = String(value || '').trim();
  if (!v) return undefined;
  const direct = SHIPPING_OPTIONS.find((o) => o.erpValue === v);
  if (direct) return direct;
  if (v === 'Freight Cargo') return SHIPPING_OPTIONS.find((o) => o.id === 'freight_cargo');
  return undefined;
}

/** Display unit for weights/volumes (defaults to KG when shipping is unknown). */
export function shippingMeasureLabelForErpValue(value: string | undefined | null): string {
  return shippingOptionByErpValue(String(value || '').trim())?.measureLabel ?? 'KG';
}

export function shippingMeasureUnitForErpValue(value: string | undefined | null): ShippingMeasureUnit {
  return shippingOptionByErpValue(String(value || '').trim())?.measureUnit ?? 'kg';
}

/** Infer KG vs CBM from an ERPNext **Shipping Rule** name (e.g. "Freight Cargo"). */
export function shippingMeasureUnitForRuleName(
  rule: string | undefined | null
): ShippingMeasureUnit | null {
  const v = String(rule || '').trim();
  if (!v) return null;
  const direct = shippingOptionByErpValue(v);
  if (direct) return direct.measureUnit;
  const lower = v.toLowerCase();
  if (/\bfreight\b/.test(lower) || /\bsea\b/.test(lower) || /\bcbm\b/.test(lower)) return 'cbm';
  if (/\bair\b/.test(lower) || /\bkg\b/.test(lower)) return 'kg';
  return null;
}

/**
 * Active measure unit from buyer shipping option and/or logistics shipping rule.
 * Option wins when set; otherwise infer from rule name (Freight Cargo → CBM).
 */
export function shippingMeasureUnitForContext(
  shippingOptionErpValue: string | undefined | null,
  shippingRule: string | undefined | null
): ShippingMeasureUnit {
  const option = String(shippingOptionErpValue || '').trim();
  if (option) return shippingMeasureUnitForErpValue(option);
  return shippingMeasureUnitForRuleName(shippingRule) ?? 'kg';
}

/** Map ERPNext Shipping Rule name → buyer shipping option erpValue (Air / Freight Cargo). */
export function shippingOptionErpValueForRuleName(ruleName: string | undefined | null): string {
  const v = String(ruleName || '').trim();
  if (!v) return '';
  const direct = shippingOptionByErpValue(v);
  if (direct) return direct.erpValue;
  const unit = shippingMeasureUnitForRuleName(v);
  if (unit === 'cbm') return SHIPPING_OPTIONS.find((o) => o.id === 'freight_cargo')?.erpValue ?? '';
  if (unit === 'kg') return SHIPPING_OPTIONS.find((o) => o.id === 'air_cargo')?.erpValue ?? '';
  return '';
}

/** Pick ERPNext Shipping Rule name for a buyer shipping option. */
export function shippingRuleNameForOptionErpValue(
  optionErpValue: string | undefined | null,
  rules: Array<{ name: string; label?: string }>
): string {
  const option = shippingOptionByErpValue(String(optionErpValue || '').trim());
  if (!option) return '';
  const byName = rules.find(
    (r) =>
      r.name === option.erpValue ||
      String(r.label || '').trim() === option.label ||
      String(r.label || '').trim() === option.erpValue
  );
  if (byName) return byName.name;
  const byUnit = rules.find((r) => shippingMeasureUnitForRuleName(r.name) === option.measureUnit);
  return byUnit?.name ?? option.erpValue;
}

export function syncedShippingFromRule(
  ruleName: string,
  isSupplier: boolean
): { shipping_rule: string; shipping_option_label: string; is_supplier: boolean } {
  return {
    shipping_rule: ruleName,
    shipping_option_label: shippingOptionErpValueForRuleName(ruleName),
    is_supplier: isSupplier,
  };
}

export function syncedShippingFromOption(
  optionErpValue: string,
  rules: Array<{ name: string; label?: string }>,
  isSupplier: boolean
): { shipping_rule: string; shipping_option_label: string; is_supplier: boolean } {
  return {
    shipping_rule: shippingRuleNameForOptionErpValue(optionErpValue, rules),
    shipping_option_label: optionErpValue,
    is_supplier: isSupplier,
  };
}
