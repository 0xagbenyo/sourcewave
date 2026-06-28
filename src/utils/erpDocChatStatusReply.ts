import {
  listMessagesForChannel,
  listRavenChannelsForSessionUser,
  sendRavenChannelDocumentLinkMessage,
  sendRavenChannelMessage,
  type RavenMessageRow,
} from '../services/ravenNativeApi';
import { setPendingRavenDocLinkMessageMerge } from './ravenDocLinkMessageMergeBridge';
import { getERPNextClient } from '../services/erpnext';

function supplierQuotationOrderLinkField(): string {
  return String(process.env.EXPO_PUBLIC_ERPNEXT_SQ_ORDER_LINK_FIELD || 'custom_order').trim() || 'custom_order';
}

export type ErpDocChatContext = {
  ravenChannelId?: string;
  linkMessageId?: string;
  sessionEmail?: string | null;
};

export const QUOTATION_EDITED_CHAT_REPLY = 'Edited — please review.';
export const QUOTATION_ACCEPTED_CHAT_REPLY = 'Quotation accepted.';
export const QUOTATION_REJECTED_CHAT_REPLY = 'Quotation rejected.';
export const SOURCING_REQUEST_ACCEPTED_CHAT_REPLY = 'Sourcing request accepted.';

/** Supplier saved edits on an existing draft — text reply on the quotation thread (no new document card). */
export function notifyQuotationEditedInChat(quotationName: string, chat?: ErpDocChatContext): void {
  const n = String(quotationName || '').trim();
  if (!n) return;
  notifyTextReplyOnErpDocThread({
    linkDoctype: 'Supplier Quotation',
    linkDocument: n,
    text: QUOTATION_EDITED_CHAT_REPLY,
    ravenChannelId: chat?.ravenChannelId,
    linkMessageId: chat?.linkMessageId,
    sessionEmail: chat?.sessionEmail ?? null,
  });
}

/** Buyer accepted a quotation — text reply on the quotation thread and linked sales order (no document card). */
export function notifyQuotationAcceptedInChat(
  quotationName: string,
  chat?: ErpDocChatContext
): void {
  const n = String(quotationName || '').trim();
  if (!n) return;
  notifyTextReplyOnErpDocThread({
    linkDoctype: 'Supplier Quotation',
    linkDocument: n,
    text: QUOTATION_ACCEPTED_CHAT_REPLY,
    ravenChannelId: chat?.ravenChannelId,
    linkMessageId: chat?.linkMessageId,
    sessionEmail: chat?.sessionEmail ?? null,
  });
  void (async () => {
    try {
      const sq = await getERPNextClient().getSupplierQuotationByName(n);
      const so = String(sq?.[supplierQuotationOrderLinkField()] || '').trim();
      if (!so) return;
      notifyTextReplyOnErpDocThread({
        linkDoctype: 'Sales Order',
        linkDocument: so,
        text: SOURCING_REQUEST_ACCEPTED_CHAT_REPLY,
        ravenChannelId: chat?.ravenChannelId,
        sessionEmail: chat?.sessionEmail ?? null,
      });
    } catch {
      /* optional linked order */
    }
  })();
}

/** Buyer rejected a quotation — text reply on the quotation thread (no document card). */
export function notifyQuotationRejectedInChat(quotationName: string, chat?: ErpDocChatContext): void {
  const n = String(quotationName || '').trim();
  if (!n) return;
  notifyTextReplyOnErpDocThread({
    linkDoctype: 'Supplier Quotation',
    linkDocument: n,
    text: QUOTATION_REJECTED_CHAT_REPLY,
    ravenChannelId: chat?.ravenChannelId,
    linkMessageId: chat?.linkMessageId,
    sessionEmail: chat?.sessionEmail ?? null,
  });
}


