import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { hasFrappeRavenSession, ravenCallFrappeMethod } from './frappeRavenSession';

const LOG = '[ravenPush]';
const PUSH_TOKEN_KEY = '@sourcewave/raven_push_token';
const PUSH_ENABLED_KEY = '@sourcewave/push_enabled';
const RAVEN_PUSH_PROJECT = 'raven';

export type PushRegistrationResult = {
  ok: boolean;
  token: string | null;
  nativeFcm: boolean;
  ravenSubscribed: boolean;
  relaySubscribed: boolean;
};

let lastRegistration: PushRegistrationResult | null = null;

export function getLastPushRegistration(): PushRegistrationResult | null {
  return lastRegistration;
}

export function isNativeFcmToken(token: string): boolean {
  const t = String(token || '').trim();
  if (!t) return false;
  return !t.startsWith('ExponentPushToken[');
}

export async function isPushEnabledLocally(): Promise<boolean> {
  const value = await AsyncStorage.getItem(PUSH_ENABLED_KEY);
  return value !== 'false';
}

export async function setPushEnabledLocally(enabled: boolean): Promise<void> {
  await AsyncStorage.setItem(PUSH_ENABLED_KEY, enabled ? 'true' : 'false');
}

export async function areRavenPushNotificationsEnabledOnServer(): Promise<boolean> {
  if (!hasFrappeRavenSession()) return false;
  try {
    const data = await ravenCallFrappeMethod('raven.api.notification.are_push_notifications_enabled', {});
    const enabled = data?.message;
    return enabled === true || enabled === 1 || enabled === '1';
  } catch {
    return false;
  }
}

export async function ensureNotificationChannels(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('raven-chat', {
    name: 'Team chat',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#1B5FD6',
  });
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.HIGH,
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

/** Native FCM/APNs token required for Frappe/Raven relay delivery. */
export async function getNativePushToken(): Promise<string | null> {
  await ensureNotificationChannels();
  const granted = await requestNotificationPermissions();
  if (!granted) return null;

  try {
    const native = await Notifications.getDevicePushTokenAsync();
    const token = String(native?.data || '').trim();
    if (token) return token;
  } catch (error) {
    if (__DEV__) console.warn(LOG, 'native push token unavailable', error);
  }

  if (__DEV__) {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;
    if (projectId) {
      try {
        const expo = await Notifications.getExpoPushTokenAsync({ projectId });
        const token = String(expo.data || '').trim();
        if (token) {
          console.warn(LOG, 'using Expo push token — Frappe relay will not deliver; add google-services.json');
          return token;
        }
      } catch {
        /* ignore */
      }
    }
  }

  return null;
}

async function subscribeRavenPushToken(token: string): Promise<void> {
  if (!hasFrappeRavenSession()) return;
  await ravenCallFrappeMethod('raven.api.notification.subscribe', {
    fcm_token: token,
    environment: 'Mobile',
    device_information: Platform.OS,
  });
}

/** Registers the device token with Frappe Cloud push relay (required for delivery). */
async function subscribeFrappePushRelay(token: string): Promise<void> {
  if (!hasFrappeRavenSession()) return;
  await ravenCallFrappeMethod('frappe.push_notification.subscribe', {
    fcm_token: token,
    project_name: RAVEN_PUSH_PROJECT,
  });
}

async function unsubscribeRavenPushToken(token: string): Promise<void> {
  if (!hasFrappeRavenSession()) return;
  await ravenCallFrappeMethod('raven.api.notification.unsubscribe', {
    fcm_token: token,
  });
}

async function unsubscribeFrappePushRelay(token: string): Promise<void> {
  if (!hasFrappeRavenSession()) return;
  try {
    await ravenCallFrappeMethod('frappe.push_notification.unsubscribe', {
      fcm_token: token,
      project_name: RAVEN_PUSH_PROJECT,
    });
  } catch {
    /* older Frappe versions may not expose this */
  }
}

export async function registerRavenPushNotifications(): Promise<PushRegistrationResult> {
  const empty: PushRegistrationResult = {
    ok: false,
    token: null,
    nativeFcm: false,
    ravenSubscribed: false,
    relaySubscribed: false,
  };

  if (!(await isPushEnabledLocally())) {
    lastRegistration = empty;
    return empty;
  }
  if (!hasFrappeRavenSession()) {
    lastRegistration = empty;
    return empty;
  }

  const token = await getNativePushToken();
  if (!token) {
    lastRegistration = empty;
    return empty;
  }

  const nativeFcm = isNativeFcmToken(token);
  const previous = String((await AsyncStorage.getItem(PUSH_TOKEN_KEY)) || '').trim();
  if (previous && previous !== token) {
    await unsubscribeRavenPushToken(previous);
    await unsubscribeFrappePushRelay(previous);
  }

  let ravenSubscribed = false;
  let relaySubscribed = false;

  try {
    await subscribeRavenPushToken(token);
    ravenSubscribed = true;
  } catch (error) {
    console.warn(LOG, 'Raven token subscribe failed', error);
  }

  if (nativeFcm) {
    try {
      await subscribeFrappePushRelay(token);
      relaySubscribed = true;
    } catch (error) {
      console.warn(LOG, 'Frappe relay subscribe failed', error);
    }
  }

  if (ravenSubscribed) {
    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
  }

  const result: PushRegistrationResult = {
    ok: ravenSubscribed && nativeFcm && relaySubscribed,
    token,
    nativeFcm,
    ravenSubscribed,
    relaySubscribed,
  };
  lastRegistration = result;

  if (__DEV__) {
    console.log(LOG, 'registration', result);
  }

  return result;
}

export async function disableRavenPushNotifications(): Promise<void> {
  const stored = String((await AsyncStorage.getItem(PUSH_TOKEN_KEY)) || '').trim();
  await setPushEnabledLocally(false);
  if (stored) {
    await unsubscribeRavenPushToken(stored).catch(() => {});
    await unsubscribeFrappePushRelay(stored).catch(() => {});
  }
  await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
  lastRegistration = null;
}

export async function enableRavenPushNotifications(): Promise<boolean> {
  await setPushEnabledLocally(true);
  const result = await registerRavenPushNotifications();
  return result.ok || result.ravenSubscribed;
}
