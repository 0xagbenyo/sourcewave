/**
 * AsyncStorage with in-memory fallback when the native module is missing or throws
 * (e.g. "NativeModule is null", "cannot access legacy storage" on some Web / dev builds).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const memory = new Map<string, string>();
let useMemoryFallback = false;

function warnOnce(message: string) {
  const g = globalThis as { __sourcewaveStorageWarned?: boolean };
  if (!g.__sourcewaveStorageWarned) {
    g.__sourcewaveStorageWarned = true;
    console.warn(message);
  }
}

export const appStorage = {
  async getItem(key: string): Promise<string | null> {
    if (useMemoryFallback) {
      return memory.has(key) ? memory.get(key)! : null;
    }
    try {
      return await AsyncStorage.getItem(key);
    } catch (e) {
      useMemoryFallback = true;
      warnOnce(
        '[SourceWave] AsyncStorage failed; using in-memory storage (clears when the app closes). Rebuild with `npx expo run:android` / `run:ios` or restart Expo with `-c`. ' +
          String((e as Error)?.message || e)
      );
      return memory.has(key) ? memory.get(key)! : null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    if (useMemoryFallback) {
      memory.set(key, value);
      return;
    }
    try {
      await AsyncStorage.setItem(key, value);
    } catch (e) {
      useMemoryFallback = true;
      warnOnce(
        '[SourceWave] AsyncStorage failed; using in-memory storage. ' + String((e as Error)?.message || e)
      );
      memory.set(key, value);
    }
  },

  async removeItem(key: string): Promise<void> {
    memory.delete(key);
    if (useMemoryFallback) return;
    try {
      await AsyncStorage.removeItem(key);
    } catch {
      useMemoryFallback = true;
    }
  },

  async getAllKeys(): Promise<string[]> {
    if (useMemoryFallback) {
      return Array.from(memory.keys());
    }
    try {
      const keys = await AsyncStorage.getAllKeys();
      return Array.isArray(keys) ? keys : [];
    } catch (e) {
      useMemoryFallback = true;
      warnOnce(
        '[SourceWave] AsyncStorage getAllKeys failed; using in-memory key list. ' + String((e as Error)?.message || e)
      );
      return Array.from(memory.keys());
    }
  },
};
