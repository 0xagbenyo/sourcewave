import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Linking, Platform } from 'react-native';
import {
  hasFrappeRavenSession,
  ravenCallFrappeMethod,
  tryRestoreFrappeRavenSession,
} from './frappeRavenSession';
import { getErpNextUrl } from '../constants/env';

const LOG = '[ravenPush]';
const PUSH_TOKEN_KEY = '@sourcewave/raven_push_token';
const PUSH_ENABLED_KEY = '@sourcewave/push_enabled';

export type PushRegistrationResult = {
  ok: boolean;
  token: string | null;
  nativeFcm: boolean;
  ravenSubscribed: boolean;
  relaySubscribed: boolean;
};

export type PushPermissionStatus = 'granted' | 'denied' | 'undetermined';

export type PushSetupStatus = {
  permission: PushPermissionStatus;
  registered: boolean;
  enabledLocally: boolean;
};

let lastRegistration: PushRegistrationResult | null = null;
let registrationInFlight: Promise<PushRegistrationResult> | null = null;
let backgroundRegistrationTimer: ReturnType<typeof setInterval> | null = null;

const SESSION_WAIT_MS = 20_000;
const SESSION_POLL_MS = 400;

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

/** Wait until the logged-in Frappe cookie session exists (needed before Raven subscribe). */
export async function waitForFrappeRavenSession(timeoutMs = SESSION_WAIT_MS): Promise<boolean> {
  if (hasFrappeRavenSession()) return true;

  const baseUrl = getErpNextUrl();
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await tryRestoreFrappeRavenSession(baseUrl)) return true;
    if (hasFrappeRavenSession()) return true;
    await new Promise((resolve) => setTimeout(resolve, SESSION_POLL_MS));
  }
  return hasFrappeRavenSession();
}

/** Push token for ERPNext + Expo Push relay (Server Script). Prefers Expo token when EAS project is set. */
export async function getNativePushToken(): Promise<string | null> {
  await ensureNotificationChannels();
  const granted = await requestNotificationPermissions();
  if (!granted) return null;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as { easConfig?: { projectId?: string } }).easConfig?.projectId;

  if (projectId) {
    try {
      const expo = await Notifications.getExpoPushTokenAsync({ projectId });
      const token = String(expo.data || '').trim();
      if (token) return token;
    } catch (error) {
      if (__DEV__) console.warn(LOG, 'Expo push token unavailable', error);
    }
  }

  try {
    const native = await Notifications.getDevicePushTokenAsync();
    const token = String(native?.data || '').trim();
    if (token) return token;
  } catch (error) {
    if (__DEV__) console.warn(LOG, 'native push token unavailable', error);
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

/** Frappe Cloud push relay — not used when delivery goes through Expo Server Script. */
async function subscribeFrappePushRelay(_token: string): Promise<void> {
  /* no-op: frappe.push_notification.subscribe is not permitted for portal users on Frappe Cloud */
}

async function unsubscribeFrappePushRelay(_token: string): Promise<void> {
  /* no-op: avoid 403 noise; Raven Push Token rows are managed via raven.api.notification.* */
}

async function unsubscribeRavenPushToken(token: string): Promise<void> {
  if (!hasFrappeRavenSession()) return;
  await ravenCallFrappeMethod('raven.api.notification.unsubscribe', {
    fcm_token: token,
  });
}

export async function registerRavenPushNotifications(): Promise<PushRegistrationResult> {
  if (registrationInFlight) return registrationInFlight;

  registrationInFlight = registerRavenPushNotificationsInternal().finally(() => {
    registrationInFlight = null;
  });
  return registrationInFlight;
}

async function registerRavenPushNotificationsInternal(): Promise<PushRegistrationResult> {
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

  if (
    previous === token &&
    lastRegistration?.token === token &&
    lastRegistration.ravenSubscribed &&
    lastRegistration.nativeFcm === nativeFcm
  ) {
    return lastRegistration;
  }

  if (previous && previous !== token) {
    await unsubscribeRavenPushToken(previous).catch(() => {});
    await unsubscribeFrappePushRelay(previous);
  }

  let ravenSubscribed = false;
  let relaySubscribed = false;

  // Always (re)subscribe — local AsyncStorage can hold a token while ERPNext has no row
  // (e.g. app restart, failed prior subscribe, or token row deleted on server).
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
    ok: ravenSubscribed && Boolean(token),
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
  stopBackgroundPushRegistration();
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

/** Wait for session + permission, then register. Retries until success or attempts exhausted. */
export async function ensureRavenPushRegistered(opts?: {
  requestPermission?: boolean;
  maxAttempts?: number;
}): Promise<PushRegistrationResult> {
  const maxAttempts = opts?.maxAttempts ?? 8;
  const empty: PushRegistrationResult = {
    ok: false,
    token: null,
    nativeFcm: false,
    ravenSubscribed: false,
    relaySubscribed: false,
  };

  if (!(await isPushEnabledLocally())) {
    return empty;
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const sessionReady = await waitForFrappeRavenSession();
    if (!sessionReady) {
      await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
      continue;
    }

    if (opts?.requestPermission !== false) {
      await ensureNotificationChannels();
      const granted = await requestNotificationPermissions();
      if (!granted) {
        return empty;
      }
    }

    const result = await registerRavenPushNotifications();
    if (result.ok || result.ravenSubscribed) {
      stopBackgroundPushRegistration();
      return result;
    }

    await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)));
  }

  return getLastPushRegistration() ?? empty;
}

/** Retry registration in the background until ERPNext has the token row. */
export function startBackgroundPushRegistration(): void {
  if (backgroundRegistrationTimer) return;

  void ensureRavenPushRegistered();

  backgroundRegistrationTimer = setInterval(() => {
    const last = getLastPushRegistration();
    if (last?.ok) {
      stopBackgroundPushRegistration();
      return;
    }
    void ensureRavenPushRegistered({ requestPermission: false });
  }, 30_000);
}

export function stopBackgroundPushRegistration(): void {
  if (!backgroundRegistrationTimer) return;
  clearInterval(backgroundRegistrationTimer);
  backgroundRegistrationTimer = null;
}

export async function getPushSetupStatus(): Promise<PushSetupStatus> {
  const perm = await Notifications.getPermissionsAsync();
  const permission: PushPermissionStatus = perm.granted
    ? 'granted'
    : perm.canAskAgain === false
      ? 'denied'
      : 'undetermined';
  const last = getLastPushRegistration();
  const enabledLocally = await isPushEnabledLocally();

  return {
    permission,
    registered: last?.ok === true,
    enabledLocally,
  };
}

/** Request permission, register with Raven, and open system settings when blocked. */
export async function promptEnablePushNotifications(): Promise<boolean> {
  await setPushEnabledLocally(true);
  const result = await ensureRavenPushRegistered();
  if (result.ok || result.ravenSubscribed) return true;

  const perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain === false) {
    await Linking.openSettings();
  }
  return false;
}
