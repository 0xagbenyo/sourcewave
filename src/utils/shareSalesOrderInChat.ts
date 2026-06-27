import {
  createDirectMessageChannel,
  getRavenDmPeerUserId,
  listRavenChannelsForSessionUser,
  sendRavenChannelDocumentLinkMessage,
  type RavenChannelRow,
} from '../services/ravenNativeApi';
import { setPendingRavenDocLinkMessageMerge } from './ravenDocLinkMessageMergeBridge';
import { confirmSalesOrderShareable } from './salesOrderShareGuard';
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
