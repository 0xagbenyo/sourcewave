import type { Order } from '../types';

/** Whether a Sales Invoice row/doc should count the linked quotation as paid. */
export function isSalesInvoicePaidForOrderCompletion(
  inv: Record<string, unknown> | null | undefined,
  outstandingAmount?: number | null
): boolean {
  if (!inv) return false;
  const ds = Number(inv.docstatus);
  if (Number.isFinite(ds) && ds === 2) return false;
  const st = String(inv.status ?? '')
    .trim()
    .toLowerCase();
  if (st === 'paid' || st === 'completed' || st === 'credit note issued') return true;
  const outstanding =
    outstandingAmount != null && Number.isFinite(Number(outstandingAmount))
      ? Number(outstandingAmount)
      : Number(inv.outstanding_amount);
  const grand = Number(inv.grand_total);
  if (Number.isFinite(outstanding) && outstanding <= 0.009 && Number.isFinite(grand) && grand > 0) {
    // Avoid treating missing/zero outstanding on unpaid invoices as paid (same rule as ERP client).
    if (!st || st === 'unpaid' || st === 'overdue' || st.includes('unpaid')) return false;
    return true;
  }
  return false;
}

export type OrderCompletionCandidate = {
  quotationId: string;
  salesOrderId: string;
  customerId?: string;
};

/**
 * Upgrade confirmed Sales Orders to completed only when quotation invoice(s)
 * are paid and linked Delivery Note fees are settled. If no delivery note is
 * found, the order stays confirmed.
 */
export async function enrichOrdersWithQuotationPaymentStatus(
  orders: Order[],
  resolveSettledSalesOrderIds: (
    candidates: OrderCompletionCandidate[]
  ) => Promise<Iterable<string>>
): Promise<Order[]> {
  const candidates: OrderCompletionCandidate[] = [];
  const seen = new Set<string>();
  for (const order of orders) {
    if (order.status !== 'confirmed') continue;
    const quotationId = String(order.acceptedQuotationId || '').trim();
    const salesOrderId = String(order.id || order.orderNumber || '').trim();
    if (!quotationId || !salesOrderId) continue;
    if (seen.has(salesOrderId)) continue;
    seen.add(salesOrderId);
    candidates.push({
      quotationId,
      salesOrderId,
      customerId: String(order.userId || '').trim() || undefined,
    });
  }
  if (!candidates.length) return orders;

  try {
    const settledOrders = new Set(
      [...(await resolveSettledSalesOrderIds(candidates))]
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    );
    if (!settledOrders.size) return orders;

    return orders.map((order) => {
      if (order.status !== 'confirmed') return order;
      const soId = String(order.id || order.orderNumber || '').trim();
      if (!soId || !settledOrders.has(soId)) return order;
      return { ...order, status: 'completed' };
    });
  } catch {
    return orders;
  }
}
