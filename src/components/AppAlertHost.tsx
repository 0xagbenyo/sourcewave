import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { bindAppAlert, type AppAlertButton } from '../services/appAlert';

type AlertState = {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AppAlertButton[];
};

const DEFAULT_BUTTON: AppAlertButton = { text: 'OK', style: 'default' };

export const AppAlertHost: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<AlertState>({
    visible: false,
    title: '',
    message: '',
    buttons: [DEFAULT_BUTTON],
  });

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, visible: false }));
  }, []);

  const show = useCallback((title: string, message?: string, buttons?: AppAlertButton[]) => {
    setState({
      visible: true,
      title,
      message,
      buttons: buttons && buttons.length > 0 ? buttons : [DEFAULT_BUTTON],
    });
  }, []);

  useEffect(() => {
    bindAppAlert(show);
    return () => bindAppAlert(null);
  }, [show]);

  const useRowButtons = state.buttons.length === 2;

  const modalButtons = useMemo(() => {
    return state.buttons.map((button, index) => {
      const label = button.text?.trim() || 'OK';
      const isDestructive = button.style === 'destructive';
      const isCancel = button.style === 'cancel';
      return (
        <TouchableOpacity
          key={`${label}-${index}`}
          style={[
            styles.button,
            useRowButtons ? styles.buttonRowItem : index > 0 && styles.buttonGap,
            isCancel && styles.buttonSecondary,
            isDestructive && styles.buttonDestructive,
          ]}
          activeOpacity={0.85}
          onPress={() => {
            close();
            setTimeout(() => button.onPress?.(), 0);
          }}
        >
          <Text
            style={[
              styles.buttonText,
              isCancel && styles.buttonTextSecondary,
              isDestructive && styles.buttonTextDestructive,
            ]}
          >
            {label}
          </Text>
        </TouchableOpacity>
      );
    });
  }, [close, state.buttons, useRowButtons]);

  return (
    <Modal
      transparent
      animationType="fade"
      visible={state.visible}
      onRequestClose={close}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View style={styles.overlay}>
        <View style={[styles.card, { marginTop: insets.top + 48, marginBottom: Math.max(insets.bottom, 24) }]}>
          <Text style={styles.title}>{state.title}</Text>
          {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
          <View style={[styles.buttons, useRowButtons && styles.buttonsRow]}>{modalButtons}</View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(12, 27, 51, 0.28)',
    justifyContent: 'center',
    paddingHorizontal: Spacing.LG,
  },
  card: {
    backgroundColor: Colors.WHITE,
    borderRadius: Spacing.BORDER_RADIUS_XL,
    padding: Spacing.LG,
    ...Spacing.SHADOW_LG,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    color: Colors.BRAND_NAVY,
  },
  message: {
    marginTop: Spacing.SM,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.DARK_GRAY,
  },
  buttons: {
    marginTop: Spacing.LG,
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: Spacing.SM,
  },
  buttonRowItem: {
    flex: 1,
  },
  button: {
    minHeight: 48,
    borderRadius: Spacing.BORDER_RADIUS_LG,
    backgroundColor: Colors.WINE,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.LG,
  },
  buttonGap: {
    marginTop: Spacing.SM,
  },
  buttonSecondary: {
    backgroundColor: Colors.BRAND_SOFT,
  },
  buttonDestructive: {
    backgroundColor: '#FFF0F0',
  },
  buttonText: {
    color: Colors.WHITE,
    fontSize: 16,
    fontWeight: '700',
  },
  buttonTextSecondary: {
    color: Colors.WINE,
  },
  buttonTextDestructive: {
    color: Colors.ERROR,
  },
});
