import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RavenLight } from '../constants/ravenLightTheme';
import { bindAppAlert, type AppAlertButton, type AppAlertTone } from '../services/appAlert';

type AlertState = {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AppAlertButton[];
  tone: AppAlertTone;
};

const DEFAULT_BUTTON: AppAlertButton = { text: 'OK', style: 'default' };

type ToneVisual = {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconColor: string;
  iconBg: string;
};

function toneVisual(tone: AppAlertTone): ToneVisual {
  if (tone === 'error') {
    return {
      icon: 'alert-circle',
      iconColor: RavenLight.danger,
      iconBg: '#FFF0F0',
    };
  }
  if (tone === 'success') {
    return {
      icon: 'checkmark-circle',
      iconColor: RavenLight.success,
      iconBg: '#E8F8EF',
    };
  }
  return {
    icon: 'information-circle',
    iconColor: RavenLight.accent,
    iconBg: RavenLight.accentSoft,
  };
}

export const AppAlertHost: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<AlertState>({
    visible: false,
    title: '',
    message: '',
    buttons: [DEFAULT_BUTTON],
    tone: 'default',
  });

  const close = useCallback(() => {
    setState((prev) => ({ ...prev, visible: false }));
  }, []);

  const show = useCallback(
    (title: string, message?: string, buttons?: AppAlertButton[], tone: AppAlertTone = 'default') => {
      setState({
        visible: true,
        title,
        message,
        buttons: buttons && buttons.length > 0 ? buttons : [DEFAULT_BUTTON],
        tone,
      });
    },
    []
  );

  useEffect(() => {
    bindAppAlert(show);
    return () => bindAppAlert(null);
  }, [show]);

  const visual = toneVisual(state.tone);
  const useRowButtons = state.buttons.length === 2;
  const dismissOnBackdrop =
    state.buttons.length <= 1 && !state.buttons.some((b) => b.style === 'destructive');

  const onButtonPress = useCallback(
    (button: AppAlertButton) => {
      close();
      setTimeout(() => button.onPress?.(), 0);
    },
    [close]
  );

  const modalButtons = useMemo(() => {
    return state.buttons.map((button, index) => {
      const label = button.text?.trim() || 'OK';
      const isDestructive = button.style === 'destructive';
      const isCancel = button.style === 'cancel';
      const isLast = index === state.buttons.length - 1;

      let labelStyle = styles.actionLabelPrimary;
      if (isCancel) labelStyle = styles.actionLabelMuted;
      if (isDestructive) labelStyle = styles.actionLabelDanger;

      const rowDivider = useRowButtons && index === 0 ? styles.actionRowDivider : null;
      const stackDivider = !useRowButtons && index > 0 ? styles.actionStackDivider : null;

      return (
        <Pressable
          key={`${label}-${index}`}
          style={({ pressed }) => [
            styles.actionBtn,
            useRowButtons ? styles.actionBtnRow : styles.actionBtnStack,
            pressed && styles.actionBtnPressed,
            rowDivider,
            stackDivider,
            isLast && !useRowButtons && styles.actionBtnStackLast,
          ]}
          onPress={() => onButtonPress(button)}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Text style={[styles.actionLabel, labelStyle]}>{label}</Text>
        </Pressable>
      );
    });
  }, [onButtonPress, state.buttons, useRowButtons]);

  return (
    <Modal
      transparent
      animationType="fade"
      visible={state.visible}
      onRequestClose={close}
      statusBarTranslucent
      presentationStyle="overFullScreen"
    >
      <View
        style={[
          styles.root,
          {
            paddingTop: insets.top + 24,
            paddingBottom: Math.max(insets.bottom, 20),
          },
        ]}
      >
        <Pressable
          style={styles.backdrop}
          onPress={dismissOnBackdrop ? close : undefined}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
        />

        <View style={styles.card}>
          <View style={styles.body}>
            <View style={[styles.iconWrap, { backgroundColor: visual.iconBg }]}>
              <Ionicons name={visual.icon} size={22} color={visual.iconColor} />
            </View>
            <Text style={styles.title}>{state.title}</Text>
            {state.message ? <Text style={styles.message}>{state.message}</Text> : null}
          </View>

          <View style={[styles.actions, useRowButtons ? styles.actionsRow : styles.actionsStack]}>
            {modalButtons}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const cardShadow: StyleProp<ViewStyle> = Platform.select({
  ios: {
    shadowColor: RavenLight.shadowMedium,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 24,
  },
  android: { elevation: 6 },
  default: {},
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 32, 36, 0.38)',
  },
  card: {
    backgroundColor: RavenLight.panel,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: RavenLight.border,
    overflow: 'hidden',
    maxWidth: 360,
    width: '100%',
    alignSelf: 'center',
    ...cardShadow,
  },
  body: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 20,
    alignItems: 'center',
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: RavenLight.text,
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  message: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
    color: RavenLight.textMuted,
    textAlign: 'center',
  },
  actions: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: RavenLight.border,
    backgroundColor: RavenLight.bg,
  },
  actionsRow: {
    flexDirection: 'row',
  },
  actionsStack: {
    flexDirection: 'column',
  },
  actionBtn: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  actionBtnRow: {
    flex: 1,
  },
  actionBtnStack: {
    width: '100%',
  },
  actionBtnStackLast: {},
  actionBtnPressed: {
    backgroundColor: RavenLight.sidebarHover,
  },
  actionRowDivider: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: RavenLight.border,
  },
  actionStackDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: RavenLight.border,
  },
  actionLabel: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  actionLabelPrimary: {
    color: RavenLight.accent,
    fontWeight: '700',
  },
  actionLabelMuted: {
    color: RavenLight.textMuted,
  },
  actionLabelDanger: {
    color: RavenLight.danger,
    fontWeight: '700',
  },
});
