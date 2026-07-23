import { shippingOptionGoodsPaymentOnArrival } from '../constants/shippingOptions';

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

const DEFAULT_ENTER_FREIGHT_AMOUNT_FIELD = 'custom_enter_freight_amount';

/** ERPNext Check on Delivery Note — supplier enters freight via Sales Taxes and Charges. */
export function deliveryNoteEnterFreightAmountFieldName(): string {
  return (
    String(
      process.env.EXPO_PUBLIC_ERPNEXT_DN_ENTER_FREIGHT_AMOUNT_FIELD || DEFAULT_ENTER_FREIGHT_AMOUNT_FIELD
    ).trim() || DEFAULT_ENTER_FREIGHT_AMOUNT_FIELD
  );
}

export function readDeliveryNoteEnterFreightAmount(
  doc: Record<string, unknown> | null | undefined,
  field = deliveryNoteEnterFreightAmountFieldName()
): boolean {
  if (!doc) return false;
  const candidates = [field, 'custom_enter_freight_amount', 'enter_freight_amount'];
  for (const key of candidates) {
    if (!key || !(key in doc)) continue;
    const v = doc[key];
    if (v === 1 || v === '1' || v === true) return true;
    if (v === 0 || v === '0' || v === false) return false;
    const s = String(v ?? '').trim().toLowerCase();
    if (s === 'yes' || s === 'y') return true;
    if (s === 'no' || s === 'n') return false;
  }
  return false;
}

/** Always persist as ERPNext Check (0/1). */
export function deliveryNoteEnterFreightAmountErpValue(yes: boolean): number {
  return yes ? 1 : 0;
}

/** Default Account Head for Actual freight tax rows. */
export function deliveryNoteFreightAccountHeadDefault(): string {
  return (
    String(process.env.EXPO_PUBLIC_ERPNEXT_DN_FREIGHT_ACCOUNT_HEAD || '').trim() ||
    'Bank Accounts - SW'
  );
}

/** UI + draft charge basis. ERPNext Sales Taxes always stores `Actual` for freight. */
export const FREIGHT_TAX_CHARGE_ACTUAL = 'Actual';
export const FREIGHT_TAX_CHARGE_ON_WEIGHT = 'On Weight';

export type DeliveryNoteTaxRowDraft = {
  key: string;
  idx: number;
  /** `Actual` (fixed amount) or `On Weight` (rate × DN weight). */
  charge_type: string;
  account_head: string;
  description: string;
  rate: number;
  tax_amount: number;
  total: number;
  /** Preserve ERP row identity when updating. */
  name?: string;
};

export function isFreightTaxChargeOnWeight(chargeType: string | null | undefined): boolean {
  const s = String(chargeType || '')
    .trim()
    .toLowerCase();
  return s === 'on weight' || s === 'weight' || s === 'net weight';
}

export function freightTaxAmountFromRateAndWeight(rate: number, totalWeight: number): number {
  const r = Number(rate);
  const w = Number(totalWeight);
  if (!Number.isFinite(r) || r <= 0) return 0;
  if (!Number.isFinite(w) || w <= 0) return 0;
  return Math.round(r * w * 100) / 100;
}

export function readDeliveryNoteTaxRows(
  doc: Record<string, unknown> | null | undefined
): DeliveryNoteTaxRowDraft[] {
  const rows = Array.isArray(doc?.taxes) ? (doc!.taxes as Record<string, unknown>[]) : [];
  return rows.map((row, idx) => {
    const rate = Number(row.rate);
    const taxAmount = Number(row.tax_amount);
    const total = Number(row.total);
    const safeRate = Number.isFinite(rate) ? rate : 0;
    const desc = String(row.description || '').trim();
    const rawType = String(row.charge_type || FREIGHT_TAX_CHARGE_ACTUAL).trim() || FREIGHT_TAX_CHARGE_ACTUAL;
    // Weight basis is stored as Actual + positive rate (never infer from description alone —
    // that hid saved Actual amounts when description said "Freight (Weight)").
    const onWeight = isFreightTaxChargeOnWeight(rawType) || safeRate > 0;
    const safeAmount = Number.isFinite(taxAmount) ? taxAmount : 0;
    return {
      key: String(row.name || `tax-${idx}`),
      idx: idx + 1,
      charge_type: onWeight ? FREIGHT_TAX_CHARGE_ON_WEIGHT : FREIGHT_TAX_CHARGE_ACTUAL,
      account_head:
        String(row.account_head || '').trim() || deliveryNoteFreightAccountHeadDefault(),
      description: desc,
      rate: safeRate,
      // Prefer saved amount; for weight rows keep rate and amount both available.
      tax_amount: onWeight && safeAmount <= 0.009 && safeRate > 0 ? 0 : safeAmount,
      total: Number.isFinite(total) ? total : safeAmount,
      name: String(row.name || '').trim() || undefined,
    };
  });
}

