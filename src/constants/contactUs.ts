/** SourceWave support — chat channel, email, and ticket form on Contact us. */
export const SOURCEWAVE_SUPPORT_EMAIL = 'sourcewave88@gmail.com';

/** Raven channel opened from Contact us when the user already has access. */
export const SOURCEWAVE_SUPPORT_CHANNEL_ID = '0i3gsqc8ld';

/** Frappe User.name for support DM when the shared channel is not available. */
export function sourcewaveSupportRavenUserId(): string {
  const raw = String(process.env.EXPO_PUBLIC_SOURCEWAVE_SUPPORT_RAVEN_USER || 'Administrator').trim();
  return raw || 'Administrator';
}

export function sourcewaveSupportChannelId(): string {
  const raw = String(
    process.env.EXPO_PUBLIC_SOURCEWAVE_SUPPORT_RAVEN_CHANNEL || SOURCEWAVE_SUPPORT_CHANNEL_ID
  ).trim();
  return raw || SOURCEWAVE_SUPPORT_CHANNEL_ID;
}

/** Optional Raven workspace document id or display name for the support channel. */
export function sourcewaveSupportWorkspaceId(): string | undefined {
  const raw = String(process.env.EXPO_PUBLIC_SOURCEWAVE_SUPPORT_RAVEN_WORKSPACE || '').trim();
  return raw || undefined;
}

export function sourcewaveSupportMailtoUrl(): string {
  return `mailto:${SOURCEWAVE_SUPPORT_EMAIL}`;
}
