import type { RavenChannelRow } from '../services/ravenNativeApi';

export function isTruthy(v: unknown): boolean {
  return v === true || v === 1 || v === '1';
}

export function isDmChannel(c: RavenChannelRow | null | undefined): boolean {
  if (!c) return false;
  if (isTruthy(c.is_direct_message)) return true;
  const t = (c.type || '').toLowerCase();
  return t.includes('direct') || t.includes('dm');
}

/** Two-letter initials from email or display name. */
export function initialsFromUserId(id: string): string {
  const s = id.trim();
  if (!s) return '?';
  if (s.includes('@')) {
    const local = s.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
    if (local.length >= 2) return `${local[0]}${local[1]}`.toUpperCase();
    if (local.length === 1) return `${local[0]}${local[0]}`.toUpperCase();
  }
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase() || '?';
  }
  return s.slice(0, 2).toUpperCase() || '?';
}

const PASTEL_AVATAR_BG = ['#5AC8FA', '#98D8C8', '#C7B8EA', '#FFB366', '#FF8FA3', '#7DD3C0', '#B8E0D2', '#FFD6A5'] as const;

export function pastelAvatarBg(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h + seed.charCodeAt(i) * 17) % 997;
  return PASTEL_AVATAR_BG[h % PASTEL_AVATAR_BG.length];
}

/** Parse Frappe / Raven ISO datetimes (`YYYY-MM-DD HH:mm:ss` or ISO with `T`). */
export function parseRavenDateTime(iso?: string | null): Date | null {
  if (!iso) return null;
  try {
    let normalized = String(iso).trim();
    if (!normalized) return null;
    if (!normalized.includes('T')) {
      normalized = normalized.replace(/^(\d{4}-\d{2}-\d{2})[ ](.+)$/, '$1T$2');
    }
    const d = new Date(normalized);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Sent time for chat UI — never use `modified` (edits would shift day separators / labels). */
export function ravenMessageCreatedAt(message?: {
  creation?: string | null;
  modified?: string | null;
} | null): string {
  const created = String(message?.creation ?? '').trim();
  if (created) return created;
  return String(message?.modified ?? '').trim();
}

export function isSameCalendarDay(a?: string | null, b?: string | null): boolean {
  const da = parseRavenDateTime(a);
  const db = parseRavenDateTime(b);
  if (!da || !db) return false;
  return startOfLocalDay(da).getTime() === startOfLocalDay(db).getTime();
}

function formatLocalTime(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
}

function daysAgoFromToday(d: Date): number {
  const today = startOfLocalDay(new Date());
  const then = startOfLocalDay(d);
  return Math.round((today.getTime() - then.getTime()) / 86_400_000);
}

/** Inbox / list timestamps — compact, with date when not today. */
export function formatMessageHeaderTime(iso?: string): string {
  const d = parseRavenDateTime(iso);
  if (!d) return '';
  const daysAgo = daysAgoFromToday(d);
  if (daysAgo === 0) return formatLocalTime(d);
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo > 1 && daysAgo < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'short' });
  }
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Raven `DateTooltip` / bubble header — time only (`h:mm A`). */
export function formatMessageBubbleTime(iso?: string, options?: { compact?: boolean }): string {
  const d = parseRavenDateTime(String(iso ?? '').split('.')[0]);
  if (!d) return '';
  if (options?.compact) {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: false });
  }
  return formatLocalTime(d);
}

/** Raven `useChatStream` date blocks — `Do MMMM YYYY` (e.g. "28th June 2026"). */
export function formatChatDateSeparator(iso?: string): string {
  const d = parseRavenDateTime(iso);
  if (!d) return '';
  const month = d.toLocaleString(undefined, { month: 'long' });
  return `${dayOrdinalEn(d.getDate())} ${month} ${d.getFullYear()}`;
}

function ravenMessageDateKey(iso?: string | null): string {
  const raw = String(iso ?? '').trim();
  if (!raw) return '';
  const spaceIdx = raw.indexOf(' ');
  if (spaceIdx > 0) return raw.slice(0, spaceIdx);
  const tIdx = raw.indexOf('T');
  return tIdx > 0 ? raw.slice(0, tIdx) : raw;
}

