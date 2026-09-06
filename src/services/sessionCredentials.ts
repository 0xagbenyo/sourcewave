/**
 * Stores Frappe **email + password** for the same origin as ERPNext so the Raven WebView can
 * call `/api/method/login` and receive session cookies before opening Raven.
 *
 * Cleared on logout. Prefer device keystore (expo-secure-store); do not log these values.
 *
 * Credentials are kept in a **single** SecureStore entry so Face ID / fingerprint is only
 * requested once per unlock (not once per field).
 */
import * as SecureStore from 'expo-secure-store';

const LOG = '[sessionCredentials]';

const KEY_CREDS = 'sourcewave_frappe_web_creds_v1';
/** @deprecated Migrated into {@link KEY_CREDS}. */
const KEY_EMAIL_LEGACY = 'sourcewave_frappe_web_email';
/** @deprecated Migrated into {@link KEY_CREDS}. */
const KEY_PASSWORD_LEGACY = 'sourcewave_frappe_web_password';

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

type StoredCreds = { email: string; password: string };

let memoryCreds: StoredCreds | null = null;
let loadPromise: Promise<StoredCreds | null> | null = null;

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

function parseStoredCreds(raw: string | null): StoredCreds | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredCreds;
    const email = String(parsed?.email ?? '').trim();
    const password = String(parsed?.password ?? '');
    if (!email || !password) return null;
    return { email, password };
  } catch {
    return null;
  }
}

async function loadFromSecureStore(): Promise<StoredCreds | null> {
  const bundled = parseStoredCreds(await getSecureItem(KEY_CREDS));
  if (bundled) return bundled;

  const email = await getSecureItem(KEY_EMAIL_LEGACY);
  const password = await getSecureItem(KEY_PASSWORD_LEGACY);
  if (!email || !password) {
    if (__DEV__) console.log(LOG, 'no stored web credentials');
    return null;
  }

  const legacy = { email, password };
  await persistToSecureStore(legacy);
  return legacy;
}

async function persistToSecureStore(creds: StoredCreds): Promise<void> {
  await setSecureItem(KEY_CREDS, JSON.stringify(creds));
  await SecureStore.deleteItemAsync(KEY_EMAIL_LEGACY).catch(() => {});
  await SecureStore.deleteItemAsync(KEY_PASSWORD_LEGACY).catch(() => {});
}

export async function saveFrappeWebCredentials(email: string, password: string): Promise<void> {
  const e = email.trim();
  if (!e || !password) {
    if (__DEV__) console.log(LOG, 'save skipped: empty email or password');
    return;
  }
  try {
    const creds = { email: e, password };
    await persistToSecureStore(creds);
    memoryCreds = creds;
    if (__DEV__) console.log(LOG, 'saved web credentials for Raven bridge');
  } catch (err) {
    console.warn(LOG, 'save failed', err);
    throw err;
  }
}

export async function getFrappeWebCredentials(): Promise<StoredCreds | null> {
  if (memoryCreds) return memoryCreds;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const creds = await loadFromSecureStore();
      if (creds) memoryCreds = creds;
      return creds;
    } catch (err) {
      console.warn(LOG, 'get failed', err);
      return null;
    } finally {
      loadPromise = null;
    }
  })();

  return loadPromise;
}

export async function clearFrappeWebCredentials(): Promise<void> {
  memoryCreds = null;
  loadPromise = null;
  try {
    await SecureStore.deleteItemAsync(KEY_CREDS);
  } catch (err) {
    console.warn(LOG, 'clear creds key failed', err);
  }
  try {
    await SecureStore.deleteItemAsync(KEY_EMAIL_LEGACY);
  } catch (err) {
    console.warn(LOG, 'clear email key failed', err);
  }
  try {
    await SecureStore.deleteItemAsync(KEY_PASSWORD_LEGACY);
  } catch (err) {
    console.warn(LOG, 'clear password key failed', err);
  }
  if (__DEV__) console.log(LOG, 'cleared web credentials');
}
