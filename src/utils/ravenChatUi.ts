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

/** Message bubble timestamp — always includes date when not today. */
export function formatMessageBubbleTime(iso?: string): string {
  const d = parseRavenDateTime(iso);
  if (!d) return '';
  const time = formatLocalTime(d);
  const daysAgo = daysAgoFromToday(d);
  if (daysAgo === 0) return time;
  if (daysAgo === 1) return `Yesterday, ${time}`;
  const now = new Date();
  const datePart =
    d.getFullYear() === now.getFullYear()
      ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${datePart}, ${time}`;
}

/** Centered date pill between message groups in chat. */
export function formatChatDateSeparator(iso?: string): string {
  const d = parseRavenDateTime(iso);
  if (!d) return '';
  const daysAgo = daysAgoFromToday(d);
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  if (daysAgo > 1 && daysAgo < 7) {
    return d.toLocaleDateString(undefined, { weekday: 'long' });
  }
  const now = new Date();
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  }
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

/** True when a date pill should render above this row (newest-first / inverted list). */
export function shouldShowChatDateSeparator(
  index: number,
  messages: { creation?: string; modified?: string }[]
): boolean {
  if (messages.length === 0) return false;

  const isoAt = (i: number) => messages[i]?.creation || messages[i]?.modified;

  if (index > 0 && !isSameCalendarDay(isoAt(index), isoAt(index - 1))) {
    return true;
  }

  // Top of loaded history: show "Today" (etc.) when every loaded message is the same day.
  if (index === messages.length - 1) {
    if (messages.length === 1) return true;
    return isSameCalendarDay(isoAt(0), isoAt(messages.length - 1));
  }

  return false;
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
