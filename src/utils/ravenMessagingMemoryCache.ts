/**
 * Short-lived in-memory cache for open chat threads (same app session).
 * Avoids blank/loading flashes when switching back to a conversation.
 */
import {
  ravenMessageRowSortTimeMs,
  type RavenMessageRow,
} from '../services/ravenNativeApi';

/** Drop memory entries after this long without reuse. */
export const RAVEN_MEMORY_CACHE_TTL_MS = 10 * 60 * 1000;

/** When revisiting within this window, show cache immediately and refresh in the background. */
export const RAVEN_MEMORY_REVALIDATE_MS = 45 * 1000;

export type RavenChannelMessagesMemoryEntry = {
  messages: RavenMessageRow[];
  hasMoreOlder: boolean;
  fetchedAt: number;
};

const memoryByKey = new Map<string, RavenChannelMessagesMemoryEntry>();

function normalizeUserKey(email: string | undefined | null): string {
  return (email || '').trim().toLowerCase().replace(/[^a-z0-9@._+-]/gi, '_') || 'anon';
}

function memoryKey(userEmail: string | undefined | null, channelId: string): string {
  const ch = channelId.trim();
  if (!ch) return '';
  return `${normalizeUserKey(userEmail)}::${ch}`;
}

export function getRavenChannelMessagesMemoryCache(
  userEmail: string | undefined | null,
  channelId: string
): RavenChannelMessagesMemoryEntry | null {
  const key = memoryKey(userEmail, channelId);
  if (!key) return null;
  const entry = memoryByKey.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > RAVEN_MEMORY_CACHE_TTL_MS) {
    memoryByKey.delete(key);
    return null;
  }
  return entry;
}

export function setRavenChannelMessagesMemoryCache(
  userEmail: string | undefined | null,
  channelId: string,
  messages: RavenMessageRow[],
  hasMoreOlder: boolean
): void {
  const key = memoryKey(userEmail, channelId);
  if (!key || messages.length === 0) return;
  memoryByKey.set(key, {
    messages: [...messages],
    hasMoreOlder,
    fetchedAt: Date.now(),
  });
}

export function clearRavenChannelMessagesMemoryCache(): void {
  memoryByKey.clear();
}

/** First page from a persisted disk snapshot — do not paint the entire local cache at once. */
export function ravenCachedMessagesFirstPage(
  cached: RavenMessageRow[] | null | undefined,
  pageSize: number
): { rows: RavenMessageRow[]; hasMoreOlder: boolean } {
  if (!cached?.length || pageSize <= 0) {
    return { rows: [], hasMoreOlder: false };
  }
  const sorted = [...cached].sort((a, b) => ravenMessageRowSortTimeMs(b) - ravenMessageRowSortTimeMs(a));
  return {
    rows: sorted.slice(0, pageSize),
    hasMoreOlder: sorted.length > pageSize,
  };
}

/** Merge a fresh newest-first API page with older rows already loaded via scroll. */
export function mergeFreshFirstPageWithOlderInState(
  fresh: RavenMessageRow[],
  prev: RavenMessageRow[]
): RavenMessageRow[] {
  const sortFn = (a: RavenMessageRow, b: RavenMessageRow) =>
    ravenMessageRowSortTimeMs(b) - ravenMessageRowSortTimeMs(a);
  const sortedFresh = [...fresh].sort(sortFn);
  if (!prev.length) return sortedFresh;
  if (!sortedFresh.length) return [...prev].sort(sortFn);

  const freshSet = new Set(
    sortedFresh.map((m) => (m.name || '').trim()).filter((n) => n.length > 0)
  );
  const oldestInFresh = sortedFresh[sortedFresh.length - 1];
  const boundaryMs = ravenMessageRowSortTimeMs(oldestInFresh);
  const preservedOlder = prev.filter((m) => {
    const n = (m.name || '').trim();
    if (!n || freshSet.has(n)) return false;
    return ravenMessageRowSortTimeMs(m) < boundaryMs;
  });
  return [...sortedFresh, ...preservedOlder].sort(sortFn);
}
