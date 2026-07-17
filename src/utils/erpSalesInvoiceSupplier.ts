import { getERPNextClient } from '../services/erpnext';

/** Sales Invoice Link → Supplier (default `custom_supplier`). */
export function salesInvoiceSupplierFieldName(): string {
  return (
    String(process.env.EXPO_PUBLIC_ERPNEXT_SI_SUPPLIER_LINK_FIELD || 'custom_supplier').trim() ||
    'custom_supplier'
  );
}

export function readSalesInvoiceSupplier(doc: Record<string, unknown> | null | undefined): string {
  if (!doc) return '';
  const field = salesInvoiceSupplierFieldName();
  return String(doc[field] ?? '').trim();
}

export function salesInvoiceSupplierUiLabel(
  supplierId: string | undefined,
  supplierDisplayName: string | undefined,
  t: (key: string) => string
): string {
  const resolved = String(supplierDisplayName || supplierId || '').trim();
  if (resolved) return resolved;
  return t('erpDocumentParty.noSupplierAssigned');
}

export function deliveryNoteLogisticsUiLabel(
  supplierId: string | undefined,
  supplierDisplayName: string | undefined,
  t: (key: string) => string
): string {
  const resolved = String(supplierDisplayName || supplierId || '').trim();
  if (resolved) return resolved;
  return t('erpDocumentParty.noLogisticsAssigned');
}

/** True when a supplier portal user is viewing a doc owned by a different Supplier link. */
export function erpDocOwnedByOtherSupplier(
  linkedSupplierId: string | undefined,
  viewerSupplierDocId: string | undefined
): boolean {
  const linked = String(linkedSupplierId || '').trim();
  const viewer = String(viewerSupplierDocId || '').trim();
  if (!linked || !viewer) return false;
  return linked.toLowerCase() !== viewer.toLowerCase();
}

export async function resolveErpSupplierDisplayName(supplierDocId: string): Promise<string> {
  const id = String(supplierDocId || '').trim();
  if (!id) return '';
  try {
    const row = await getERPNextClient().getSupplier(id);
    return String(row?.supplier_name || id).trim() || id;
  } catch {
    return id;
  }
}
