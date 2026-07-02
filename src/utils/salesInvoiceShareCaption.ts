/** Chat card caption for a Sales Invoice document link. */
export function salesInvoiceShareCaption(doc: Record<string, unknown>): string {
  const customer = String(doc.customer_name || doc.customer || '').trim();
  const cur = String(doc.currency || '').trim();
  const gt = Number(doc.grand_total) || 0;
  if (customer && gt > 0) {
    const money = `${cur ? `${cur} ` : ''}${gt.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
    return `${customer} · ${money}`;
  }
  if (customer) return customer;
  return String(doc.name || 'Invoice');
}

export function salesInvoiceListCaption(row: Record<string, unknown>): string {
  const name = String(row.name || '').trim();
  const cur = String(row.currency || '').trim();
  const gt = Number(row.grand_total) || 0;
  const date = String(row.posting_date || row.transaction_date || '').trim();
  const customer = String(row.customer_name || row.customer || '').trim();
  const parts: string[] = [];
  if (customer) parts.push(customer);
  if (gt > 0) {
    parts.push(
      `${cur ? `${cur} ` : ''}${gt.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    );
  }
  if (date) parts.push(date);
  if (parts.length === 0) return name;
  return parts.join(' · ');
}
