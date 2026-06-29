/** Small helpers shared by Raven search UIs (message previews, channel labels). */

export type RavenUserDisplayProfile = {
  full_name?: string;
};

export type RavenUserDisplayProfiles =
  | Readonly<Record<string, RavenUserDisplayProfile>>
  | ReadonlyMap<string, RavenUserDisplayProfile>;

function lookupRavenUserProfile(
  userId: string,
  profiles?: RavenUserDisplayProfiles
): RavenUserDisplayProfile | undefined {
  if (!profiles) return undefined;
  const t = userId.trim();
  if (!t) return undefined;
  if (profiles instanceof Map) {
    return profiles.get(t) ?? profiles.get(t.toLowerCase());
  }
  return profiles[t] ?? profiles[t.toLowerCase()];
}

/** Fallback label from Frappe `User.name` (email local-part or username). */
export function friendlySenderLabel(owner?: string): string {
  const t = (owner || '').trim();
  if (!t) return 'Unknown';
  if (t.includes('@')) {
    const local = t.split('@')[0];
    if (local) return local.replace(/[._]/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase());
  }
  return t;
}

/** Prefer **Raven User.full_name** (via profile map), then `friendlySenderLabel`. */
export function ravenUserProfileFullName(
  userId?: string | null,
  profiles?: RavenUserDisplayProfiles
): string {
  const fn = lookupRavenUserProfile((userId || '').trim(), profiles)?.full_name;
  return fn != null && String(fn).trim() ? String(fn).trim() : '';
}

/** Prefer **Raven User.full_name** (via profile map), then `friendlySenderLabel`. */
export function resolveRavenUserDisplayName(
  userId?: string | null,
  profiles?: RavenUserDisplayProfiles
): string {
  const t = (userId || '').trim();
  if (!t) return 'Unknown';
  const fromProfile = ravenUserProfileFullName(t, profiles);
  if (fromProfile) return fromProfile;
  return friendlySenderLabel(t);
}

export function replySnippet(text?: string): string {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'Message';
  return t.length > 80 ? `${t.slice(0, 80)}…` : t;
}

export function channelPrefix(type?: string): string {
  const t = (type || '').toLowerCase();
  if (t.includes('direct') || t.includes('dm')) return '';
  if (t.includes('open') || t.includes('public')) return '#';
  return '#';
}
