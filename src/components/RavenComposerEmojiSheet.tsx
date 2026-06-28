import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { RavenBottomSheetShell } from './RavenBottomSheetShell';
import { RavenEmojiPickerPanel } from './RavenEmojiPickerPanel';
import { RavenLight } from '../constants/ravenLightTheme';

type Props = {
  visible: boolean;
  onClose: () => void;
  onPick: (emoji: string) => void;
};

/** Insert emoji into the composer — Raven-style emoji grid. */
export const RavenComposerEmojiSheet: React.FC<Props> = ({ visible, onClose, onPick }) => {
  const { t } = useTranslation();

  const handlePick = (emoji: string) => {
    onClose();
    requestAnimationFrame(() => onPick(emoji));
  };

  return (
    <RavenBottomSheetShell visible={visible} onClose={onClose} title={t('ravenAttach.emoji')}>
      <RavenEmojiPickerPanel onPick={handlePick} showQuickStrip />
      <Pressable
        onPress={onClose}
        style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
        accessibilityRole="button"
        accessibilityLabel={t('ravenAttach.cancel')}
      >
        <Text style={styles.cancelText}>{t('ravenAttach.cancel')}</Text>
      </Pressable>
    </RavenBottomSheetShell>
  );
};

const styles = StyleSheet.create({
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
});
