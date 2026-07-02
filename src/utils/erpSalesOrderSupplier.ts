import type { Order, OrderStatus } from '../types';

/** Sales Order Link → Supplier (default `custom_supplier`). */
export function salesOrderSupplierFieldName(): string {
  return (
    String(process.env.EXPO_PUBLIC_ERPNEXT_SO_SUPPLIER_LINK_FIELD || 'custom_supplier').trim() ||
    'custom_supplier'
  );
}

export function readSalesOrderSupplier(doc: Record<string, unknown> | null | undefined): string {
  if (!doc) return '';
  const field = salesOrderSupplierFieldName();
  return String(doc[field] ?? '').trim();
}

/** Buyer-facing label for the linked supplier on a Sales Order. */
export function salesOrderSupplierUiLabel(
  order: Pick<Order, 'supplierId' | 'supplierDisplayName' | 'status'>,
  t: (key: string) => string
): string {
  const resolved = String(order.supplierDisplayName || order.supplierId || '').trim();
  if (resolved) return resolved;
  const status = (order.status || 'pending') as OrderStatus;
  if (status === 'pending') return t('orderDetails.noSupplierQuotedYet');
  return t('orderDetails.noSupplierAssigned');
}

export async function enrichOrdersWithSupplierNames(
  orders: Order[],
  fetchSuppliers: (ids: string[]) => Promise<Array<Record<string, unknown>>>
): Promise<Order[]> {
  const ids = [
    ...new Set(
      orders.map((o) => String(o.supplierId || '').trim()).filter((id) => id.length > 0)
    ),
  ];
  if (!ids.length) return orders;

  try {
    const rows = await fetchSuppliers(ids);
    const byName = new Map<string, string>();
    for (const row of rows) {
      const name = String(row.name || '').trim();
      if (!name) continue;
      byName.set(name, String(row.supplier_name || name).trim() || name);
    }
    return orders.map((order) => {
      const id = String(order.supplierId || '').trim();
      if (!id) return order;
      return { ...order, supplierDisplayName: byName.get(id) || id };
    });
  } catch {
    return orders;
  }
}
