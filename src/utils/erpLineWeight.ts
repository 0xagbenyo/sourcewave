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
};

/** Map optional weight fields onto an ERPNext child row. */
export function applyErpLineWeightToRow(
  row: Record<string, unknown>,
  weights: ErpLineWeightFields
): void {
  const wpu = parseErpWeightInput(weights.weight_per_unit);
  const tw = parseErpWeightInput(weights.total_weight);
  if (wpu != null) row.weight_per_unit = wpu;
  if (tw != null) row.total_weight = tw;
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
  const out: ErpLineWeightFields = {};
  if (wpu != null) out.weight_per_unit = wpu;
  if (tw != null) out.total_weight = tw;
  else if (wpu != null) {
    const qty = parseErpWeightInput(row.qty);
    if (qty != null && qty > 0) out.total_weight = calcErpLineTotalWeight(qty, wpu);
  }
  return out;
}
