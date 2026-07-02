import {
  createDirectMessageChannel,
  getRavenDmPeerUserId,
  listRavenChannelsForSessionUser,
  sendRavenChannelDocumentLinkMessage,
  type RavenChannelRow,
} from '../services/ravenNativeApi';
import { setPendingRavenDocLinkMessageMerge } from './ravenDocLinkMessageMergeBridge';
import { confirmSalesOrderShareable } from './salesOrderShareGuard';
import { markSalesOrderSharedLocally } from './salesOrderShareMarks';
import type { TFunction } from 'i18next';
import { getERPNextClient } from '../services/erpnext';

function isDmChannel(c: RavenChannelRow): boolean {
  return !!c.is_direct_message || String(c.type || '').trim().toLowerCase() === 'direct';
}

/** Resolve an existing DM channel id or create one for `peerUserId`. */
export async function resolveRavenChannelForSupplierShare(opts: {
  sessionEmail: string | null | undefined;
  ravenChannelId?: string;
  peerUserId?: string;
}): Promise<string> {
  const channelId = (opts.ravenChannelId || '').trim();
  if (channelId) return channelId;

  const peer = (opts.peerUserId || '').trim();
  if (!peer) throw new Error('No supplier chat recipient.');

  const rows = await listRavenChannelsForSessionUser(opts.sessionEmail ?? null);
  const dms = rows.filter(isDmChannel);
  const peerLower = peer.toLowerCase();
  const match = dms.find((c) => {
    const p = getRavenDmPeerUserId(c, opts.sessionEmail);
    return (p || '').trim().toLowerCase() === peerLower;
  });
  if (match) return match.name;

  const created = await createDirectMessageChannel(peer);
  return String(created || '').trim();
}

/** Build a short caption for a sales order share message. */
export function buildSalesOrderShareCaption(
  doc: Record<string, unknown>,
  fallbackName: string
): string {
  const name = String(doc?.name || fallbackName).trim();
  const gt = Number(doc.grand_total) || 0;
  const date = doc.transaction_date ? String(doc.transaction_date) : '';
  const parts = [name];
  if (gt > 0) parts.push(`GH₵${gt.toFixed(2)}`);
  if (date) parts.push(date);
  return parts.join(' · ');
}

/** Resolve or create a DM, then post the sales order link (for supplier profile share). */
export async function shareSalesOrderToSupplierPeer(opts: {
  salesOrderName: string;
  peerUserId: string;
  workspaceId?: string;
  sessionEmail?: string | null;
  t: TFunction;
  navigation?: { navigate: (name: string, params?: object) => void };
}): Promise<{ channelId: string; peerUserId: string; workspaceId: string }> {
  const orderName = String(opts.salesOrderName || '').trim();
  const peerUserId = String(opts.peerUserId || '').trim();
  const workspaceId = String(opts.workspaceId || '').trim();
  if (!orderName || !peerUserId) {
    throw new Error('Sales order and supplier contact are required.');
  }

  const ok = await confirmSalesOrderShareable(orderName, opts.t, opts.navigation);
  if (!ok) throw new Error('SALES_ORDER_NOT_SHAREABLE');

  const raw = await getERPNextClient().getSalesOrder(orderName);
  const caption = raw
    ? buildSalesOrderShareCaption(raw as Record<string, unknown>, orderName)
    : orderName;

  const ch = await resolveRavenChannelForSupplierShare({
    sessionEmail: opts.sessionEmail,
    peerUserId,
  });
  if (!ch) throw new Error('Could not open chat with this supplier.');

  await shareSalesOrderInRavenChat(ch, orderName, caption);
  await markSalesOrderSharedLocally(orderName);
  return { channelId: ch, peerUserId, workspaceId };
}

/** Post a Sales Order doc-link message in a Raven channel. */
export async function shareSalesOrderInRavenChat(
  channelId: string,
  orderName: string,
  caption?: string,
  opts?: { t?: TFunction; navigation?: { navigate: (name: string, params?: object) => void } }
): Promise<void> {
  const chId = channelId.trim();
  const doc = orderName.trim();
  if (!chId || !doc) throw new Error('Missing channel or order.');

  if (opts?.t) {
    const ok = await confirmSalesOrderShareable(doc, opts.t, opts.navigation);
    if (!ok) return;
  } else {
    await getERPNextClient().assertSalesOrderShareable(doc);
  }

  const cap = (caption || doc).trim();
  let sentRaw = await sendRavenChannelDocumentLinkMessage(chId, {
    linkDoctype: 'Sales Order',
    linkDocument: doc,
    caption: cap,
  });
  if (sentRaw != null && typeof sentRaw === 'object' && !Array.isArray(sentRaw)) {
    sentRaw = {
      ...(sentRaw as Record<string, unknown>),
      link_doctype: 'Sales Order',
      link_document: doc,
    };
  }
  setPendingRavenDocLinkMessageMerge(chId, sentRaw);
}
