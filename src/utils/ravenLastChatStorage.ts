import AsyncStorage from '@react-native-async-storage/async-storage';

export type RavenLastChat = {
  workspace: string;
  channelId: string;
};

function storageKey(userEmail: string | undefined): string {
  const e = (userEmail || '').trim().toLowerCase().replace(/[^a-z0-9@._+-]/gi, '_') || 'anon';
  return `@raven_last_chat_v1_${e}`;
}

export async function getRavenLastChat(userEmail: string | undefined): Promise<RavenLastChat | null> {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userEmail));
    if (!raw) return null;
    const o = JSON.parse(raw) as unknown;
    if (!o || typeof o !== 'object') return null;
    const workspace = String((o as RavenLastChat).workspace || '').trim();
    const channelId = String((o as RavenLastChat).channelId || '').trim();
    if (!workspace || !channelId) return null;
    return { workspace, channelId };
  } catch {
    return null;
  }
}

export async function setRavenLastChat(userEmail: string | undefined, value: RavenLastChat | null): Promise<void> {
  const key = storageKey(userEmail);
  try {
    if (!value || !value.workspace.trim() || !value.channelId.trim()) {
      await AsyncStorage.removeItem(key);
      return;
    }
    await AsyncStorage.setItem(
      key,
      JSON.stringify({
        workspace: value.workspace.trim(),
        channelId: value.channelId.trim(),
      })
    );
  } catch {
    /* ignore */
  }
}