function normalizeDoctype(doctype: string): string {
  return String(doctype || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ');
}

function messageLinksDocument(msg: RavenMessageRow, linkDoctype: string, linkDocument: string): boolean {
  const wantDt = normalizeDoctype(linkDoctype);
  const wantDn = String(linkDocument || '').trim();
  if (!wantDn) return false;
  const dt = normalizeDoctype(String(msg.link_doctype || ''));
  const dn = String(msg.link_document || '').trim();
  return !!dt && dt === wantDt && dn === wantDn;
}

export async function findRavenMessageLinkingDocument(
  channelId: string,
  linkDoctype: string,
  linkDocument: string,
  opts?: { pageSize?: number; maxPages?: number }
): Promise<RavenMessageRow | null> {
  const cid = String(channelId || '').trim();
  const wantDn = String(linkDocument || '').trim();
  if (!cid || !wantDn) return null;

  const pageSize = opts?.pageSize ?? 80;
  const maxPages = opts?.maxPages ?? 6;

  for (let page = 0; page < maxPages; page++) {
    const rows = await listMessagesForChannel(cid, pageSize, {
      limitStart: page * pageSize,
      skipChannelVisit: true,
    });
    if (!rows.length) break;
    const hit = rows.find((m) => messageLinksDocument(m, linkDoctype, wantDn));
    if (hit?.name) return hit;
    if (rows.length < pageSize) break;
  }
  return null;
}

/** Locate the Raven channel + parent message for an ERP document share (for threaded replies). */
export async function resolveErpDocChatThread(opts: {
  linkDoctype: string;
  linkDocument: string;
  ravenChannelId?: string;
  linkMessageId?: string;
  sessionEmail?: string | null;
}): Promise<{ channelId: string; replyToMessageId: string } | null> {
  const channelId = String(opts.ravenChannelId || '').trim();
  const replyTo = String(opts.linkMessageId || '').trim();
  if (channelId && replyTo) return { channelId, replyToMessageId: replyTo };

  if (channelId && !replyTo) {
    const msg = await findRavenMessageLinkingDocument(channelId, opts.linkDoctype, opts.linkDocument);
    if (msg?.name) return { channelId, replyToMessageId: String(msg.name) };
  }

  const channels = await listRavenChannelsForSessionUser(opts.sessionEmail ?? null);
  const dms = channels.filter(
    (c) => c.is_direct_message || String(c.type || '').trim().toLowerCase() === 'direct'
  );
  const ordered = [...dms, ...channels.filter((c) => !dms.some((d) => d.name === c.name))];

  for (const ch of ordered) {
    const cid = String(ch.name || '').trim();
    if (!cid) continue;
    const msg = await findRavenMessageLinkingDocument(cid, opts.linkDoctype, opts.linkDocument);
    if (msg?.name) return { channelId: cid, replyToMessageId: String(msg.name) };
  }

  return null;
}

export type ErpDocChatStatusReplyOpts = {
  linkDoctype: string;
  linkDocument: string;
  caption: string;
  ravenChannelId?: string;
  linkMessageId?: string;
  sessionEmail?: string | null;
  /** When the primary doc was never shared in chat, reply on this document’s thread instead. */
  fallbackLink?: { linkDoctype: string; linkDocument: string };
};

export type ErpDocTextThreadReplyOpts = {
  linkDoctype: string;
  linkDocument: string;
  text: string;
  ravenChannelId?: string;
  linkMessageId?: string;
  sessionEmail?: string | null;
  fallbackLink?: { linkDoctype: string; linkDocument: string };
};

/**
 * Post a plain-text Raven reply on the thread for a linked ERP document (no duplicate document card).
 */
export async function replyTextOnErpDocThread(opts: ErpDocTextThreadReplyOpts): Promise<boolean> {
  const text = String(opts.text || '').trim();
  if (!text) return false;

  let target = await resolveErpDocChatThread(opts);
  if (!target && opts.fallbackLink) {
    const fb = opts.fallbackLink;
    target = await resolveErpDocChatThread({
      linkDoctype: fb.linkDoctype,
      linkDocument: fb.linkDocument,
      ravenChannelId: opts.ravenChannelId,
      sessionEmail: opts.sessionEmail,
    });
  }
  if (!target) {
    console.warn('[erpDocChatStatusReply] no chat thread for text reply', opts.linkDoctype, opts.linkDocument);
    return false;
  }

  await sendRavenChannelMessage(target.channelId, text, {
    replyToMessageId: target.replyToMessageId,
  });
  return true;
}

export function notifyTextReplyOnErpDocThread(opts: ErpDocTextThreadReplyOpts): void {
  void replyTextOnErpDocThread(opts).catch((e) => {
    console.warn('[erpDocChatStatusReply] text reply failed', opts.linkDoctype, opts.linkDocument, e);
  });
}

/**
 * Post a Raven reply on the chat thread for a linked ERP document (same card, threaded under the original share).
 */
export async function replyErpDocStatusInChat(opts: ErpDocChatStatusReplyOpts): Promise<boolean> {
  const dt = String(opts.linkDoctype || '').trim();
  const dn = String(opts.linkDocument || '').trim();
  const caption = String(opts.caption || '').trim();
  if (!dt || !dn || !caption) return false;

  let target = await resolveErpDocChatThread(opts);
  if (!target && opts.fallbackLink) {
    const fb = opts.fallbackLink;
    target = await resolveErpDocChatThread({
      linkDoctype: fb.linkDoctype,
      linkDocument: fb.linkDocument,
      ravenChannelId: opts.ravenChannelId,
      sessionEmail: opts.sessionEmail,
    });
  }
  if (!target) {
    console.warn('[erpDocChatStatusReply] no chat thread for', dt, dn);
    return false;
  }

  let sentRaw = await sendRavenChannelDocumentLinkMessage(target.channelId, {
    linkDoctype: dt,
    linkDocument: dn,
    caption,
    replyToMessageId: target.replyToMessageId,
  });
  if (sentRaw != null && typeof sentRaw === 'object' && !Array.isArray(sentRaw)) {
    sentRaw = {
      ...(sentRaw as Record<string, unknown>),
      link_doctype: dt,
      link_document: dn,
    };
  }
  setPendingRavenDocLinkMessageMerge(target.channelId, sentRaw);
  return true;
}

/** Fire-and-forget status reply — never blocks the caller UI. */
export function notifyErpDocStatusInChat(opts: ErpDocChatStatusReplyOpts): void {
  void replyErpDocStatusInChat(opts).catch((e) => {
    console.warn('[erpDocChatStatusReply] failed', opts.linkDoctype, opts.linkDocument, e);
  });
}
