/**
 * Local snapshots: global inbox, per-workspace channel list, per-channel messages (offline-first paint).
 * Keyed by user email; cleared on logout via `clearRavenMessagingLocalCache`.
 */
import { appStorage } from '../services/appStorage';
import {
  ravenMessageRowSortTimeMs,
  type RavenChannelRow,
  type RavenMessageRow,
} from '../services/ravenNativeApi';

const INBOX_KEY_PREFIX = '@raven_inbox_snap_v1_';
const CHAN_MSG_KEY_PREFIX = '@raven_chan_msgs_v1_';
const WS_CHANNELS_KEY_PREFIX = '@raven_ws_chans_v1_';
const MAX_INBOX_ROWS = 220;
/** Newest N messages persisted per channel; older rows are dropped from disk (scroll loads more from ERPNext). */
export const RAVEN_LOCAL_CHANNEL_MESSAGES_CAP = 200;

export type RavenCachedGlobalInboxRow = {
  key: string;
  workspaceId: string;
  workspaceLabel: string;
  workspaceLogo?: string | null;
  channel: RavenChannelRow;
  preview: string;
  timeLabel: string;
  timeMs: number;
  hasMessages: boolean;
};

function normalizeUserKey(email: string | undefined | null): string {
  return (email || '').trim().toLowerCase().replace(/[^a-z0-9@._+-]/gi, '_') || 'anon';
}

function inboxStorageKey(userEmail: string | undefined | null): string {
  return `${INBOX_KEY_PREFIX}${normalizeUserKey(userEmail)}`;
}

function channelMessagesStorageKey(userEmail: string | undefined | null, channelId: string): string {
  const ch = channelId.trim().replace(/[^a-z0-9._-]/gi, '_') || 'unknown';
  return `${CHAN_MSG_KEY_PREFIX}${normalizeUserKey(userEmail)}_${ch}`;
}

function workspaceChannelsStorageKey(userEmail: string | undefined | null, workspaceId: string): string {
  const ws = workspaceId.trim().replace(/[^a-z0-9._-]/gi, '_') || 'unknown';
  return `${WS_CHANNELS_KEY_PREFIX}${normalizeUserKey(userEmail)}_${ws}`;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function parseChannelRow(raw: unknown): RavenChannelRow | null {
  if (!isPlainObject(raw)) return null;
  const name = String(raw.name || '').trim();
  if (!name) return null;
  return raw as RavenChannelRow;
}

function parseInboxRow(raw: unknown): RavenCachedGlobalInboxRow | null {
  if (!isPlainObject(raw)) return null;
  const ch = parseChannelRow(raw.channel);
  if (!ch) return null;
  const key = String(raw.key || '').trim() || ch.name;
  const workspaceId = String(raw.workspaceId || '').trim();
  const workspaceLabel = String(raw.workspaceLabel || '').trim();
  const preview = String(raw.preview ?? '');
  const timeLabel = String(raw.timeLabel ?? '');
  const timeMs = typeof raw.timeMs === 'number' && Number.isFinite(raw.timeMs) ? raw.timeMs : 0;
  const hasMessages = raw.hasMessages === true || raw.hasMessages === 1;
  const workspaceLogo =
    raw.workspaceLogo == null ? null : String(raw.workspaceLogo).trim() || null;
  return {
    key,
    workspaceId: workspaceId || ch.name,
    workspaceLabel: workspaceLabel || workspaceId || 'Supplier group',
    workspaceLogo,
    channel: ch,
    preview,
    timeLabel,
    timeMs,
    hasMessages,
  };
}

export async function getRavenGlobalInboxSnapshot(
  userEmail: string | undefined | null
): Promise<RavenCachedGlobalInboxRow[] | null> {
  try {
    const raw = await appStorage.getItem(inboxStorageKey(userEmail));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainObject(parsed)) return null;
    const rowsRaw = parsed.rows;
    if (!Array.isArray(rowsRaw)) return null;
    const rows: RavenCachedGlobalInboxRow[] = [];
    for (const item of rowsRaw) {
      const row = parseInboxRow(item);
      if (row) rows.push(row);
    }
    return rows.length > 0 ? rows : null;
  } catch {
    return null;
  }
}

export async function setRavenGlobalInboxSnapshot(
  userEmail: string | undefined | null,
  rows: RavenCachedGlobalInboxRow[]
): Promise<void> {
  const key = inboxStorageKey(userEmail);
  try {
    if (!normalizeUserKey(userEmail) || normalizeUserKey(userEmail) === 'anon') {
      return;
    }
    if (rows.length === 0) {
      await appStorage.removeItem(key);
      return;
    }
    const slice = rows.slice(0, MAX_INBOX_ROWS);
    await appStorage.setItem(
      key,
      JSON.stringify({
        v: 1,
        savedAt: Date.now(),
        rows: slice,
      })
    );
  } catch {
    /* ignore */
  }
}

