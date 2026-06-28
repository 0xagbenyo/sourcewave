import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  SectionList,
  type SectionListRenderItemInfo,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RavenLight } from '../constants/ravenLightTheme';
import { RAVEN_QUICK_EMOJIS } from '../utils/ravenMessageReactions';
import {
  getSystemEmojiSections,
  SYSTEM_EMOJI_GRID_COLUMNS,
  type SystemEmojiSection,
} from '../utils/systemEmojiList';

type Props = {
  onPick: (emoji: string) => void;
  /** Show quick-reaction strip above the full grid (Raven hover toolbar style). */
  showQuickStrip?: boolean;
  onClose?: () => void;
};

type RowItem = string[];

/** System emoji grid — Unicode set rendered with the device emoji font. */
export const RavenEmojiPickerPanel: React.FC<Props> = ({
  onPick,
  showQuickStrip = true,
  onClose,
}) => {
  const sections = useMemo(() => getSystemEmojiSections(), []);

  const renderRow = ({ item: row, index }: SectionListRenderItemInfo<RowItem, SystemEmojiSection>) => (
    <View style={styles.gridRow}>
      {row.map((emoji) => (
        <Pressable
          key={`${emoji}-${index}`}
          onPress={() => onPick(emoji)}
          style={({ pressed }) => [styles.gridCell, pressed && styles.btnPressed]}
          accessibilityRole="button"
          accessibilityLabel={emoji}
        >
          <Text style={styles.gridEmoji}>{emoji}</Text>
        </Pressable>
      ))}
      {row.length < SYSTEM_EMOJI_GRID_COLUMNS
        ? Array.from({ length: SYSTEM_EMOJI_GRID_COLUMNS - row.length }).map((_, i) => (
            <View key={`pad-${index}-${i}`} style={styles.gridCellPad} />
          ))
        : null}
    </View>
  );

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

      <SectionList
        sections={sections}
        keyExtractor={(row, index) => `${row.join('')}-${index}`}
        renderItem={renderRow}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        style={styles.gridScroll}
        contentContainerStyle={styles.gridContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
        stickySectionHeadersEnabled={false}
        initialNumToRender={12}
        maxToRenderPerBatch={16}
        windowSize={7}
      />
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
    maxHeight: 340,
  },
  gridContent: {
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: RavenLight.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    paddingTop: 10,
    paddingBottom: 6,
    paddingHorizontal: 4,
    backgroundColor: RavenLight.panel,
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