/**
 * Raven `useChatStream`: one date separator at the oldest loaded message per calendar day.
 * Messages array is newest-first (inverted FlatList).
 */
export function shouldShowChatDateSeparator(
  index: number,
  messages: { creation?: string | null; modified?: string | null }[]
): boolean {
  if (!messages[index]) return false;
  const dateKey = ravenMessageDateKey(ravenMessageCreatedAt(messages[index]));
  if (!dateKey) return false;
  for (let j = index + 1; j < messages.length; j++) {
    if (ravenMessageDateKey(ravenMessageCreatedAt(messages[j])) === dateKey) {
      return false;
    }
  }
  return true;
}

type RavenMessageSenderFields = {
  owner?: string | null;
  bot?: string | null;
  is_bot_message?: number | boolean | null;
  message_type?: string | null;
};

/** Sender key aligned with Raven web (`owner`, bot messages, System). */
export function ravenMessageSenderKey(message?: RavenMessageSenderFields | null): string | null {
  if (!message) return null;
  if (String(message.message_type ?? '').toLowerCase() === 'system') return null;
  if (isTruthy(message.is_bot_message)) {
    const bot = String(message.bot ?? '').trim();
    if (bot) return bot;
  }
  const owner = String(message.owner ?? '').trim();
  return owner || null;
}

const RAVEN_MESSAGE_GROUP_MS = 120_000;

/**
 * Raven `is_continuation`: same sender as the next-older message (index + 1) within 2 minutes.
 */
export function isRavenMessageContinuation(
  index: number,
  messages: Array<RavenMessageSenderFields & { creation?: string | null; modified?: string | null }>
): boolean {
  if (index >= messages.length - 1) return false;
  const message = messages[index];
  const older = messages[index + 1];
  const senderA = ravenMessageSenderKey(message);
  const senderB = ravenMessageSenderKey(older);
  if (!senderA || !senderB || senderA !== senderB) return false;

  const tA = parseRavenDateTime(ravenMessageCreatedAt(message).split('.')[0])?.getTime();
  const tB = parseRavenDateTime(ravenMessageCreatedAt(older).split('.')[0])?.getTime();
  if (tA == null || tB == null) return false;
  return tA - tB <= RAVEN_MESSAGE_GROUP_MS;
}

/** Hide avatar/name when Raven would set `is_continuation`. */
export function shouldShowChatMessageSenderHeader(
  index: number,
  messages: Array<RavenMessageSenderFields & { creation?: string | null; modified?: string | null }>,
  _sameOwner?: (a: { owner?: string }, b: { owner?: string }) => boolean
): boolean {
  return !isRavenMessageContinuation(index, messages);
}

/** Tighter vertical spacing when the newer neighbor (index - 1) continues this row. */
export function isChatMessageGroupedWithNewer(
  index: number,
  messages: Array<RavenMessageSenderFields & { creation?: string | null; modified?: string | null }>,
  _sameOwner?: (a: { owner?: string }, b: { owner?: string }) => boolean
): boolean {
  if (index <= 0) return false;
  return isRavenMessageContinuation(index - 1, messages);
}

function dayOrdinalEn(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n}st`;
  if (mod10 === 2 && mod100 !== 12) return `${n}nd`;
  if (mod10 === 3 && mod100 !== 13) return `${n}rd`;
  return `${n}th`;
}

/**
 * Raven-style context line for quoted replies: "7th June at 4:41 AM" (used after "Author | …").
 */
export function formatRavenReplyQuotedDateTime(iso?: string): string {
  const d = parseRavenDateTime(iso);
  if (!d) return '';
  const month = d.toLocaleString(undefined, { month: 'long' });
  const time = formatLocalTime(d);
  return `${dayOrdinalEn(d.getDate())} ${month} at ${time}`;
}

/** Plain text bubble — hide when Raven stored the file name as `text` on attachment rows. */
export function shouldShowChatMessageTextBubble(
  item: {
    text?: string | null;
    file?: string | null;
    file_thumbnail?: string | null;
    message_type?: string | null;
  },
  hasAttach: boolean,
  hasStructuredContent: boolean
): boolean {
  if (!item.text?.trim()) return false;
  if (hasStructuredContent) return false;
  if (hasAttach) return false;
  return true;
}
