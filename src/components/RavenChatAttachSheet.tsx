import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RavenLight } from '../constants/ravenLightTheme';
import { useTranslation } from 'react-i18next';
import { RavenBottomSheetShell } from './RavenBottomSheetShell';

export type RavenChatAttachOption = {
  id: string;
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** When set, shown in the circle instead of an Ionicon (e.g. emoji). */
  emoji?: string;
  onPress: () => void;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  options: RavenChatAttachOption[];
  /** Sheet heading — defaults to attach title. */
  title?: string;
};

/** Bottom attach menu — Raven-style action rows. */
export const RavenChatAttachSheet = React.memo(function RavenChatAttachSheet({
  visible,
  onClose,
  options,
  title,
}: Props) {
  const { t } = useTranslation();
  const sheetTitle = title?.trim() || t('ravenAttach.title');

  const run = (opt: RavenChatAttachOption) => {
    onClose();
    requestAnimationFrame(() => {
      opt.onPress();
    });
  };

  return (
    <RavenBottomSheetShell visible={visible} onClose={onClose} title={sheetTitle}>
      {options.map((opt) => (
        <Pressable
          key={opt.id}
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => run(opt)}
          accessibilityRole="button"
          accessibilityLabel={opt.label}
        >
          <View style={styles.iconWrap}>
            {opt.emoji ? (
              <Text style={styles.emojiIcon}>{opt.emoji}</Text>
            ) : (
              <Ionicons name={opt.icon ?? 'ellipse-outline'} size={20} color={RavenLight.accent} />
            )}
          </View>
          <Text style={styles.rowLabel}>{opt.label}</Text>
        </Pressable>
      ))}
      <Pressable
        style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={t('ravenAttach.cancel')}
      >
        <Text style={styles.cancelText}>{t('ravenAttach.cancel')}</Text>
      </Pressable>
    </RavenBottomSheetShell>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 6,
    borderRadius: RavenLight.radiusMd,
    gap: 12,
  },
  rowPressed: {
    backgroundColor: RavenLight.sidebarHover,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: RavenLight.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: RavenLight.text,
  },
  cancelBtn: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: RavenLight.radiusMd,
    backgroundColor: RavenLight.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
  },
  cancelBtnPressed: { opacity: 0.85 },
  cancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: RavenLight.text,
  },
  emojiIcon: {
    fontSize: 22,
    lineHeight: 26,
  },
});
