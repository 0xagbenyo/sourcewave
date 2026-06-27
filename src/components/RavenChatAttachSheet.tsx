import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { RavenLight } from '../constants/ravenLightTheme';
import { useTranslation } from 'react-i18next';

export type RavenChatAttachOption = {
  id: string;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  options: RavenChatAttachOption[];
};

/** Bottom attach menu — Modal stays mounted so toggling `visible` is instant. */
export const RavenChatAttachSheet = React.memo(function RavenChatAttachSheet({
  visible,
  onClose,
  options,
}: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const run = (opt: RavenChatAttachOption) => {
    onClose();
    requestAnimationFrame(() => {
      opt.onPress();
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      hardwareAccelerated
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <View style={styles.root} pointerEvents={visible ? 'auto' : 'none'}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('ravenAttach.cancel')} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{t('ravenAttach.title')}</Text>
          {options.map((opt) => (
            <TouchableOpacity
              key={opt.id}
              style={styles.row}
              onPress={() => run(opt)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={opt.icon} size={22} color={RavenLight.accent} />
              </View>
              <Text style={styles.rowLabel}>{opt.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={RavenLight.textSubtle} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onClose}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('ravenAttach.cancel')}
          >
            <Text style={styles.cancelText}>{t('ravenAttach.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: RavenLight.panel,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 8,
    paddingHorizontal: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
      },
      android: { elevation: 16 },
      default: {},
    }),
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: RavenLight.border,
    marginBottom: 12,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: RavenLight.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: RavenLight.border,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: RavenLight.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
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
    borderRadius: 12,
    backgroundColor: RavenLight.canvas,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '700',
    color: RavenLight.text,
  },
});
