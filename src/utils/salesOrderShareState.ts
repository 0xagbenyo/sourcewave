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

  // Draft and submitted orders can be shared in chat; cancelled orders cannot.
  const sharedWithSupplier = docstatus !== 0 || !!quotation;
  const canShare = docstatus !== 2 && !options?.viewerIsSupplier;
  const canEdit = docstatus === 0 && !quotation && !options?.viewerIsSupplier;

  return { canShare, sharedWithSupplier, canEdit };
}
