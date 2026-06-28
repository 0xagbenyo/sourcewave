import emojiGroupsJson from 'unicode-emoji-json/data-by-group.json';

export const SYSTEM_EMOJI_GRID_COLUMNS = 8;

export type SystemEmojiSection = {
  key: string;
  title: string;
  data: string[][];
};

type EmojiGroupJson = {
  name: string;
  slug: string;
  emojis: { emoji: string }[];
};

let cachedSections: SystemEmojiSection[] | null = null;

/** Unicode emoji groups — rendered with the device system emoji font. */
export function getSystemEmojiSections(): SystemEmojiSection[] {
  if (cachedSections) return cachedSections;
  const groups = emojiGroupsJson as EmojiGroupJson[];
  cachedSections = groups.map((g) => {
    const emojis = g.emojis.map((e) => e.emoji).filter((e) => e.length > 0);
    const rows: string[][] = [];
    for (let i = 0; i < emojis.length; i += SYSTEM_EMOJI_GRID_COLUMNS) {
      rows.push(emojis.slice(i, i + SYSTEM_EMOJI_GRID_COLUMNS));
    }
    return { key: g.slug, title: g.name, data: rows };
  });
  return cachedSections;
}
