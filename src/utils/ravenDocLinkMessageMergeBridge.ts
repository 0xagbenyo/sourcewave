/**
 * After posting a linked-document `Raven Message` from the app (e.g. supplier quotation compose),
 * `listMessagesForChannel` can return the new row **without** `link_doctype` / `link_document` while
 * Raven web shows the card (insert / realtime payloads carry links).
 *
 * We **peek** the insert payload on every load and merge until the merged list shows that message with
 * link fields, then **clear** — so overlapping non-silent + silent `loadMessages` calls do not drop
 * the merge (a single `consume` on the first caller used to wipe pending before the second merge).
 *
 * Multiple channels can each have a pending insert (e.g. share one quotation to several chats).
 */
import {
  ravenMergeMessageRowFromSendResponse,
  ravenMessageRowFromFrappeApiPayload,
  type RavenMessageRow,
} from '../services/ravenNativeApi';

const pendingByChannel = new Map<string, unknown>();

export function setPendingRavenDocLinkMessageMerge(channelId: string, insertResponse: unknown): void {
  const cid = channelId.trim();
  if (!cid || insertResponse == null) return;
  pendingByChannel.set(cid, insertResponse);
}

export function peekPendingRavenDocLinkMessageMerge(forChannelId: string): unknown | null {
  const id = forChannelId.trim();
  return pendingByChannel.get(id) ?? null;
}

export function clearPendingRavenDocLinkMessageMerge(forChannelId: string): void {
  pendingByChannel.delete(forChannelId.trim());
}

/**
 * Merge `rows` with any pending insert payload for this channel (peek, do not clear until links show).
 */
export function mergeRavenMessagesWithPendingDocInsert(
  channelId: string,
  rows: RavenMessageRow[]
): RavenMessageRow[] {
  const raw = peekPendingRavenDocLinkMessageMerge(channelId);
  if (!raw) return rows;
  const merged = ravenMergeMessageRowFromSendResponse(rows, raw);
  const sent = ravenMessageRowFromFrappeApiPayload(raw);
  if (sent?.name) {
    const sn = sent.name.trim();
    const hit = merged.find((m) => (m.name || '').trim() === sn);
    if (hit && String(hit.link_doctype || '').trim() && String(hit.link_document || '').trim()) {
      clearPendingRavenDocLinkMessageMerge(channelId);
    }
  }
  return merged;
}
