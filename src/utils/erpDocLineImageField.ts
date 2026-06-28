/** Attach Image field on Sales Order Item / Supplier Quotation Item child rows. */
export const ERP_DOC_LINE_IMAGE_FIELD = 'custom_new_image';

export function readErpDocLineImage(row: Record<string, unknown> | null | undefined): string {
  if (!row || typeof row !== 'object') return '';
  return String(row[ERP_DOC_LINE_IMAGE_FIELD] || '').trim();
}

export function applyErpDocLineImage(
  row: Record<string, unknown>,
  imageUrl?: string | null
): Record<string, unknown> {
  const img = String(imageUrl || '').trim();
  if (!img) return row;
  return { ...row, [ERP_DOC_LINE_IMAGE_FIELD]: img };
}
