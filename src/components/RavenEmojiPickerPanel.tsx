import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RavenLight } from '../constants/ravenLightTheme';
import { RAVEN_PICKER_EMOJIS, RAVEN_QUICK_EMOJIS } from '../utils/ravenMessageReactions';

const GRID_COLUMNS = 8;

type Props = {
  onPick: (emoji: string) => void;
  /** Show quick-reaction strip above the full grid (Raven hover toolbar style). */
  showQuickStrip?: boolean;
  onClose?: () => void;
};

/** Raven-style emoji grid — quick strip + scrollable picker. */
export const RavenEmojiPickerPanel: React.FC<Props> = ({
  onPick,
  showQuickStrip = true,
  onClose,
}) => {
  const gridEmojis = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const e of [...RAVEN_QUICK_EMOJIS, ...RAVEN_PICKER_EMOJIS]) {
      if (seen.has(e)) continue;
      seen.add(e);
      list.push(e);
    }
    return list;
  }, []);

  const rows = useMemo(() => {
    const out: string[][] = [];
    for (let i = 0; i < gridEmojis.length; i += GRID_COLUMNS) {
      out.push(gridEmojis.slice(i, i + GRID_COLUMNS));
    }
    return out;
  }, [gridEmojis]);

  return (
    <View style={styles.wrap}>
      {showQuickStrip ? (
        <View style={styles.quickBar}>
          {RAVEN_QUICK_EMOJIS.map((emoji) => (
            <Pressable
              key={`quick-${emoji}`}
              onPress={() => onPick(emoji)}
              style={({ pressed }) => [styles.quickBtn, pressed && styles.btnPressed]}
              accessibilityRole="button"
              accessibilityLabel={`React with ${emoji}`}
            >
              <Text style={styles.quickEmoji}>{emoji}</Text>
            </Pressable>
          ))}
          {onClose ? (
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.moreBtn, pressed && styles.btnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Close emoji picker"
            >
              <Ionicons name="close" size={18} color={RavenLight.textMuted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <ScrollView
        style={styles.gridScroll}
        contentContainerStyle={styles.gridContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {rows.map((row, rowIdx) => (
          <View key={`row-${rowIdx}`} style={styles.gridRow}>
            {row.map((emoji) => (
              <Pressable
                key={emoji}
                onPress={() => onPick(emoji)}
                style={({ pressed }) => [styles.gridCell, pressed && styles.btnPressed]}
                accessibilityRole="button"
                accessibilityLabel={emoji}
              >
                <Text style={styles.gridEmoji}>{emoji}</Text>
              </Pressable>
            ))}
            {row.length < GRID_COLUMNS
              ? Array.from({ length: GRID_COLUMNS - row.length }).map((_, i) => (
                  <View key={`pad-${rowIdx}-${i}`} style={styles.gridCellPad} />
                ))
              : null}
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

const CELL = 40;

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
  },
  quickBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 4,
    marginBottom: 8,
    borderRadius: RavenLight.radiusMd,
    backgroundColor: RavenLight.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
  },
  quickBtn: {
    width: CELL,
    height: CELL,
    borderRadius: RavenLight.radiusMd,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreBtn: {
    width: CELL,
    height: CELL,
    borderRadius: RavenLight.radiusMd,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 'auto',
    backgroundColor: RavenLight.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
  },
  quickEmoji: {
    fontSize: 22,
    lineHeight: 26,
  },
  gridScroll: {
    maxHeight: 260,
  },
  gridContent: {
    paddingBottom: 4,
  },
  gridRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  gridCell: {
    flex: 1,
    height: CELL + 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  gridCellPad: {
    flex: 1,
    height: CELL + 4,
  },
  gridEmoji: {
    fontSize: 26,
    lineHeight: 30,
  },
  btnPressed: {
    backgroundColor: RavenLight.sidebarHover,
    opacity: 0.9,
  },
});
