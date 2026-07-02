import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RavenLight } from '../constants/ravenLightTheme';
import { RavenBottomSheetShell } from './RavenBottomSheetShell';
import {
  bindImagePickSourcePrompt,
  type ImagePickSourceChoice,
} from '../services/imagePickSourcePrompt';
import type { ImagePickSourceLabels } from '../utils/formImagePicker';

type OptionRow = {
  id: 'camera' | 'library';
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
};

/** Native camera/library pickers fail if opened while this sheet Modal is still dismissing. */
const PICKER_OPEN_DELAY_MS = Platform.OS === 'ios' ? 520 : 380;

export const ImagePickSourceHost: React.FC = () => {
  const [visible, setVisible] = useState(false);
  const [labels, setLabels] = useState<ImagePickSourceLabels | null>(null);
  const resolverRef = useRef<((choice: ImagePickSourceChoice) => void) | null>(null);
  const pendingChoiceRef = useRef<ImagePickSourceChoice | undefined>(undefined);
  const openTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closingRef = useRef(false);

  const clearOpenTimer = useCallback(() => {
    if (openTimerRef.current) {
      clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  }, []);

  const resolvePendingChoice = useCallback(() => {
    if (pendingChoiceRef.current === undefined) return;
    const choice = pendingChoiceRef.current;
    pendingChoiceRef.current = undefined;
    const resolve = resolverRef.current;
    resolverRef.current = null;
    closingRef.current = false;
    clearOpenTimer();
    openTimerRef.current = setTimeout(() => {
      openTimerRef.current = null;
      setLabels(null);
      if (resolve) resolve(choice);
    }, PICKER_OPEN_DELAY_MS);
  }, [clearOpenTimer]);

  const finish = useCallback((choice: ImagePickSourceChoice) => {
    if (closingRef.current || !resolverRef.current) return;
    closingRef.current = true;
    pendingChoiceRef.current = choice;
    setVisible(false);
  }, []);

  const show = useCallback(
    (nextLabels: ImagePickSourceLabels) => {
      return new Promise<ImagePickSourceChoice>((resolve) => {
        clearOpenTimer();
        closingRef.current = false;
        pendingChoiceRef.current = undefined;
        resolverRef.current = resolve;
        setLabels(nextLabels);
        setVisible(true);
      });
    },
    [clearOpenTimer]
  );

  useEffect(() => {
    bindImagePickSourcePrompt(show);
    return () => bindImagePickSourcePrompt(null);
  }, [show]);

  // iOS: onDismiss on the Modal. Android: visible flips false without onDismiss.
  useEffect(() => {
    if (visible) return;
    resolvePendingChoice();
    return clearOpenTimer;
  }, [visible, resolvePendingChoice, clearOpenTimer]);

  useEffect(() => () => clearOpenTimer(), [clearOpenTimer]);

  const title = labels?.title?.trim() || labels?.chooseLibrary || 'Add image';
  const options: OptionRow[] = labels
    ? [
        { id: 'camera', icon: 'camera-outline', label: labels.takePhoto },
        { id: 'library', icon: 'images-outline', label: labels.chooseLibrary },
      ]
    : [];

  return (
    <RavenBottomSheetShell
      visible={visible}
      onClose={() => finish(null)}
      onDismiss={resolvePendingChoice}
      title={title}
    >
      <Pressable onPress={(e) => e.stopPropagation()}>
        <View style={styles.optionsCard}>
          {options.map((opt, index) => (
            <Pressable
              key={opt.id}
              onPress={() => finish(opt.id)}
              style={({ pressed }) => [
                styles.optionRow,
                index > 0 && styles.optionRowBorder,
                pressed && styles.optionRowPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
            >
              <View style={styles.optionIconWrap}>
                <Ionicons name={opt.icon} size={20} color={RavenLight.accent} />
              </View>
              <Text style={styles.optionLabel}>{opt.label}</Text>
              <Ionicons name="chevron-forward" size={18} color={RavenLight.textSubtle} />
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={() => finish(null)}
          style={({ pressed }) => [styles.cancelBtn, pressed && styles.cancelBtnPressed]}
          accessibilityRole="button"
          accessibilityLabel={labels?.cancel || 'Cancel'}
        >
          <Text style={styles.cancelText}>{labels?.cancel || 'Cancel'}</Text>
        </Pressable>
      </Pressable>
    </RavenBottomSheetShell>
  );
};

const styles = StyleSheet.create({
  optionsCard: {
    backgroundColor: RavenLight.bg,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    overflow: 'hidden',
    marginBottom: 10,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 12,
  },
  optionRowBorder: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: RavenLight.border,
  },
  optionRowPressed: {
    backgroundColor: RavenLight.sidebarHover,
  },
  optionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: RavenLight.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: RavenLight.text,
    letterSpacing: -0.1,
  },
  cancelBtn: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: RavenLight.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
  },
  cancelBtnPressed: {
    backgroundColor: RavenLight.sidebarHover,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
    color: RavenLight.textMuted,
  },
});
