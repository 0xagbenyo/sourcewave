/** Chat card caption for a Supplier Quotation document link. */
export function supplierQuotationShareCaption(doc: Record<string, unknown>): string {
  const title = String(doc.title || '').trim();
  if (title) return title;

  const items = Array.isArray(doc.items) ? (doc.items as Record<string, unknown>[]) : [];
  for (const row of items) {
    const name = String(row.item_name || row.description || '').trim();
    if (name) return name;
  }

  const lineCount = items.length;
  if (lineCount > 0) return `${lineCount} item${lineCount === 1 ? '' : 's'}`;

  return String(doc.name || 'Quotation');
}

export function supplierQuotationListCaption(row: Record<string, unknown>): string {
  const name = String(row.name || '').trim();
  const cur = String(row.currency || '').trim();
  const gt = Number(row.grand_total) || 0;
  const date = String(row.transaction_date || '').trim();
  const parts = [name];
  if (gt > 0) {
    const money = `${cur ? `${cur} ` : ''}${gt.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    parts.push(money);
  }
  if (date) parts.push(date);
  return parts.join(' · ');
}
