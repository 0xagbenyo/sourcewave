import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Linking,
  StyleProp,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useTranslation } from 'react-i18next';
import { Colors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { appAlert as Alert } from '../services/appAlert';
import {
  getPushSetupStatus,
  promptEnablePushNotifications,
  type PushSetupStatus,
} from '../services/ravenPushNotifications';

type Props = {
  style?: StyleProp<ViewStyle>;
  onEnabled?: () => void;
};

export function EnablePushNotificationsBanner({ style, onEnabled }: Props) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PushSetupStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const next = await getPushSetupStatus();
    setStatus(next);
    return next;
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh])
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  const needsSetup =
    status &&
    (status.permission !== 'granted' || !status.registered || !status.enabledLocally);

  const onPress = async () => {
    if (status?.permission === 'denied') {
      await Linking.openSettings();
      return;
    }

    setLoading(true);
    try {
      const ok = await promptEnablePushNotifications();
      const next = await refresh();
      if (ok || next.registered) {
        onEnabled?.();
        return;
      }
      Alert.alert(t('settings.push'), t('settings.pushEnableFailed'));
    } catch {
      Alert.alert(t('settings.push'), t('settings.pushEnableFailed'));
    } finally {
      setLoading(false);
    }
  };

  if (!needsSetup) return null;

  const blocked = status?.permission === 'denied';
  const buttonLabel = blocked
    ? t('pushNotifications.openSettings')
    : t('pushNotifications.allowButton');

  return (
    <View style={[styles.card, style]}>
      <View style={styles.iconWrap}>
        <Ionicons name="notifications-outline" size={22} color={Colors.WINE} />
      </View>
      <View style={styles.body}>
        <Text style={styles.title}>{t('pushNotifications.bannerTitle')}</Text>
        <Text style={styles.subtitle}>
          {blocked
            ? t('pushNotifications.permissionDeniedHint')
            : t('pushNotifications.bannerBody')}
        </Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => void onPress()}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator size="small" color={Colors.WHITE} />
          ) : (
            <>
              <Ionicons
                name={blocked ? 'settings-outline' : 'notifications'}
                size={18}
                color={Colors.WHITE}
                style={styles.buttonIcon}
              />
              <Text style={styles.buttonText}>{buttonLabel}</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: Spacing.SCREEN_PADDING,
    marginTop: Spacing.MD,
    marginBottom: Spacing.SM,
    padding: Spacing.MD,
    backgroundColor: Colors.BRAND_SOFT,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.WINE_LIGHT,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.WHITE,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.BRAND_NAVY,
    letterSpacing: -0.2,
  },
  subtitle: {
    fontSize: 13,
    color: Colors.TEXT_SECONDARY,
    marginTop: 4,
    lineHeight: 18,
    fontWeight: '500',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: Colors.WINE,
    borderRadius: 8,
    minHeight: 40,
    minWidth: 160,
  },
  buttonIcon: {
    marginRight: 6,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.WHITE,
  },
});
