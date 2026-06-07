import type { RavenMessageRow } from '../services/ravenNativeApi';
import { tryParseQuotationDraftFromMessage } from './chatQuotationDraftMessage';
import { plainTextFromMaybeHtml } from './chatPlainText';
import { replySnippet } from './ravenSearchPreview';
import { getRavenAttachmentLabel, resolveRavenMessageFilePaths } from './ravenAttachment';

function formatLinkedDocLine(doctype: string, docname: string, caption?: string): string {
  const dt = doctype.trim();
  const dn = docname.trim();
  const cap = (caption || '').replace(/\s+/g, ' ').trim();
  const label = dt.toLowerCase() === 'supplier quotation' ? 'Supplier quotation' : dt;
  let line = `${label} · ${dn}`;
  if (cap && cap !== dn && !dn.toLowerCase().includes(cap.toLowerCase()) && !cap.toLowerCase().includes(dn.toLowerCase())) {
    line = `${line} — ${cap}`;
  }
  return line;
}

function parseDetailsRecord(details: unknown): Record<string, unknown> | null {
  if (details == null) return null;
  if (typeof details === 'string' && details.trim()) {
    try {
      return JSON.parse(details) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof details === 'object' && !Array.isArray(details)) {
    return details as Record<string, unknown>;
  }
  return null;
}

/**
 * Best-effort plain line from Raven `replied_message_details` when the parent message row
 * is not in the loaded window (e.g. older linked Supplier Quotation). Prefer link id over
 * bare caption / partial HTML.
 */
export function ravenRepliedDetailsResolvedPlainText(details: unknown): string | undefined {
  const o = parseDetailsRecord(details);
  if (!o) return undefined;

  const linkDt = String(o.link_doctype ?? o.linkDoctype ?? '').trim();
  const linkDn = String(o.link_document ?? o.linkDocument ?? '').trim();
  if (linkDt && linkDn) {
    const cap = plainTextFromMaybeHtml(String(o.content ?? o.text ?? '')).trim();
    return formatLinkedDocLine(linkDt, linkDn, cap);
  }

  const nested = o.message;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const n = nested as Record<string, unknown>;
    const ndt = String(n.link_doctype ?? '').trim();
    const ndn = String(n.link_document ?? '').trim();
    if (ndt && ndn) {
      const cap = plainTextFromMaybeHtml(String(n.text ?? n.content ?? '')).trim();
      return formatLinkedDocLine(ndt, ndn, cap);
    }
  }

  const t = o.content ?? o.text;
  if (t == null) return undefined;
  const s = String(t).trim();
  if (!s) return undefined;

  const draft = tryParseQuotationDraftFromMessage(s);
  if (draft) {
    return `Supplier quotation · ${draft.name}`;
  }

  return plainTextFromMaybeHtml(s).trim() || undefined;
}

/**
 * One-line preview for composer “replying to…” chips, search, and inline reply quotes —
 * prefers ERP document link (`link_doctype` / `link_document`) over message `text` alone.
 */
export function ravenMessageShortPreview(row: RavenMessageRow | null | undefined): string {
  if (!row) return 'Message';

  const hasAttach = !!(row.file?.trim() || row.file_thumbnail?.trim());
  if (hasAttach) {
    const { display } = resolveRavenMessageFilePaths(row);
    const label = display ? getRavenAttachmentLabel(display) : '';
    return label || 'Attachment';
  }

  const linkDt = String(row.link_doctype || '').trim();
  const linkDn = String(row.link_document || '').trim();
  if (linkDt && linkDn) {
    const caption = plainTextFromMaybeHtml(row.text || '').trim();
    return replySnippet(formatLinkedDocLine(linkDt, linkDn, caption));
  }

  const draft = tryParseQuotationDraftFromMessage(row.text);
  if (draft) {
    return replySnippet(`Supplier quotation · ${draft.name}`);
  }

  const body = plainTextFromMaybeHtml(row.text || '').trim();
  return replySnippet(body);
}
