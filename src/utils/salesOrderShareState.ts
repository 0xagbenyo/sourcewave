import { getERPNextClient } from '../services/erpnext';

function salesOrderQuotationLinkField(): string {
  return String(process.env.EXPO_PUBLIC_ERPNEXT_SO_QUOTATION_LINK_FIELD || 'custom_quotation').trim() || 'custom_quotation';
}

export type SalesOrderShareUiState = {
  /** Draft order that can still be sent to a supplier in chat. */
  canShare: boolean;
  /** Submitted in ERP or a supplier quotation is already linked. */
  sharedWithSupplier: boolean;
  /** Draft order the buyer can edit in the sourcing form. */
  canEdit: boolean;
};

export type SalesOrderShareUiOptions = {
  /** When true, buyer-only actions (edit) are disabled for supplier portal viewers. */
  viewerIsSupplier?: boolean;
};

export async function getSalesOrderShareUiState(
  orderName: string,
  options?: SalesOrderShareUiOptions
): Promise<SalesOrderShareUiState> {
  const n = orderName.trim();
  if (!n) return { canShare: false, sharedWithSupplier: false, canEdit: false };

  const raw = await getERPNextClient().getSalesOrder(n);
  const docstatus = Number(raw?.docstatus ?? 0);
  const quotation = String(raw?.[salesOrderQuotationLinkField()] || '').trim();

  // Match assertSalesOrderShareable: draft orders stay shareable until submitted or quoted.
  // Chat shares alone do not lock the order — only ERP submission / quotation linkage does.
  const sharedWithSupplier = docstatus !== 0 || !!quotation;
  const canShare = docstatus === 0 && !quotation;
  const canEdit = canShare && !options?.viewerIsSupplier;

  return { canShare, sharedWithSupplier, canEdit };
}
