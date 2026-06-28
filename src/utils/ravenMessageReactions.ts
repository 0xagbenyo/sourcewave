/** Raven `message_reactions` JSON — matches Raven web {@link ReactionObject}. */
export type RavenReactionObject = {
  reaction: string;
  users: string[];
  count: number;
  is_custom?: boolean;
  emoji_name?: string;
};

export const RAVEN_QUICK_EMOJIS = ['👍', '✅', '👀', '🎉'] as const;

export const RAVEN_PICKER_EMOJIS = [
  '👍',
  '👎',
  '❤️',
  '🔥',
  '🎉',
  '✅',
  '👀',
  '😂',
  '😮',
  '😢',
  '🙏',
  '💯',
  '✨',
  '🚀',
  '👏',
  '🤔',
] as const;

export function parseRavenMessageReactions(
  raw: string | null | undefined
): RavenReactionObject[] {
  const s = String(raw ?? '').trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s) as Record<string, RavenReactionObject>;
    if (!parsed || typeof parsed !== 'object') return [];
    return Object.entries(parsed).map(([key, value]) => ({
      ...value,
      emoji_name: value.emoji_name || key,
      reaction: value.reaction || key,
      users: Array.isArray(value.users) ? value.users : [],
      count: Number(value.count) || (Array.isArray(value.users) ? value.users.length : 0),
    }));
  } catch {
    return [];
  }
}

/** Optimistic toggle — mirrors Raven web `usePostMessageReaction`. */
export function applyOptimisticRavenReaction(
  raw: string | null | undefined,
  emoji: string,
  currentUserId: string,
  isCustom = false,
  emojiName?: string
): string {
  const uid = String(currentUserId || '').trim();
  const emojiKey = isCustom ? String(emojiName || emoji).trim() : emoji;
  if (!uid || !emojiKey) return String(raw ?? '').trim() || '{}';

  let existing: Record<string, RavenReactionObject> = {};
  try {
    existing = JSON.parse(String(raw ?? '{}')) as Record<string, RavenReactionObject>;
    if (!existing || typeof existing !== 'object') existing = {};
  } catch {
    existing = {};
  }

  if (existing[emojiKey]) {
    const entry = existing[emojiKey];
    const users = Array.isArray(entry.users) ? [...entry.users] : [];
    const hasUser = users.includes(uid);
    if (hasUser) {
      const nextUsers = users.filter((u) => u !== uid);
      if (nextUsers.length === 0) {
        delete existing[emojiKey];
      } else {
        existing[emojiKey] = {
          ...entry,
          users: nextUsers,
          count: nextUsers.length,
        };
      }
    } else {
      users.push(uid);
      existing[emojiKey] = {
        ...entry,
        users,
        count: users.length,
      };
    }
  } else {
    existing[emojiKey] = {
      reaction: emoji,
      users: [uid],
      count: 1,
      is_custom: isCustom || undefined,
      emoji_name: emojiName || '',
    };
  }

  return JSON.stringify(existing);
}

export function ravenMessageIsForwarded(row: { is_forwarded?: number | boolean | null }): boolean {
  const v = row.is_forwarded;
  return v === 1 || v === true || String(v) === '1';
}
