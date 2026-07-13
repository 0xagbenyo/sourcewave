import type { TFunction } from 'i18next';
import {
  shippingMeasureLabelForErpValue,
  shippingMeasureUnitForContext,
  shippingMeasureUnitForErpValue,
  type ShippingMeasureUnit,
} from '../constants/shippingOptions';

/** Parse a decimal field from compose inputs or ERP rows. */
export function parseErpWeightInput(raw: unknown): number | null {
  const n = parseFloat(String(raw ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** `total_weight = qty × weight_per_unit` for quotation / invoice lines. */
export function calcErpLineTotalWeight(qty: unknown, weightPerUnit: unknown): number {
  const q = parseErpWeightInput(qty);
  const w = parseErpWeightInput(weightPerUnit);
  if (q == null || w == null || q <= 0) return 0;
  return Math.round(q * w * 1000) / 1000;
}

export function formatErpLineWeight(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '0';
  return n.toLocaleString(undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export type ErpLineWeightFields = {
  weight_per_unit?: number | null;
  total_weight?: number | null;
  custom_weight_kg?: number | null;
  custom_total_weight_kg?: number | null;
  custom_weight_cbm?: number | null;
  custom_total_weight_cbm?: number | null;
};

const ERP_WEIGHT_PER_UNIT_KG_FIELD = 'custom_weight_kg';
const ERP_TOTAL_WEIGHT_KG_FIELD = 'custom_total_weight_kg';
const ERP_WEIGHT_PER_UNIT_CBM_FIELD = 'custom_weight_cbm';
const ERP_TOTAL_WEIGHT_CBM_FIELD = 'custom_total_weight_cbm';

/** kg per 1 CBM when converting supplier-entered mass to freight volume (default **25**). */
export function kgPerCbm(): number {
  const n = Number(process.env.EXPO_PUBLIC_KG_PER_CBM ?? 25);
  return Number.isFinite(n) && n > 0 ? n : 25;
}

export function kgToCbm(kg: number): number {
  if (!Number.isFinite(kg) || kg <= 0) return 0;
  return Math.round((kg / kgPerCbm()) * 1000) / 1000;
}

export function cbmToKg(cbm: number): number {
  if (!Number.isFinite(cbm) || cbm <= 0) return 0;
  return Math.round(cbm * kgPerCbm() * 1000) / 1000;
}

export function convertMeasureValue(
  value: number,
  from: ShippingMeasureUnit,
  to: ShippingMeasureUnit
): number {
  if (from === to) return value;
  if (from === 'kg' && to === 'cbm') return kgToCbm(value);
  return cbmToKg(value);
}

export { shippingMeasureUnitForErpValue } from '../constants/shippingOptions';

export function convertErpLineWeights(
  weights: ErpLineWeightFields,
  from: ShippingMeasureUnit,
  to: ShippingMeasureUnit
): ErpLineWeightFields {
  const out: ErpLineWeightFields = {};
  if (weights.weight_per_unit != null) {
    out.weight_per_unit = convertMeasureValue(weights.weight_per_unit, from, to);
  }
  if (weights.total_weight != null) {
    out.total_weight = convertMeasureValue(weights.total_weight, from, to);
  }
  return out;
}

/** Interpret ERP row weights as canonical KG (supplier quotations / invoices are always KG). */
export function erpLineWeightsToCanonicalKg(
  weights: ErpLineWeightFields,
  storedUnit: ShippingMeasureUnit = 'kg'
): ErpLineWeightFields {
  if (storedUnit === 'kg') return { ...weights };
  return convertErpLineWeights(weights, 'cbm', 'kg');
}

/** Canonical KG → values to persist on ERP in the active shipping unit. */
export function erpLineWeightsFromCanonicalKg(
  weights: ErpLineWeightFields,
  targetUnit: ShippingMeasureUnit
): ErpLineWeightFields {
  if (targetUnit === 'kg') return { ...weights };
  return convertErpLineWeights(weights, 'kg', 'cbm');
}

/**
 * Unit shown in the app from shipping option and/or shipping rule.
 */
export function resolveWeightDisplayUnit(
  shippingOptionErpValue: string | undefined | null,
  shippingRule: string | undefined | null
): ShippingMeasureUnit {
  return shippingMeasureUnitForContext(shippingOptionErpValue, shippingRule);
}

/** @deprecated Use {@link resolveWeightDisplayUnit} — same behaviour. */
export function deliveryNoteMeasureUnitForDisplay(
  shippingOptionErpValue: string | undefined | null,
  shippingRule: string | undefined | null
): ShippingMeasureUnit {
  return shippingMeasureUnitForContext(shippingOptionErpValue, shippingRule);
}

export function erpLineWeightsForDisplay(
  canonicalKg: ErpLineWeightFields,
  displayUnit: ShippingMeasureUnit
): ErpLineWeightFields {
  return erpLineWeightsFromCanonicalKg(canonicalKg, displayUnit);
}

export function readErpLineWeightCanonicalKg(
  row: Record<string, unknown>,
  storedUnit: ShippingMeasureUnit = 'kg'
): ErpLineWeightFields {
  return erpLineWeightsToCanonicalKg(readErpLineWeightFromRow(row), storedUnit);
}

export function measureLabelForUnit(unit: ShippingMeasureUnit): string {
  return unit === 'cbm' ? 'CBM' : 'KG';
}

/** Localized line measure detail (KG for air cargo, CBM for freight cargo). */
export function erpLineMeasureDetailText(
  t: TFunction,
  weights: ErpLineWeightFields,
  shippingErpValue?: string | null
): string | undefined {
  if (weights.total_weight == null && weights.weight_per_unit == null) return undefined;
  const unit = shippingMeasureLabelForErpValue(shippingErpValue);
  return t('invoiceDelivery.weightDetail', {
    weight: formatErpLineWeight(weights.total_weight ?? 0),
    perUnit: formatErpLineWeight(weights.weight_per_unit ?? 0),
    unit,
  });
}

/** Supplier quotation / invoice: KG entry with equivalent CBM (display only until ERP push). */
export function erpLineMeasureDetailWithCbm(
  t: TFunction,
  weights: ErpLineWeightFields
): string | undefined {
  if (weights.total_weight == null && weights.weight_per_unit == null) return undefined;
  const totalKg = weights.total_weight ?? 0;
  const perUnitKg = weights.weight_per_unit ?? 0;
  return t('invoiceDelivery.weightDetailWithCbm', {
    weight: formatErpLineWeight(totalKg),
    perUnit: formatErpLineWeight(perUnitKg),
    weightCbm: formatErpLineWeight(kgToCbm(totalKg)),
    perUnitCbm: formatErpLineWeight(kgToCbm(perUnitKg)),
  });
}

/** Document total weight in KG and CBM (quotations, invoices). */
export function erpDocTotalWeightDetailWithCbm(t: TFunction, totalKg: number): string | undefined {
  if (!Number.isFinite(totalKg) || totalKg <= 0) return undefined;
  return t('invoiceDetails.totalWeightValue', {
    weightKg: formatErpLineWeight(totalKg),
    weightCbm: formatErpLineWeight(kgToCbm(totalKg)),
  });
}

/** Map optional weight fields onto an ERPNext child row. */
export function applyErpLineWeightToRow(
  row: Record<string, unknown>,
  weights: ErpLineWeightFields
): void {
  const wpu = parseErpWeightInput(weights.weight_per_unit);
  const tw = parseErpWeightInput(weights.total_weight);
  const wpuKg = parseErpWeightInput(weights.custom_weight_kg);
  const twKg = parseErpWeightInput(weights.custom_total_weight_kg);
  const wpuCbm = parseErpWeightInput(weights.custom_weight_cbm);
  const twCbm = parseErpWeightInput(weights.custom_total_weight_cbm);
  const resolvedWpuKg = wpu ?? wpuKg ?? (wpuCbm != null ? cbmToKg(wpuCbm) : null);
  const resolvedTwKg = tw ?? twKg ?? (twCbm != null ? cbmToKg(twCbm) : null);

  if (resolvedWpuKg != null) {
    row.weight_per_unit = resolvedWpuKg;
    row[ERP_WEIGHT_PER_UNIT_KG_FIELD] = wpuKg ?? resolvedWpuKg;
    row[ERP_WEIGHT_PER_UNIT_CBM_FIELD] = wpuCbm != null ? wpuCbm : kgToCbm(resolvedWpuKg);
  }
  if (resolvedTwKg != null) {
    row.total_weight = resolvedTwKg;
    row[ERP_TOTAL_WEIGHT_KG_FIELD] = twKg ?? resolvedTwKg;
    row[ERP_TOTAL_WEIGHT_CBM_FIELD] = twCbm != null ? twCbm : kgToCbm(resolvedTwKg);
  }
}

/** Convert every line on a draft document to the target shipping unit before ERP save. */
export function convertDocItemsWeightsForSave(
  items: Record<string, unknown>[],
  fromUnit: ShippingMeasureUnit,
  toUnit: ShippingMeasureUnit
): Record<string, unknown>[] {
  if (fromUnit === toUnit) return items;
  return items.map((row) => {
    const next = { ...row };
    const canonical = erpLineWeightsToCanonicalKg(readErpLineWeightFromRow(row), fromUnit);
    applyErpLineWeightToRow(next, erpLineWeightsFromCanonicalKg(canonical, toUnit));
    return next;
  });
}

/** Sum line **total_weight** across ERPNext document items (invoice, DN, etc.). */
export function sumErpDocItemsTotalWeight(doc: Record<string, unknown> | null | undefined): number {
  const items = Array.isArray(doc?.items) ? (doc.items as Record<string, unknown>[]) : [];
  let sum = 0;
  for (const row of items) {
    const w = readErpLineWeightFromRow(row);
    if (w.total_weight != null && w.total_weight > 0) sum += w.total_weight;
  }
  return Math.round(sum * 1000) / 1000;
}

/** Read weight fields from an ERPNext item row. */
export function readErpLineWeightFromRow(row: Record<string, unknown>): ErpLineWeightFields {
  const wpu = parseErpWeightInput(row.weight_per_unit);
  const tw = parseErpWeightInput(row.total_weight);
  const wpuKg = parseErpWeightInput(row[ERP_WEIGHT_PER_UNIT_KG_FIELD]);
  const twKg = parseErpWeightInput(row[ERP_TOTAL_WEIGHT_KG_FIELD]);
  const wpuCbm = parseErpWeightInput(row[ERP_WEIGHT_PER_UNIT_CBM_FIELD]);
  const twCbm = parseErpWeightInput(row[ERP_TOTAL_WEIGHT_CBM_FIELD]);
  const out: ErpLineWeightFields = {};
  if (wpu != null) out.weight_per_unit = wpu;
  else if (wpuKg != null) out.weight_per_unit = wpuKg;
  else if (wpuCbm != null) out.weight_per_unit = cbmToKg(wpuCbm);
  if (tw != null) out.total_weight = tw;
  else if (twKg != null) out.total_weight = twKg;
  else if (twCbm != null) out.total_weight = cbmToKg(twCbm);
  else if (out.weight_per_unit != null) {
    const qty = parseErpWeightInput(row.qty);
    if (qty != null && qty > 0) out.total_weight = calcErpLineTotalWeight(qty, out.weight_per_unit);
  }
  if (wpuKg != null) out.custom_weight_kg = wpuKg;
  else if (out.weight_per_unit != null) out.custom_weight_kg = out.weight_per_unit;
  if (twKg != null) out.custom_total_weight_kg = twKg;
  else if (out.total_weight != null) out.custom_total_weight_kg = out.total_weight;
  if (wpuCbm != null) out.custom_weight_cbm = wpuCbm;
  if (twCbm != null) out.custom_total_weight_cbm = twCbm;
  return out;
}
