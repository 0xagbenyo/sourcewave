import { readSalesOrderLineRequestedQty } from './erpSalesOrderLineFields';
import { readErpDocLineImage } from './erpDocLineImageField';
export type SalesOrderQuotationLineSeed = {
  key: string;
  item_code: string;
  item_name: string;
  stock_uom?: string;
  qty: string;
  rate: string;
  /** Buyer budget from the sourcing request (SO rate) — shown as hint only. */
  buyer_budget?: string;
  /** Item master / buyer reference image. */
  item_image?: string;
  /** Supplier-attached image URL (persisted). */
  supplier_image?: string;
};

export function quotationLinesFromSalesOrder(raw: Record<string, unknown> | null | undefined): {
  lines: SalesOrderQuotationLineSeed[];
  referenceTitle: string;
  currency: string;
} {
  const items = Array.isArray(raw?.items) ? (raw!.items as Record<string, unknown>[]) : [];
  const currency = String(raw?.currency || 'GHS').trim() || 'GHS';
  const orderName = String(raw?.name || '').trim();

  const lines: SalesOrderQuotationLineSeed[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const code = String(it.item_code || '').trim();
    if (!code) continue;
    const name = String(it.item_name || it.description || code).trim();
    const qty = readSalesOrderLineRequestedQty(it);
    const rateN = Number(it.rate);
    const rate = Number.isFinite(rateN) && rateN >= 0 ? rateN : 0;
    lines.push({
      key: `so-${orderName || 'ord'}-${i}`,
      item_code: code,
      item_name: name,
      stock_uom: String(it.uom || it.stock_uom || '').trim() || undefined,
      qty: String(qty),
      rate: String(rate),
      buyer_budget: String(rate),
      item_image: readErpDocLineImage(it) || undefined,
    });
  }

  return {
    lines,
    referenceTitle: orderName ? `Quote for ${orderName}` : '',
    currency,
  };
}

/** Map existing Supplier Quotation items → compose lines (edit / resend). */
export function quotationLinesFromSupplierQuotation(
  raw: Record<string, unknown> | null | undefined
): {
  lines: SalesOrderQuotationLineSeed[];
  referenceTitle: string;
  currency: string;
  salesOrderName: string;
} {
  const items = Array.isArray(raw?.items) ? (raw!.items as Record<string, unknown>[]) : [];
  const currency = String(raw?.currency || 'GHS').trim() || 'GHS';
  const sqName = String(raw?.name || '').trim();
  const orderField =
    String(process.env.EXPO_PUBLIC_ERPNEXT_SQ_ORDER_LINK_FIELD || 'custom_order').trim() || 'custom_order';
  const salesOrderName = String(raw?.[orderField] || '').trim();

  const lines: SalesOrderQuotationLineSeed[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i]!;
    const code = String(it.item_code || '').trim();
    if (!code) continue;
    const name = String(it.item_name || it.description || code).trim();
    const qtyN = Number(it.qty);
    const rateN = Number(it.rate);
    const qty = Number.isFinite(qtyN) && qtyN > 0 ? qtyN : 1;
    const rate = Number.isFinite(rateN) && rateN >= 0 ? rateN : 0;
    lines.push({
      key: `sq-${sqName || 'q'}-${i}`,
      item_code: code,
      item_name: name,
      stock_uom: String(it.uom || it.stock_uom || '').trim() || undefined,
      qty: String(qty),
      rate: String(rate),
      supplier_image: readErpDocLineImage(it) || undefined,
    });
  }

  const title = String(raw?.title || '').trim();
  return {
    lines,
    referenceTitle: title || (salesOrderName ? `Quote for ${salesOrderName}` : ''),
    currency,
    salesOrderName,
  };
}
