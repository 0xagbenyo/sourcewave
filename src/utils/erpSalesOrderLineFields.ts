/** Buyer-requested units on Sales Order Item only; ERP `qty` stays 1. */
export const ERP_SO_LINE_REQUESTED_QTY_FIELD = 'custom_new_quantity';

/** Mandatory on some sites — copy of naming series ("Series Copy"). */
export const ERP_SO_SERIES_COPY_FIELD = 'custom_series_copy';

/** Quantity for supplier quotation pre-fill from a linked Sales Order line. */
export function readSalesOrderLineRequestedQty(row: Record<string, unknown> | null | undefined): number {
  if (!row || typeof row !== 'object') return 1;
  const custom = Number(row[ERP_SO_LINE_REQUESTED_QTY_FIELD]);
  if (Number.isFinite(custom) && custom > 0) return custom;
  const qty = Number(row.qty);
  if (Number.isFinite(qty) && qty > 0) return qty;
  return 1;
}

/** Buyer budget per line — `amount` on SO rows is rate only (not qty × rate). */
export function readSalesOrderLineBudget(row: Record<string, unknown> | null | undefined): number {
  if (!row || typeof row !== 'object') return 0;
  const amount = Number(row.amount);
  if (Number.isFinite(amount) && amount >= 0) return amount;
  const rate = Number(row.rate);
  if (Number.isFinite(rate) && rate >= 0) return rate;
  return 0;
}

/** Value for mandatory `custom_series_copy` when saving a Sales Order. */
export function readSalesOrderSeriesCopy(row: Record<string, unknown> | null | undefined): string {
  if (!row || typeof row !== 'object') return '';
  const field =
    String(process.env.EXPO_PUBLIC_ERPNEXT_SO_SERIES_COPY_FIELD || ERP_SO_SERIES_COPY_FIELD).trim() ||
    ERP_SO_SERIES_COPY_FIELD;
  const direct = String(row[field] ?? '').trim();
  if (direct) return direct;
  const namingSeries = String(row.naming_series ?? '').trim();
  if (namingSeries) return namingSeries;
  return String(process.env.EXPO_PUBLIC_ERPNEXT_SO_SERIES_COPY_DEFAULT ?? '').trim();
}

/** Header fields that must be sent on partial Sales Order updates. */
export function salesOrderHeaderPreservePatch(
  row: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const seriesCopy = readSalesOrderSeriesCopy(row);
  const field =
    String(process.env.EXPO_PUBLIC_ERPNEXT_SO_SERIES_COPY_FIELD || ERP_SO_SERIES_COPY_FIELD).trim() ||
    ERP_SO_SERIES_COPY_FIELD;
  if (seriesCopy) patch[field] = seriesCopy;
  return patch;
}
