import {
  fetchChannelMessagesAroundBaseMessage,
  listAllNewerMessagesForChannel,
  listMessagesForChannel,
  listOlderMessagesForChannel,
  ravenMessageRowSortTimeMs,
  ravenRefreshMessagesPreservingDocLinks,
  type RavenMessageRow,
} from '../services/ravenNativeApi';
import {
  getRavenChannelMessagesSnapshot,
  mergeCachedChannelMessagesWithFreshFirstPage,
  setRavenChannelMessagesSnapshot,
} from './ravenMessagingLocalCache';
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

function newestLocalMessageId(rows: RavenMessageRow[]): string {
  if (!rows.length) return '';
  const sorted = sortRavenMessagesNewestFirst(rows);
  return String(sorted[0]?.name || '').trim();
}

function oldestLocalMessageId(rows: RavenMessageRow[]): string {
  if (!rows.length) return '';
  const sorted = sortRavenMessagesNewestFirst(rows);
  return String(sorted[sorted.length - 1]?.name || '').trim();
}

function mergeIncrementalNewMessages(
  channelId: string,
  prev: RavenMessageRow[],
  newer: RavenMessageRow[]
): RavenMessageRow[] {
  if (!newer.length) return withPending(channelId, prev);
  const byName = new Map<string, RavenMessageRow>();
  for (const row of prev) {
    const id = String(row.name || '').trim();
    if (id) byName.set(id, row);
  }
  for (const row of newer) {
    const id = String(row.name || '').trim();
    if (id) byName.set(id, row);
  }
  return withPending(channelId, sortRavenMessagesNewestFirst([...byName.values()]));
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

/** Incremental fetch: only messages newer than the newest row on this device. */
async function fetchIncrementalFromLocalAnchor(
  channelId: string,
  pageSize: number,
  prev: RavenMessageRow[],
  localHasMoreOlder: boolean
): Promise<ChannelMessagesPaint | null> {
  const anchor = newestLocalMessageId(prev);
  if (!anchor) return null;

  const newer = await listAllNewerMessagesForChannel(channelId, anchor, pageSize);
  const messages = mergeIncrementalNewMessages(channelId, prev, newer);
  return {
    messages,
    hasMoreOlder: localHasMoreOlder,
  };
}

/** Fetch newest page from ERPNext and merge with scroll-loaded older rows in `prev`. */
export async function fetchChannelMessagesFirstPage(
  channelId: string,
  pageSize: number,
  prev: RavenMessageRow[],
  opts: {
    silent: boolean;
    userEmail?: string | null;
    localHasMoreOlder?: boolean;
    forceFullFetch?: boolean;
  }
): Promise<ChannelMessagesPaint> {
  const cid = channelId.trim();
  const localHasMoreOlder = opts.localHasMoreOlder ?? prev.length > pageSize;

  if (!opts.forceFullFetch && prev.length > 0) {
    try {
      const incremental = await fetchIncrementalFromLocalAnchor(cid, pageSize, prev, localHasMoreOlder);
      if (incremental) {
        if (opts.userEmail) {
          void setRavenChannelMessagesSnapshot(opts.userEmail, cid, incremental.messages);
        }
        return incremental;
      }
    } catch {
      /* fall through to full first-page fetch */
    }
  }

  const rows = await listMessagesForChannel(cid, pageSize);
  let rowsMerged = mergeRavenMessagesWithPendingDocInsert(cid, rows);

  if (!opts.silent && opts.userEmail && prev.length === 0) {
    const cached = await getRavenChannelMessagesSnapshot(opts.userEmail, cid);
    rowsMerged = mergeCachedChannelMessagesWithFreshFirstPage(rowsMerged, cached);
  }

  let result: ChannelMessagesPaint;

  if (opts.silent) {
    const messages = mergeSilentRefresh(cid, rowsMerged, prev);
    const hasMoreOlder =
      localHasMoreOlder ||
      prev.some((m) => {
        const n = (m.name || '').trim();
        return n && !rowsMerged.some((r) => (r.name || '').trim() === n);
      });
    result = { messages, hasMoreOlder };
  } else {
    const messages = withPending(cid, mergeFreshFirstPageWithOlderInState(rowsMerged, prev));
    result = {
      messages,
      hasMoreOlder: localHasMoreOlder || rowsMerged.length >= pageSize || messages.length > rowsMerged.length,
    };
  }

  if (opts.userEmail) {
    void setRavenChannelMessagesSnapshot(opts.userEmail, cid, result.messages);
  }

  return result;
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
  const anchor = newestLocalMessageId(prev);
  let messages: RavenMessageRow[];
  let hasMoreOlder = prev.length > pageSize;

  if (anchor) {
    try {
      let rows = await listAllNewerMessagesForChannel(cid, anchor, pageSize);
      rows = patchRows(rows);
      if (rows.length > 0) {
        messages = mergeIncrementalNewMessages(cid, prev, rows);
      } else {
        let fallback = await listMessagesForChannel(cid, pageSize);
        fallback = patchRows(fallback);
        const rowsMerged = mergeRavenMessagesWithPendingDocInsert(cid, fallback);
        messages = withPending(cid, mergeFreshFirstPageWithOlderInState(rowsMerged, prev));
        hasMoreOlder = rowsMerged.length >= pageSize || messages.length > rowsMerged.length;
      }
    } catch {
      let rows = await listMessagesForChannel(cid, pageSize);
      rows = patchRows(rows);
      const rowsMerged = mergeRavenMessagesWithPendingDocInsert(cid, rows);
      messages = withPending(cid, mergeFreshFirstPageWithOlderInState(rowsMerged, prev));
      hasMoreOlder = rowsMerged.length >= pageSize || messages.length > rowsMerged.length;
    }
  } else {
    let rows = await listMessagesForChannel(cid, pageSize);
    rows = patchRows(rows);
    const rowsMerged = mergeRavenMessagesWithPendingDocInsert(cid, rows);
    messages = withPending(cid, mergeFreshFirstPageWithOlderInState(rowsMerged, prev));
    hasMoreOlder = rowsMerged.length >= pageSize || messages.length > rowsMerged.length;
  }

  const result = { messages, hasMoreOlder };
  saveChannelMessagesMemoryCache(userEmail, cid, result.messages, result.hasMoreOlder);
  void setRavenChannelMessagesSnapshot(userEmail, cid, result.messages);
  return result;
}

export async function fetchChannelOlderMessagesPage(
  channelId: string,
  pageSize: number,
  prev: RavenMessageRow[],
  userEmail?: string | null
): Promise<ChannelMessagesPaint | null> {
  const cid = channelId.trim();
  const fromOldest = oldestLocalMessageId(prev);

  let olderMerged: RavenMessageRow[] = [];
  let hasMoreOlder = false;

  if (fromOldest) {
    try {
      const { messages, hasMoreOlder: more } = await listOlderMessagesForChannel(cid, fromOldest, pageSize);
      olderMerged = mergeRavenMessagesWithPendingDocInsert(cid, messages);
      hasMoreOlder = more;
    } catch {
      const start = prev.length;
      const older = await listMessagesForChannel(cid, pageSize, { limitStart: start });
      olderMerged = mergeRavenMessagesWithPendingDocInsert(cid, older);
      hasMoreOlder = olderMerged.length >= pageSize;
    }
  } else {
    const older = await listMessagesForChannel(cid, pageSize, { limitStart: prev.length });
    olderMerged = mergeRavenMessagesWithPendingDocInsert(cid, older);
    hasMoreOlder = olderMerged.length >= pageSize;
  }

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
  const result = { messages, hasMoreOlder };
  if (userEmail) {
    void setRavenChannelMessagesSnapshot(userEmail, cid, result.messages);
  }
  return result;
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
