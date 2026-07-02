/** Shown in the supplier app — contact & transport fields stay on ERP, not in this UI. */
export const SUPPLIER_VISIBLE_DN_HEADER_KEYS = [
  'posting_date',
  'shipping_address_name',
  'instructions',
] as const;

/** Header fields suppliers may edit on a draft Delivery Note (items table is read-only). */
export type DeliveryNoteSupplierHeaderDraft = {
  posting_date: string;
  shipping_address_name: string;
  contact_person: string;
  contact_mobile: string;
  contact_email: string;
  transporter: string;
  lr_no: string;
  vehicle_no: string;
  driver_name: string;
  driver_mobile: string;
  mode_of_transport: string;
  incoterm: string;
  instructions: string;
  terms: string;
};

export type DeliveryNoteSupplierHeaderPatch = Partial<DeliveryNoteSupplierHeaderDraft>;

const STR = (v: unknown) => String(v ?? '').trim();

export function deliveryNoteSupplierHeaderFromDoc(
  doc: Record<string, unknown>
): DeliveryNoteSupplierHeaderDraft {
  return {
    posting_date: STR(doc.posting_date),
    shipping_address_name: STR(doc.shipping_address_name),
    contact_person: STR(doc.contact_person),
    contact_mobile: STR(doc.contact_mobile),
    contact_email: STR(doc.contact_email),
    transporter: STR(doc.transporter),
    lr_no: STR(doc.lr_no),
    vehicle_no: STR(doc.vehicle_no),
    driver_name: STR(doc.driver_name),
    driver_mobile: STR(doc.driver_mobile),
    mode_of_transport: STR(doc.mode_of_transport),
    incoterm: STR(doc.incoterm),
    instructions: STR(doc.instructions),
    terms: STR(doc.terms),
  };
}

/** Only changed header keys — avoids overwriting unrelated ERP fields. */
export function deliveryNoteSupplierHeaderPatch(
  draft: DeliveryNoteSupplierHeaderDraft,
  baseline: DeliveryNoteSupplierHeaderDraft
): DeliveryNoteSupplierHeaderPatch {
  const patch: DeliveryNoteSupplierHeaderPatch = {};
  SUPPLIER_VISIBLE_DN_HEADER_KEYS.forEach((key) => {
    if (draft[key] !== baseline[key]) patch[key] = draft[key];
  });
  return patch;
}
