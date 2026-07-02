import { getERPNextClient } from '../services/erpnext';
import { sendRavenChannelDocumentLinkMessage } from '../services/ravenNativeApi';
import { setPendingRavenDocLinkMessageMerge } from './ravenDocLinkMessageMergeBridge';
import { salesInvoiceShareCaption } from './salesInvoiceShareCaption';

export type ShareSalesInvoiceOpts = {
  invoiceName: string;
  channelId: string;
  cardTitle?: string;
};

export async function shareSalesInvoiceInChat(opts: ShareSalesInvoiceOpts): Promise<void> {
  const invoiceName = opts.invoiceName.trim();
  const channelId = opts.channelId.trim();
  if (!invoiceName) throw new Error('Invoice name is required.');
  if (!channelId) throw new Error('No chat channel to send to.');

  const client = getERPNextClient();
  let cardTitle = String(opts.cardTitle || '').trim();
  if (!cardTitle) {
    const doc = await client.getSalesInvoiceRaw(invoiceName);
    cardTitle = salesInvoiceShareCaption((doc || {}) as Record<string, unknown>);
  }

  let sentRaw = await sendRavenChannelDocumentLinkMessage(channelId, {
    linkDoctype: 'Sales Invoice',
    linkDocument: invoiceName,
    caption: cardTitle,
  });
  if (sentRaw != null && typeof sentRaw === 'object' && !Array.isArray(sentRaw)) {
    sentRaw = {
      ...(sentRaw as Record<string, unknown>),
      link_doctype: 'Sales Invoice',
      link_document: invoiceName,
    };
  }
  setPendingRavenDocLinkMessageMerge(channelId, sentRaw);
}
