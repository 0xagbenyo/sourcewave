import * as SecureStore from 'expo-secure-store';
import type { UserSession } from '../context/UserContext';

const KEY = 'sourcewave_user_session_v1';

const secureStoreOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

function isValidSession(value: unknown): value is UserSession {
  if (!value || typeof value !== 'object') return false;
  const email = String((value as UserSession).email ?? '').trim();
  return email.length > 0;
}

export async function loadStoredUserSession(): Promise<UserSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(KEY, secureStoreOptions);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidSession(parsed)) return null;
    return parsed;
  } catch (e) {
    console.warn('[userSessionStorage] load failed', e);
    return null;
  }
}

export async function saveStoredUserSession(session: UserSession | null): Promise<void> {
  try {
    if (!session) {
      await SecureStore.deleteItemAsync(KEY);
      return;
    }
    await SecureStore.setItemAsync(KEY, JSON.stringify(session), secureStoreOptions);
  } catch (e) {
    console.warn('[userSessionStorage] save failed', e);
  }
}

export async function clearStoredUserSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch (e) {
    console.warn('[userSessionStorage] clear failed', e);
  }
}
