import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RavenLight } from '../constants/ravenLightTheme';

type Props = {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Tighter padding for compact toolbars (message actions). */
  compact?: boolean;
};

/** Raven-style bottom sheet — white panel, handle, soft shadow. */
export const RavenBottomSheetShell: React.FC<Props> = ({
  visible,
  onClose,
  title,
  children,
  compact = false,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      hardwareAccelerated
      statusBarTranslucent={false}
      onRequestClose={onClose}
    >
      <View style={styles.root} pointerEvents={visible ? 'auto' : 'none'}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
        <View
          style={[
            styles.sheet,
            compact ? styles.sheetCompact : null,
            { paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          <View style={styles.handle} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {children}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 32, 36, 0.42)',
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
        shadowOffset: { width: 0, height: -6 },
        shadowOpacity: 0.14,
        shadowRadius: 16,
      },
      android: { elevation: 20 },
      default: {},
    }),
  },
  sheetCompact: {
    paddingHorizontal: 12,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: RavenLight.borderStrong,
    marginBottom: 10,
  },
  title: {
    fontSize: 12,
    fontWeight: '700',
    color: RavenLight.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
    paddingHorizontal: 4,
  },
});
