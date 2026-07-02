export type DeliveryNoteAmountBreakdown = {
  invoiceAmount: number;
  shippingAmount: number;
  total: number;
};

const DEFAULT_IS_SUPPLIER_FIELD = 'custom_is_supplier';
const DEFAULT_SUPPLIER_LINK_FIELD = 'custom_supplier';
const DEFAULT_LOGISTICS_LINK_FIELD = 'custom_logistics';

export function deliveryNoteIsSupplierFieldName(): string {
  return (
    String(process.env.EXPO_PUBLIC_ERPNEXT_DN_IS_SUPPLIER_FIELD || DEFAULT_IS_SUPPLIER_FIELD).trim() ||
    DEFAULT_IS_SUPPLIER_FIELD
  );
}

/** ERPNext Link → **Supplier** on Delivery Note (goods supplier from linked invoice). Default `custom_supplier`. */
export function deliveryNoteSupplierFieldName(): string {
  return (
    String(process.env.EXPO_PUBLIC_ERPNEXT_DN_SUPPLIER_LINK_FIELD || DEFAULT_SUPPLIER_LINK_FIELD).trim() ||
    DEFAULT_SUPPLIER_LINK_FIELD
  );
}

/** ERPNext Link → **Supplier** on Delivery Note (logistics company that submitted). Default `custom_logistics`. */
export function deliveryNoteLogisticsFieldName(): string {
  return (
    String(process.env.EXPO_PUBLIC_ERPNEXT_DN_LOGISTICS_LINK_FIELD || DEFAULT_LOGISTICS_LINK_FIELD).trim() ||
    DEFAULT_LOGISTICS_LINK_FIELD
  );
}

export function readDeliveryNoteSupplier(
  doc: Record<string, unknown> | null | undefined,
  field = deliveryNoteSupplierFieldName()
): string {
  if (!doc) return '';
  return String(doc[field] ?? '').trim();
}

export function readDeliveryNoteLogistics(
  doc: Record<string, unknown> | null | undefined,
  field = deliveryNoteLogisticsFieldName()
): string {
  if (!doc) return '';
  return String(doc[field] ?? '').trim();
}

/** Payment Entry Link → **Delivery Note** (default `custom_delivery_note`). */
export function paymentEntryDeliveryNoteFieldName(): string {
  return (
    String(process.env.EXPO_PUBLIC_ERPNEXT_PE_DELIVERY_NOTE_FIELD || 'custom_delivery_note').trim() ||
    'custom_delivery_note'
  );
}

/** ERPNext Check (0/1) or Select Yes/No on Delivery Note. */
export function readDeliveryNoteIsSupplier(
  doc: Record<string, unknown> | null | undefined,
  field = deliveryNoteIsSupplierFieldName()
): boolean {
  if (!doc) return false;
  const v = doc[field];
  if (v === 1 || v === '1' || v === true) return true;
  if (v === 0 || v === '0' || v === false) return false;
  const s = String(v ?? '').trim().toLowerCase();
  return s === 'yes' || s === 'y';
}

/** Write value matching the field type already on the document (Check vs Select). */
export function deliveryNoteIsSupplierErpValue(
  yes: boolean,
  existingValue?: unknown
): string | number {
  if (typeof existingValue === 'string') {
    const s = existingValue.trim().toLowerCase();
    if (s === 'yes' || s === 'no') return yes ? 'Yes' : 'No';
  }
  return yes ? 1 : 0;
}

export function computeDeliveryNoteAmountBreakdown(
  doc: Record<string, unknown>,
  invoiceGrandTotal: number | null | undefined
): DeliveryNoteAmountBreakdown {
  const total = Number(doc.grand_total);
  const invoiceAmount = Number(invoiceGrandTotal);
  const safeInvoice = Number.isFinite(invoiceAmount) && invoiceAmount > 0 ? invoiceAmount : 0;
  const safeTotal = Number.isFinite(total) ? total : 0;

  const shippingAmount =
    safeInvoice > 0 ? Math.max(0, safeTotal - safeInvoice) : safeTotal > 0 ? safeTotal : 0;

  return {
    invoiceAmount: safeInvoice,
    shippingAmount,
    total: safeTotal > 0 ? safeTotal : safeInvoice + shippingAmount,
  };
}

