import { getERPNextClient } from '../services/erpnext';
import {
  getRavenDmPeerUserId,
  listRavenChannelsForSessionUser,
  sendRavenChannelDocumentLinkMessage,
  type RavenChannelRow,
} from '../services/ravenNativeApi';
import { setPendingRavenDocLinkMessageMerge } from './ravenDocLinkMessageMergeBridge';
import { resolveErpDocChatThread } from './erpDocChatStatusReply';
import { supplierQuotationShareCaption } from './supplierQuotationShareCaption';

export type ShareSupplierQuotationOpts = {
  quotationName: string;
  channelId: string;
  sessionEmail?: string | null;
  cardTitle?: string;
  channelRows?: RavenChannelRow[];
  replyToMessageId?: string;
  /** When resending, resolve reply target from the prior quotation thread. */
  resendFromQuotation?: string;
};

export async function shareSupplierQuotationInChat(opts: ShareSupplierQuotationOpts): Promise<void> {
  const quotationName = opts.quotationName.trim();
  const trimmed = opts.channelId.trim();
  if (!quotationName) throw new Error('Quotation name is required.');
  if (!trimmed) throw new Error('No chat channel to send to.');

  const client = getERPNextClient();
  let cardTitle = String(opts.cardTitle || '').trim();
  if (!cardTitle) {
    const doc = await client.getSupplierQuotationByName(quotationName);
    cardTitle = supplierQuotationShareCaption((doc || {}) as Record<string, unknown>);
  }

  const rows =
    opts.channelRows ??
    (await listRavenChannelsForSessionUser(opts.sessionEmail ?? null));
  const shareChannel = rows.find((c) => c.name === trimmed);
  const peerUserId = shareChannel ? getRavenDmPeerUserId(shareChannel, opts.sessionEmail) : null;
  if (peerUserId) {
    try {
      await client.linkSupplierQuotationToCustomerForShare(quotationName, peerUserId);
    } catch (linkErr) {
      console.warn('[SupplierQuotation] custom_customer link failed:', linkErr);
    }
  }

  let replyToMessageId = String(opts.replyToMessageId || '').trim();
  const resendFrom = String(opts.resendFromQuotation || '').trim();
  if (!replyToMessageId && resendFrom) {
    const thread = await resolveErpDocChatThread({
      linkDoctype: 'Supplier Quotation',
      linkDocument: resendFrom,
      ravenChannelId: trimmed,
      sessionEmail: opts.sessionEmail ?? null,
    });
    if (thread?.replyToMessageId) replyToMessageId = thread.replyToMessageId;
  }

  let sentRaw = await sendRavenChannelDocumentLinkMessage(trimmed, {
    linkDoctype: 'Supplier Quotation',
    linkDocument: quotationName,
    caption: cardTitle,
    ...(replyToMessageId ? { replyToMessageId } : {}),
  });
  if (sentRaw != null && typeof sentRaw === 'object' && !Array.isArray(sentRaw)) {
    sentRaw = {
      ...(sentRaw as Record<string, unknown>),
      link_doctype: 'Supplier Quotation',
      link_document: quotationName,
    };
  }
  setPendingRavenDocLinkMessageMerge(trimmed, sentRaw);
}
