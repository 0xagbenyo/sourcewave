import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { hasFrappeRavenSession, ravenCallFrappeMethod } from './frappeRavenSession';

const PUSH_TOKEN_KEY = '@sourcewave/raven_push_token';
const PUSH_ENABLED_KEY = '@sourcewave/push_enabled';

export async function isPushEnabledLocally(): Promise<boolean> {
  const value = await AsyncStorage.getItem(PUSH_ENABLED_KEY);
  return value !== 'false';
}

export async function setPushEnabledLocally(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(PUSH_ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('raven-chat', {
    name: 'Team chat',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1B5FD6',
  });
}

export async function requestNotificationPermissions(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  const next = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return next.granted === true;
}

/** Native FCM/APNs token preferred; Expo push token is a fallback for dev builds. */
export async function getNativePushToken(): Promise<string | null> {
  await ensureNotificationChannels();
  const granted = await requestNotificationPermissions();
  if (!granted) return null;

  try {
    const native = await Notifications.getDevicePushTokenAsync();
    const token = String(native?.data || '').trim();
    if (token) return token;
  } catch {
    /* production EAS builds should provide a native token */
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
  if (!projectId) return null;

  try {
    const expo = await Notifications.getExpoPushTokenAsync({ projectId });
    return String(expo.data || '').trim() || null;
  } catch {
    return null;
  }
}

export async function subscribeRavenPushToken(token: string): Promise<void> {
  if (!hasFrappeRavenSession()) return;
  await ravenCallFrappeMethod('raven.api.notification.subscribe', {
    fcm_token: token,
    environment: 'Mobile',
    device_information: Platform.OS,
  });
  await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
}

export async function unsubscribeRavenPushToken(token?: string): Promise<void> {
  const stored = String(token || (await AsyncStorage.getItem(PUSH_TOKEN_KEY)) || '').trim();
  if (!stored) return;
  if (hasFrappeRavenSession()) {
    try {
      await ravenCallFrappeMethod('raven.api.notification.unsubscribe', {
        fcm_token: stored,
      });
    } catch {
      /* ignore logout / network errors */
    }
  }
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
}

export async function registerRavenPushNotifications(): Promise<boolean> {
  if (!(await isPushEnabledLocally())) return false;
  if (!hasFrappeRavenSession()) return false;

  const token = await getNativePushToken();
  if (!token) return false;

  const previous = String((await AsyncStorage.getItem(PUSH_TOKEN_KEY)) || '').trim();
  if (previous && previous !== token) {
    await unsubscribeRavenPushToken(previous);
  }

  await subscribeRavenPushToken(token);
  return true;
}

export async function disableRavenPushNotifications(): Promise<void> {
  await setPushEnabledLocally(false);
  await unsubscribeRavenPushToken();
}

export async function enableRavenPushNotifications(): Promise<boolean> {
  await setPushEnabledLocally(true);
  return registerRavenPushNotifications();
}
