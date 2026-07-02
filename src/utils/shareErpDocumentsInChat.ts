import type { RavenChannelRow } from '../services/ravenNativeApi';
import { shareSalesInvoiceInChat } from './shareSalesInvoiceInChat';
import { shareSupplierQuotationInChat } from './shareSupplierQuotationInChat';

export type ErpDocShareKind = 'quotation' | 'invoice';

export async function shareErpDocumentsInChat(opts: {
  kind: ErpDocShareKind;
  documentNames: string[];
  channelId: string;
  sessionEmail?: string | null;
  channelRows?: RavenChannelRow[];
}): Promise<void> {
  const names = opts.documentNames.map((n) => String(n || '').trim()).filter(Boolean);
  const channelId = opts.channelId.trim();
  if (!names.length) throw new Error('Select at least one document.');
  if (!channelId) throw new Error('No chat channel to send to.');

  for (const name of names) {
    if (opts.kind === 'quotation') {
      await shareSupplierQuotationInChat({
        quotationName: name,
        channelId,
        sessionEmail: opts.sessionEmail,
        channelRows: opts.channelRows,
      });
    } else {
      await shareSalesInvoiceInChat({
        invoiceName: name,
        channelId,
      });
    }
  }
}
