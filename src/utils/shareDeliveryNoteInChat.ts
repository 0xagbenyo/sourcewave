import {
  sendRavenChannelDocumentLinkMessage,
} from '../services/ravenNativeApi';
import { setPendingRavenDocLinkMessageMerge } from './ravenDocLinkMessageMergeBridge';
import { getERPNextClient } from '../services/erpnext';
import {
  deliveryNoteShippingFeeAmount,
  linkedSalesInvoiceFromDeliveryNote,
} from './deliveryNoteAmounts';
import { resolveRavenChannelForSupplierShare } from './shareSalesOrderInChat';

/** Build a short caption for a delivery note share message (delivery fee, not grand total). */
export async function buildDeliveryNoteShareCaption(
  doc: Record<string, unknown>,
  fallbackName: string
): Promise<string> {
  const linkedInvoice = linkedSalesInvoiceFromDeliveryNote(doc);
  let invoiceGrand: number | null = null;
  if (linkedInvoice) {
    try {
      const inv = await getERPNextClient().getSalesInvoiceRaw(linkedInvoice);
      const gt = Number(inv?.grand_total);
      invoiceGrand = Number.isFinite(gt) ? gt : null;
    } catch {
      invoiceGrand = null;
    }
  }
  const name = String(doc?.name || fallbackName).trim();
  const fee = deliveryNoteShippingFeeAmount(doc, invoiceGrand);
  const date = doc?.posting_date ? String(doc.posting_date) : '';
  const parts = [name];
  if (fee > 0) parts.push(`Delivery GH₵${fee.toFixed(2)}`);
  if (date) parts.push(date);
  return parts.join(' · ');
}

/** Ensure the delivery note exists before sharing. */
export async function assertDeliveryNoteShareable(deliveryNoteName: string): Promise<void> {
  const doc = deliveryNoteName.trim();
  if (!doc) throw new Error('Delivery note name required.');
  const raw = await getERPNextClient().getDeliveryNoteRaw(doc);
  if (!raw) throw new Error('Delivery note not found.');
  if (Number(raw.docstatus) === 2) throw new Error('This delivery note was cancelled.');
}

/** Post a Delivery Note doc-link message in a Raven channel. */
export async function shareDeliveryNoteInRavenChat(
  channelId: string,
  deliveryNoteName: string,
  caption?: string
): Promise<void> {
  const chId = channelId.trim();
  const doc = deliveryNoteName.trim();
  if (!chId || !doc) throw new Error('Missing channel or delivery note.');

  await assertDeliveryNoteShareable(doc);

  const cap = (caption || doc).trim();
  let sentRaw = await sendRavenChannelDocumentLinkMessage(chId, {
    linkDoctype: 'Delivery Note',
    linkDocument: doc,
    caption: cap,
  });
  if (sentRaw != null && typeof sentRaw === 'object' && !Array.isArray(sentRaw)) {
    sentRaw = {
      ...(sentRaw as Record<string, unknown>),
      link_doctype: 'Delivery Note',
      link_document: doc,
    };
  }
  setPendingRavenDocLinkMessageMerge(chId, sentRaw);
}

/** Resolve or create a DM with a logistics peer, then post the delivery note link.
 * Optionally stamps **custom_logistics** so the note appears in that supplier’s draft list.
 */
export async function shareDeliveryNoteToLogisticsPeer(opts: {
  deliveryNoteName: string;
  peerUserId: string;
  workspaceId?: string;
  sessionEmail?: string | null;
  /** ERPNext Supplier.name for the logistics company — claims the DN for their list. */
  logisticsSupplierDocName?: string;
}): Promise<{ channelId: string; peerUserId: string; workspaceId: string }> {
  const dnName = String(opts.deliveryNoteName || '').trim();
  const peerUserId = String(opts.peerUserId || '').trim();
  const workspaceId = String(opts.workspaceId || '').trim();
  if (!dnName || !peerUserId) {
    throw new Error('Delivery note and logistics contact are required.');
  }

  await assertDeliveryNoteShareable(dnName);

  const logisticsSid = String(opts.logisticsSupplierDocName || '').trim();
  if (logisticsSid) {
    try {
      await getERPNextClient().claimDeliveryNoteLogistics(dnName, logisticsSid);
    } catch (e) {
      console.warn('[shareDeliveryNote] claim logistics failed', dnName, e);
    }
  }

  const raw = await getERPNextClient().getDeliveryNoteRaw(dnName);
  const caption = raw ? await buildDeliveryNoteShareCaption(raw, dnName) : dnName;

  const ch = await resolveRavenChannelForSupplierShare({
    sessionEmail: opts.sessionEmail,
    peerUserId,
  });
  if (!ch) throw new Error('Could not open chat with this logistics company.');

  await shareDeliveryNoteInRavenChat(ch, dnName, caption);
  return { channelId: ch, peerUserId, workspaceId };
}

/**
 * After a logistics supplier saves a delivery note, send (or re-send) it to the DN **customer** in Raven chat.
 */
export async function shareDeliveryNoteToCustomerFromDoc(opts: {
  deliveryNoteName: string;
  sessionEmail?: string | null;
}): Promise<{ channelId: string; peerUserId: string } | null> {
  const dnName = String(opts.deliveryNoteName || '').trim();
  if (!dnName) return null;

  const client = getERPNextClient();
  const raw = await client.getDeliveryNoteRaw(dnName);
  if (!raw) return null;

  const customerId = String(raw.customer || '').trim();
  if (!customerId) {
    console.warn('[shareDeliveryNote] no customer on delivery note', dnName);
    return null;
  }

  const peerUserId = await client.resolveFrappeUserIdForCustomer(customerId);
  if (!peerUserId) {
    console.warn('[shareDeliveryNote] no chat user for customer', customerId, dnName);
    return null;
  }

  const caption = await buildDeliveryNoteShareCaption(raw, dnName);
  const ch = await resolveRavenChannelForSupplierShare({
    sessionEmail: opts.sessionEmail,
    peerUserId,
  });
  if (!ch) return null;

  await shareDeliveryNoteInRavenChat(ch, dnName, caption);
  return { channelId: ch, peerUserId };
}

export { resolveRavenChannelForSupplierShare };