export async function getRavenChannelMessagesSnapshot(
  userEmail: string | undefined | null,
  channelId: string
): Promise<RavenMessageRow[] | null> {
  const cid = channelId.trim();
  if (!cid) return null;
  try {
    const raw = await appStorage.getItem(channelMessagesStorageKey(userEmail, cid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainObject(parsed)) return null;
    const arr = parsed.messages;
    if (!Array.isArray(arr)) return null;
    const out: RavenMessageRow[] = [];
    for (const m of arr) {
      if (!isPlainObject(m)) continue;
      const name = String(m.name || '').trim();
      if (!name) continue;
      out.push(m as RavenMessageRow);
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/**
 * Merge the newest page from ERPNext with older rows still only on disk, so opening a thread does not
 * shrink a deep local cache down to the first API page until the user scrolls for more from the server.
 */
export function mergeCachedChannelMessagesWithFreshFirstPage(
  fresh: RavenMessageRow[],
  cached: RavenMessageRow[] | null | undefined
): RavenMessageRow[] {
  const sortFn = (a: RavenMessageRow, b: RavenMessageRow) => ravenMessageRowSortTimeMs(b) - ravenMessageRowSortTimeMs(a);
  const sortedFresh = [...fresh].sort(sortFn);
  if (!cached?.length) return sortedFresh;
  if (sortedFresh.length === 0) {
    return [...cached].sort(sortFn);
  }
  const freshSet = new Set(sortedFresh.map((m) => (m.name || '').trim()).filter((n) => n.length > 0));
  const oldestInFresh = sortedFresh[sortedFresh.length - 1];
  const boundaryMs = ravenMessageRowSortTimeMs(oldestInFresh);
  const preserved = cached.filter((m) => {
    const n = (m.name || '').trim();
    if (!n || freshSet.has(n)) return false;
    return ravenMessageRowSortTimeMs(m) < boundaryMs;
  });
  return [...sortedFresh, ...preserved].sort(sortFn);
}

export async function setRavenChannelMessagesSnapshot(
  userEmail: string | undefined | null,
  channelId: string,
  messages: RavenMessageRow[]
): Promise<void> {
  const cid = channelId.trim();
  if (!cid || !normalizeUserKey(userEmail) || normalizeUserKey(userEmail) === 'anon') return;
  try {
    const sorted = [...messages].sort((a, b) => ravenMessageRowSortTimeMs(b) - ravenMessageRowSortTimeMs(a));
    const slice = sorted.slice(0, RAVEN_LOCAL_CHANNEL_MESSAGES_CAP);
    await appStorage.setItem(
      channelMessagesStorageKey(userEmail, cid),
      JSON.stringify({
        v: 1,
        channelId: cid,
        savedAt: Date.now(),
        messages: slice,
      })
    );
  } catch {
    /* ignore */
  }
}

const MAX_WORKSPACE_CHANNELS_SNAPSHOT = 500;

export async function getRavenWorkspaceChannelsSnapshot(
  userEmail: string | undefined | null,
  workspaceId: string
): Promise<RavenChannelRow[] | null> {
  const wid = workspaceId.trim();
  if (!wid) return null;
  try {
    const raw = await appStorage.getItem(workspaceChannelsStorageKey(userEmail, wid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isPlainObject(parsed)) return null;
    const arr = parsed.channels;
    if (!Array.isArray(arr)) return null;
    const out: RavenChannelRow[] = [];
    for (const c of arr) {
      if (!isPlainObject(c)) continue;
      const name = String(c.name || '').trim();
      if (!name) continue;
      out.push(c as RavenChannelRow);
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export async function setRavenWorkspaceChannelsSnapshot(
  userEmail: string | undefined | null,
  workspaceId: string,
  channels: RavenChannelRow[]
): Promise<void> {
  const wid = workspaceId.trim();
  if (!wid || !normalizeUserKey(userEmail) || normalizeUserKey(userEmail) === 'anon') return;
  try {
    const slice = channels.slice(0, MAX_WORKSPACE_CHANNELS_SNAPSHOT);
    await appStorage.setItem(
      workspaceChannelsStorageKey(userEmail, wid),
      JSON.stringify({
        v: 1,
        workspaceId: wid,
        savedAt: Date.now(),
        channels: slice,
      })
    );
  } catch {
    /* ignore */
  }
}

/** Remove inbox + all per-channel message snapshots for this user (call on logout). */
export async function clearRavenMessagingLocalCache(userEmail: string | undefined | null): Promise<void> {
  const userKey = normalizeUserKey(userEmail);
  const inboxKey = `${INBOX_KEY_PREFIX}${userKey}`;
  const msgPrefix = `${CHAN_MSG_KEY_PREFIX}${userKey}_`;
  const wsChanPrefix = `${WS_CHANNELS_KEY_PREFIX}${userKey}_`;
  try {
    const keys = await appStorage.getAllKeys();
    const toRemove = keys.filter(
      (k) => k === inboxKey || k.startsWith(msgPrefix) || k.startsWith(wsChanPrefix)
    );
    await Promise.all(toRemove.map((k) => appStorage.removeItem(k)));
  } catch {
    /* ignore */
  }
}