/** Delivery fee only — use for chat captions and list previews (not combined DN grand total). */
export function deliveryNoteShippingFeeAmount(
  doc: Record<string, unknown>,
  invoiceGrandTotal?: number | null
): number {
  return computeDeliveryNoteAmountBreakdown(doc, invoiceGrandTotal).shippingAmount;
}

/** Read linked Sales Invoice name from the first DN item row, if any. */
export function linkedSalesInvoiceFromDeliveryNote(
  doc: Record<string, unknown> | null | undefined
): string {
  if (!doc) return '';
  const rows = Array.isArray(doc.items) ? (doc.items as Record<string, unknown>[]) : [];
  return rows.map((row) => String(row.against_sales_invoice || '').trim()).find((n) => n.length > 0) || '';
}

/** Sum posted Payment Entry amounts allocated to this Delivery Note (capped at shipping due). */
export function sumPaidTowardDeliveryNote(
  paymentRows: Array<Record<string, unknown>>,
  shippingCap: number
): number {
  const cap = Number.isFinite(shippingCap) && shippingCap > 0 ? shippingCap : 0;
  if (!cap) return 0;
  let sum = 0;
  for (const row of paymentRows) {
    const alloc = Number(row._allocated_amount);
    const fallback = Number(row.received_amount ?? row.paid_amount ?? 0);
    const add = Number.isFinite(alloc) && alloc > 0 ? alloc : fallback;
    if (Number.isFinite(add) && add > 0) sum += add;
  }
  return Math.min(sum, cap);
}

/** Delivery (shipping) fee still due on a submitted delivery note. */
export function deliveryNoteShippingOutstanding(
  doc: Record<string, unknown>,
  invoiceGrandTotal: number | null | undefined,
  paymentRows: Array<Record<string, unknown>>
): number {
  if (Number(doc.docstatus) === 2) return 0;
  const { shippingAmount } = computeDeliveryNoteAmountBreakdown(doc, invoiceGrandTotal);
  if (shippingAmount <= 0.009) return 0;
  const paid = sumPaidTowardDeliveryNote(paymentRows, shippingAmount);
  return Math.max(0, shippingAmount - paid);
}

/** Buyers/suppliers can pay delivery after the note is submitted (any shipping handler). */
export function deliveryNoteAllowsDeliveryPayment(doc: Record<string, unknown> | null | undefined): boolean {
  if (!doc) return false;
  if (Number(doc.docstatus) !== 1) return false;
  return true;
}

export type PaymentEntryLinkedDoc = {
  doctype: string;
  name: string;
  amount?: number;
};

/** Standard PE references plus `custom_delivery_note` (delivery fees have no SI/DN reference row). */
export function resolvePaymentEntryLinkedDocs(doc: Record<string, unknown>): PaymentEntryLinkedDoc[] {
  const out: PaymentEntryLinkedDoc[] = [];
  const seen = new Set<string>();

  const refs = Array.isArray(doc.references) ? (doc.references as Record<string, unknown>[]) : [];
  for (const row of refs) {
    const doctype = String(row.reference_doctype || '').trim();
    const name = String(row.reference_name || '').trim();
    if (!doctype || !name) continue;
    const key = `${doctype}::${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const alloc = Number(row.allocated_amount);
    out.push({
      doctype,
      name,
      amount: Number.isFinite(alloc) && alloc > 0 ? alloc : undefined,
    });
  }

  const dnField = paymentEntryDeliveryNoteFieldName();
  const linkedDn = String(doc[dnField] ?? '').trim();
  if (linkedDn) {
    const key = `Delivery Note::${linkedDn}`;
    if (!seen.has(key)) {
      seen.add(key);
      const pay = Number(doc.received_amount ?? doc.paid_amount ?? 0);
      out.push({
        doctype: 'Delivery Note',
        name: linkedDn,
        amount: Number.isFinite(pay) && pay > 0 ? pay : undefined,
      });
    }
  } else {
    const remarks = String(doc.remarks || '').trim();
    const match = remarks.match(/^Delivery fee\s*[—–-]\s*(.+)$/i);
    const fromRemarks = match?.[1]?.trim() || '';
    if (fromRemarks) {
      const key = `Delivery Note::${fromRemarks}`;
      if (!seen.has(key)) {
        const pay = Number(doc.received_amount ?? doc.paid_amount ?? 0);
        out.push({
          doctype: 'Delivery Note',
          name: fromRemarks,
          amount: Number.isFinite(pay) && pay > 0 ? pay : undefined,
        });
      }
    }
  }

  return out;
}
