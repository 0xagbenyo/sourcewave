import { encodeErpFileUrl } from './erpImageUrl';
import { readErpDocLineImage } from './erpDocLineImageField';

export type ErpDocAttachmentRow = { file_name: string; file_url: string };

/** Prefer supplier image, then buyer / item master fallback. */
export function pickLineDisplayImageUri(
  supplierImage?: string | null,
  fallbackImage?: string | null
): string | undefined {
  const sup = String(supplierImage || '').trim();
  if (sup) return encodeErpFileUrl(sup) || sup;
  const fb = String(fallbackImage || '').trim();
  if (fb) return encodeErpFileUrl(fb) || fb;
  return undefined;
}

/** Map `sourcing-reference-{n}-*.jpg` attachments to zero-based line index. */
export function mapSourcingReferenceFilesToLineIndex(
  files: ErpDocAttachmentRow[]
): Record<number, string> {
  const out: Record<number, string> = {};
  for (const f of files) {
    const name = String(f.file_name || '').trim();
    const url = String(f.file_url || '').trim();
    if (!name || !url) continue;
    const m = name.match(/^sourcing-reference-(\d+)/i);
    if (!m) continue;
    const idx = parseInt(m[1], 10) - 1;
    if (idx >= 0) out[idx] = url;
  }
  return out;
}

/** Map `sq-line-{itemCode}-*` attachments to item codes. */
export function mapSupplierQuotationLineFilesToItemCodes(
  files: ErpDocAttachmentRow[],
  itemCodes: string[]
): Record<string, string> {
  const codes = itemCodes.map((c) => String(c || '').trim()).filter(Boolean);
  if (!codes.length) return {};

  const out: Record<string, string> = {};
  for (const f of files) {
    const name = String(f.file_name || '').trim().toLowerCase();
    const url = String(f.file_url || '').trim();
    if (!name.startsWith('sq-line-') || !url) continue;
    for (const code of codes) {
      const token = code.toLowerCase();
      if (name.includes(token) && !out[code]) {
        out[code] = url;
      }
    }
  }
  return out;
}

export function readLineImageFromRow(row: Record<string, unknown>): string {
  return readErpDocLineImage(row);
}
