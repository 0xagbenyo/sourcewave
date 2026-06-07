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

export function formatMessageHeaderTime(iso?: string): string {
  if (!iso) return '';
  try {
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch {
    return '';
  }
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
  if (!iso) return '';
  try {
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T'));
    if (Number.isNaN(d.getTime())) return '';
    const month = d.toLocaleString(undefined, { month: 'long' });
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
    return `${dayOrdinalEn(d.getDate())} ${month} at ${time}`;
  } catch {
    return '';
  }
}
