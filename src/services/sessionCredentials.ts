/**
 * Stores Frappe **email + password** for the same origin as ERPNext so the Raven WebView can
 * call `/api/method/login` and receive session cookies before opening Raven.
 *
 * Cleared on logout. Prefer device keystore (expo-secure-store); do not log these values.
 */
import * as SecureStore from 'expo-secure-store';

const LOG = '[sessionCredentials]';

const KEY_EMAIL = 'sourcewave_frappe_web_email';
const KEY_PASSWORD = 'sourcewave_frappe_web_password';

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

async function setSecureItem(key: string, value: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(key, value, {
      ...secureStoreOptions,
      requireAuthentication: true,
    });
  } catch {
    await SecureStore.setItemAsync(key, value, secureStoreOptions);
  }
}

async function getSecureItem(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key, { requireAuthentication: true });
  } catch {
    return SecureStore.getItemAsync(key, secureStoreOptions);
  }
}

export async function saveFrappeWebCredentials(email: string, password: string): Promise<void> {
  const e = email.trim();
  if (!e || !password) {
    if (__DEV__) console.log(LOG, 'save skipped: empty email or password');
    return;
  }
  try {
    await setSecureItem(KEY_EMAIL, e);
    await setSecureItem(KEY_PASSWORD, password);
    if (__DEV__) console.log(LOG, 'saved web credentials for Raven bridge');
  } catch (err) {
    console.warn(LOG, 'save failed', err);
    throw err;
  }
}

export async function getFrappeWebCredentials(): Promise<{ email: string; password: string } | null> {
  try {
    const email = await getSecureItem(KEY_EMAIL);
    const password = await getSecureItem(KEY_PASSWORD);
    if (!email || !password) {
      if (__DEV__) console.log(LOG, 'no stored web credentials');
      return null;
    }
    return { email, password };
  } catch (err) {
    console.warn(LOG, 'get failed', err);
    return null;
  }
}

export async function clearFrappeWebCredentials(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_EMAIL);
  } catch (err) {
    console.warn(LOG, 'clear email key failed', err);
  }
  try {
    await SecureStore.deleteItemAsync(KEY_PASSWORD);
  } catch (err) {
    console.warn(LOG, 'clear password key failed', err);
  }
  if (__DEV__) console.log(LOG, 'cleared web credentials');
}
