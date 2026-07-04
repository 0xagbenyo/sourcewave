/** Legacy buyer-requested units field on older Sales Order Item rows. New rows use ERP `qty`. */
export const ERP_SO_LINE_REQUESTED_QTY_FIELD = 'custom_new_quantity';

/** Mandatory on some sites — copy of naming series ("Series Copy"). */
export const ERP_SO_SERIES_COPY_FIELD = 'custom_series_copy';

/** Buyer-facing reference the customer types when creating the order (default: standard `po_no`). */
export const ERP_SO_REFERENCE_FIELD = 'po_no';

/** Sales Order → accepted Supplier Quotation link (default `custom_quotation`). */
export const ERP_SO_QUOTATION_LINK_FIELD = 'custom_quotation';

/** Field name for the buyer's own order reference (`po_no` unless overridden). */
export function salesOrderReferenceFieldName(): string {
  return (
    String(process.env.EXPO_PUBLIC_ERPNEXT_SO_REFERENCE_FIELD || ERP_SO_REFERENCE_FIELD).trim() ||
    ERP_SO_REFERENCE_FIELD
  );
}

/** Buyer's own reference entered when creating the order. */
export function readSalesOrderReference(row: Record<string, unknown> | null | undefined): string {
  if (!row || typeof row !== 'object') return '';
  const field = salesOrderReferenceFieldName();
  return String(row[field] ?? row.po_no ?? '').trim();
}

/** Field name for the accepted Supplier Quotation link on the Sales Order. */
export function salesOrderAcceptedQuotationFieldName(): string {
  return (
    String(process.env.EXPO_PUBLIC_ERPNEXT_SO_QUOTATION_LINK_FIELD || ERP_SO_QUOTATION_LINK_FIELD).trim() ||
    ERP_SO_QUOTATION_LINK_FIELD
  );
}

/** Accepted Supplier Quotation name linked to this Sales Order (empty when none accepted). */
export function readSalesOrderAcceptedQuotation(row: Record<string, unknown> | null | undefined): string {
  if (!row || typeof row !== 'object') return '';
  const field = salesOrderAcceptedQuotationFieldName();
  return String(row[field] ?? row.custom_quotation ?? '').trim();
}

/** Quantity for supplier quotation pre-fill from a linked Sales Order line. */
export function readSalesOrderLineRequestedQty(row: Record<string, unknown> | null | undefined): number {
  if (!row || typeof row !== 'object') return 1;
  const raw = row.qty ?? row[ERP_SO_LINE_REQUESTED_QTY_FIELD] ?? row.custom_new_quantity;
  const custom = Number(raw);
  if (Number.isFinite(custom) && custom > 0) return Math.floor(custom);
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