/** Build ERPNext `taxes` child rows from supplier drafts (Sales Taxes and Charges). */
export function deliveryNoteTaxesPayloadFromDrafts(
  drafts: DeliveryNoteTaxRowDraft[],
  totalWeight?: number
): Record<string, unknown>[] {
  const weight = Number(totalWeight);
  return drafts
    .map((row) => {
      const account =
        String(row.account_head || '').trim() || deliveryNoteFreightAccountHeadDefault();
      if (!account) return null;
      const onWeight = isFreightTaxChargeOnWeight(row.charge_type);
      const rate = Number(row.rate);
      const safeRate = Number.isFinite(rate) ? rate : 0;
      let amount = Number(row.tax_amount);
      if (onWeight) {
        amount = freightTaxAmountFromRateAndWeight(safeRate, weight);
      }
      const safeAmount = Number.isFinite(amount) ? amount : 0;
      const payload: Record<string, unknown> = {
        doctype: 'Sales Taxes and Charges',
        idx: 0,
        // ERPNext only accepts standard charge types; weight basis is applied client-side.
        charge_type: FREIGHT_TAX_CHARGE_ACTUAL,
        account_head: account,
        description:
          String(row.description || '').trim() ||
          (onWeight ? 'Freight (Weight)' : 'Freight'),
        rate: onWeight ? safeRate : 0,
        tax_amount: safeAmount,
      };
      if (row.name) payload.name = row.name;
      return payload;
    })
    .filter((row): row is Record<string, unknown> => row != null)
    .map((row, idx) => ({ ...row, idx: idx + 1 }));
}

export function createBlankFreightTaxRow(accountHead?: string): DeliveryNoteTaxRowDraft {
  const account = String(accountHead || deliveryNoteFreightAccountHeadDefault()).trim();
  return {
    key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    idx: 0,
    charge_type: FREIGHT_TAX_CHARGE_ACTUAL,
    account_head: account,
    description: 'Freight',
    rate: 0,
    tax_amount: 0,
    total: 0,
  };
}

/** True when at least one Sales Taxes row has a positive freight amount (account is auto-filled). */
export function deliveryNoteFreightTaxesAreFilled(
  rows: DeliveryNoteTaxRowDraft[] | null | undefined,
  totalWeight?: number
): boolean {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const weight = Number(totalWeight);
  return rows.some((row) => {
    const account =
      String(row.account_head || '').trim() || deliveryNoteFreightAccountHeadDefault();
    if (!account) return false;
    if (isFreightTaxChargeOnWeight(row.charge_type)) {
      const amount = freightTaxAmountFromRateAndWeight(Number(row.rate), weight);
      return amount > 0.009;
    }
    const amount = Number(row.tax_amount);
    return Number.isFinite(amount) && amount > 0.009;
  });
}

/**
 * Freight Cargo (or enter-freight mode) delivery payment is only allowed after the
 * supplier entered freight in Sales Taxes and Charges.
 */
export function deliveryNoteFreightPriceReadyForPayment(
  doc: Record<string, unknown> | null | undefined,
  shippingOptionErpValue?: string | null
): boolean {
  if (!doc) return false;
  const freightMode =
    shippingOptionGoodsPaymentOnArrival(shippingOptionErpValue) ||
    readDeliveryNoteEnterFreightAmount(doc);
  if (!freightMode) return true;
  if (!readDeliveryNoteEnterFreightAmount(doc)) return false;
  return deliveryNoteFreightTaxesAreFilled(
    readDeliveryNoteTaxRows(doc),
    readDeliveryNoteTotalNetWeight(doc)
  );
}

export function computeDeliveryNoteAmountBreakdown(
  doc: Record<string, unknown>,
  invoiceGrandTotal: number | null | undefined
): DeliveryNoteAmountBreakdown {
  const total = Number(doc.grand_total);
  const invoiceAmount = Number(invoiceGrandTotal);
  const safeInvoice = Number.isFinite(invoiceAmount) && invoiceAmount > 0 ? invoiceAmount : 0;
  const safeTotal = Number.isFinite(total) ? total : 0;

  let shippingAmount =
    safeInvoice > 0 ? Math.max(0, safeTotal - safeInvoice) : safeTotal > 0 ? safeTotal : 0;

  // Freight-only DNs (lines already billed on the invoice): grand total is the delivery fee,
  // which is smaller than the invoice — do not subtract invoice from it.
  if (safeInvoice > 0 && shippingAmount <= 0.009 && safeTotal > 0.009 && safeTotal + 0.009 < safeInvoice) {
    shippingAmount = safeTotal;
  }

  // When line amounts are ~0 (already invoiced) and DN total is the fee/taxes.
  if (shippingAmount <= 0.009) {
    const items = Array.isArray(doc.items) ? (doc.items as Record<string, unknown>[]) : [];
    const itemsSum = items.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    if (itemsSum <= 0.009) {
      const taxes = Number(doc.total_taxes_and_charges);
      if (Number.isFinite(taxes) && taxes > 0.009) {
        shippingAmount = taxes;
      } else if (safeTotal > 0.009) {
        shippingAmount = safeTotal;
      }
    }
  }

  return {
    invoiceAmount: safeInvoice,
    shippingAmount,
    total: safeTotal > 0 ? safeTotal : safeInvoice + shippingAmount,
  };
}

/** Document **total_net_weight** from ERPNext (no client-side conversion). */
export function readDeliveryNoteTotalNetWeight(
  doc: Record<string, unknown> | null | undefined
): number {
  const n = Number(doc?.total_net_weight);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Delivery fee ÷ billable weight (KG or CBM) for per-unit rate display. */
export function shippingRatePerMeasureUnit(
  shippingAmount: number,
  weightInUnit: number
): number | null {
  if (!Number.isFinite(shippingAmount) || shippingAmount <= 0) return null;
  if (!Number.isFinite(weightInUnit) || weightInUnit <= 0.0001) return null;
  return Math.round((shippingAmount / weightInUnit) * 100) / 100;
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
