/** Map ERPNext Sales Order items → supplier quotation compose lines. */
export type SalesOrderQuotationLineSeed = {
  key: string;
  item_code: string;
  item_name: string;
  stock_uom?: string;
  qty: string;
  rate: string;
  /** Buyer budget from the sourcing request (SO rate) — shown as hint only. */
  buyer_budget?: string;
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
    const qtyN = Number(it.qty);
    const rateN = Number(it.rate);
    const qty = Number.isFinite(qtyN) && qtyN > 0 ? qtyN : 1;
    const rate = Number.isFinite(rateN) && rateN >= 0 ? rateN : 0;
    lines.push({
      key: `so-${orderName || 'ord'}-${i}`,
      item_code: code,
      item_name: name,
      stock_uom: String(it.uom || it.stock_uom || '').trim() || undefined,
      qty: String(qty),
      rate: String(rate),
      buyer_budget: String(rate),
    });
  }

  return {
    lines,
    referenceTitle: orderName ? `Quote for ${orderName}` : '',
    currency,
  };
}
