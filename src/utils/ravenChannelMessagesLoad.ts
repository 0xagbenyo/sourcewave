import {
  fetchChannelMessagesAroundBaseMessage,
  listMessagesForChannel,
  ravenMessageRowSortTimeMs,
  ravenRefreshMessagesPreservingDocLinks,
  type RavenMessageRow,
} from '../services/ravenNativeApi';
import { getRavenChannelMessagesSnapshot } from './ravenMessagingLocalCache';
import { mergeRavenMessagesWithPendingDocInsert } from './ravenDocLinkMessageMergeBridge';
import {
  getRavenChannelMessagesMemoryCache,
  mergeFreshFirstPageWithOlderInState,
  RAVEN_MEMORY_REVALIDATE_MS,
  ravenCachedMessagesFirstPage,
  setRavenChannelMessagesMemoryCache,
} from './ravenMessagingMemoryCache';

export function sortRavenMessagesNewestFirst(rows: RavenMessageRow[]): RavenMessageRow[] {
  return [...rows].sort((a, b) => ravenMessageRowSortTimeMs(b) - ravenMessageRowSortTimeMs(a));
}

function withPending(channelId: string, rows: RavenMessageRow[]): RavenMessageRow[] {
  return sortRavenMessagesNewestFirst(mergeRavenMessagesWithPendingDocInsert(channelId, rows));
}

export type ChannelMessagesPaint = {
  messages: RavenMessageRow[];
  hasMoreOlder: boolean;
};

/** Synchronous read from in-memory session cache. */
export function readChannelMessagesMemoryPaint(
  userEmail: string | undefined | null,
  channelId: string
): ChannelMessagesPaint | null {
  const mem = getRavenChannelMessagesMemoryCache(userEmail, channelId);
  if (!mem?.messages.length) return null;
  return {
    messages: withPending(channelId, mem.messages),
    hasMoreOlder: mem.hasMoreOlder,
  };
}

export function channelMessagesMemoryIsFresh(
  userEmail: string | undefined | null,
  channelId: string
): boolean {
  const mem = getRavenChannelMessagesMemoryCache(userEmail, channelId);
  if (!mem) return false;
  return Date.now() - mem.fetchedAt < RAVEN_MEMORY_REVALIDATE_MS;
}

/** First page from disk snapshot (not the entire persisted cache). */
export async function readChannelMessagesDiskPaint(
  userEmail: string | undefined | null,
  channelId: string,
  pageSize: number
): Promise<ChannelMessagesPaint | null> {
  const snap = await getRavenChannelMessagesSnapshot(userEmail, channelId);
  const { rows, hasMoreOlder } = ravenCachedMessagesFirstPage(snap, pageSize);
  if (!rows.length) return null;
  return {
    messages: withPending(channelId, rows),
    hasMoreOlder,
  };
}

export function saveChannelMessagesMemoryCache(
  userEmail: string | undefined | null,
  channelId: string,
  messages: RavenMessageRow[],
  hasMoreOlder: boolean
): void {
  setRavenChannelMessagesMemoryCache(userEmail, channelId, messages, hasMoreOlder);
}

function mergeSilentRefresh(
  channelId: string,
  rowsMerged: RavenMessageRow[],
  prev: RavenMessageRow[]
): RavenMessageRow[] {
  const mergedRows = ravenRefreshMessagesPreservingDocLinks(rowsMerged, prev);
  const fresh = new Map(
    mergedRows.map((m) => [(m.name || '').trim(), m] as const).filter(([k]) => k.length > 0)
  );
  const preserved = prev.filter((m) => {
    const n = (m.name || '').trim();
    return n && !fresh.has(n);
  });
  return sortRavenMessagesNewestFirst([...mergedRows, ...preserved]);
}

/** Fetch newest page from ERPNext and merge with scroll-loaded older rows in `prev`. */
export async function fetchChannelMessagesFirstPage(
  channelId: string,
  pageSize: number,
  prev: RavenMessageRow[],
  opts: { silent: boolean }
): Promise<ChannelMessagesPaint> {
  const cid = channelId.trim();
  const rows = await listMessagesForChannel(cid, pageSize);
  const rowsMerged = mergeRavenMessagesWithPendingDocInsert(cid, rows);

  if (opts.silent) {
    const messages = mergeSilentRefresh(cid, rowsMerged, prev);
    const hasMoreOlder =
      messages.length >= pageSize ||
      prev.some((m) => {
        const n = (m.name || '').trim();
        return n && !rowsMerged.some((r) => (r.name || '').trim() === n);
      });
    return { messages, hasMoreOlder };
  }

  const messages = withPending(cid, mergeFreshFirstPageWithOlderInState(rowsMerged, prev));
  return {
    messages,
    hasMoreOlder: rowsMerged.length >= pageSize || messages.length > rowsMerged.length,
  };
}

/** After send/upload: refresh first page while keeping older scroll-loaded rows. */
export async function refreshChannelMessagesAfterSend(
  userEmail: string | undefined | null,
  channelId: string,
  pageSize: number,
  prev: RavenMessageRow[],
  patchRows: (rows: RavenMessageRow[]) => RavenMessageRow[]
): Promise<ChannelMessagesPaint> {
  const cid = channelId.trim();
  let rows = await listMessagesForChannel(cid, pageSize);
  rows = patchRows(rows);
  const rowsMerged = mergeRavenMessagesWithPendingDocInsert(cid, rows);
  const messages = withPending(cid, mergeFreshFirstPageWithOlderInState(rowsMerged, prev));
  const result = {
    messages,
    hasMoreOlder: rowsMerged.length >= pageSize || messages.length > rowsMerged.length,
  };
  saveChannelMessagesMemoryCache(userEmail, cid, result.messages, result.hasMoreOlder);
  return result;
}

export async function fetchChannelOlderMessagesPage(
  channelId: string,
  pageSize: number,
  prev: RavenMessageRow[]
): Promise<ChannelMessagesPaint | null> {
  const cid = channelId.trim();
  const start = prev.length;
  const older = await listMessagesForChannel(cid, pageSize, { limitStart: start });
  const olderMerged = mergeRavenMessagesWithPendingDocInsert(cid, older);
  if (olderMerged.length === 0) {
    return { messages: prev, hasMoreOlder: false };
  }
  const seen = new Set(prev.map((m) => (m.name || '').trim()).filter(Boolean));
  const extra = olderMerged.filter((m) => {
    const n = (m.name || '').trim();
    return n && !seen.has(n);
  });
  if (extra.length === 0) {
    return { messages: prev, hasMoreOlder: false };
  }
  const messages = sortRavenMessagesNewestFirst([...prev, ...extra]);
  return {
    messages,
    hasMoreOlder: olderMerged.length >= pageSize,
  };
}

/** Jump to an in-chat search hit — loads ~20 messages around the target when it is not on the current page. */
export async function fetchChannelMessagesAroundBase(
  channelId: string,
  baseMessageId: string
): Promise<ChannelMessagesPaint> {
  const cid = channelId.trim();
  const { messages, hasMoreOlder } = await fetchChannelMessagesAroundBaseMessage(cid, baseMessageId);
  return {
    messages: withPending(cid, messages),
    hasMoreOlder,
  };
}
