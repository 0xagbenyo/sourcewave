import React, { useMemo } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { RavenLight } from '../constants/ravenLightTheme';
import { Colors } from '../constants/colors';
import {
  parseRavenMessageReactions,
  RAVEN_QUICK_EMOJIS,
  type RavenReactionObject,
} from '../utils/ravenMessageReactions';

type Props = {
  messageReactions?: string | null;
  currentUserId?: string | null;
  onToggleReaction: (emoji: string) => void;
  variant?: 'wine' | 'raven';
};

function chipStyle(
  reacted: boolean,
  variant: 'wine' | 'raven'
): { bg: string; border: string; text: string } {
  if (reacted) {
    return variant === 'wine'
      ? { bg: Colors.BRAND_SOFT, border: Colors.WINE, text: Colors.WINE }
      : { bg: RavenLight.accentSoft, border: RavenLight.accent, text: RavenLight.accent };
  }
  return {
    bg: '#F4F4F5',
    border: '#E4E4E7',
    text: RavenLight.textMuted,
  };
}

function ReactionChip({
  reaction,
  currentUserId,
  onPress,
  variant,
}: {
  reaction: RavenReactionObject;
  currentUserId?: string | null;
  onPress: () => void;
  variant: 'wine' | 'raven';
}) {
  const uid = String(currentUserId || '').trim();
  const reacted = uid.length > 0 && reaction.users.includes(uid);
  const colors = chipStyle(reacted, variant);
  const emoji = reaction.is_custom ? reaction.emoji_name || '…' : reaction.reaction;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: colors.bg, borderColor: colors.border },
        pressed && styles.chipPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`React with ${emoji}`}
    >
      <Text style={styles.chipEmoji}>{reaction.is_custom ? '✨' : reaction.reaction}</Text>
      <Text style={[styles.chipCount, { color: colors.text }]}>{reaction.count}</Text>
    </Pressable>
  );
}

export const RavenMessageReactionsRow: React.FC<Props> = ({
  messageReactions,
  currentUserId,
  onToggleReaction,
  variant = 'raven',
}) => {
  const reactions = useMemo(() => parseRavenMessageReactions(messageReactions), [messageReactions]);
  if (!reactions.length) return null;

  return (
    <View style={styles.row}>
      {reactions.map((r) => (
        <ReactionChip
          key={`${r.emoji_name || r.reaction}-${r.count}`}
          reaction={r}
          currentUserId={currentUserId}
          variant={variant}
          onPress={() => onToggleReaction(r.reaction)}
        />
      ))}
    </View>
  );
};

export const RavenQuickEmojiRow: React.FC<{
  onPick: (emoji: string) => void;
  variant?: 'wine' | 'raven';
}> = ({ onPick, variant = 'raven' }) => (
  <View style={styles.quickRow}>
    {RAVEN_QUICK_EMOJIS.map((emoji) => (
      <Pressable
        key={emoji}
        onPress={() => onPick(emoji)}
        style={({ pressed }) => [
          styles.quickBtn,
          variant === 'wine' ? styles.quickBtnWine : styles.quickBtnRaven,
          pressed && styles.chipPressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel={`React ${emoji}`}
      >
        <Text style={styles.quickEmoji}>{emoji}</Text>
      </Pressable>
    ))}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipPressed: { opacity: 0.82 },
  chipEmoji: { fontSize: 15, lineHeight: 18 },
  chipCount: { fontSize: 12, fontWeight: '700' },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  quickBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickBtnWine: { backgroundColor: Colors.BRAND_SOFT, borderColor: '#D6E4FF' },
  quickBtnRaven: { backgroundColor: RavenLight.panel, borderColor: RavenLight.border },
  quickEmoji: { fontSize: 22 },
});
