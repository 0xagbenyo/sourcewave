import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { pendingAttachmentsFromImagePickerAssets, type RavenPendingAttachment } from './ravenMediaPick';
import type { ImagePickSourceLabels } from './formImagePicker';
import { promptImagePickSource } from '../services/imagePickSourcePrompt';

export type ChatAttachPickResult<T> =
  | { ok: true; data: T }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; message: string };

/** Open the photo library with options safe across iOS / Android / Expo Go. */
export async function pickChatMediaFromLibrary(): Promise<ChatAttachPickResult<RavenPendingAttachment[]>> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      return { ok: false, canceled: false, message: 'Allow photo library access to attach photos or videos.' };
    }

    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.85,
      allowsMultipleSelection: true,
      ...(Platform.OS === 'ios'
        ? { videoExportPreset: ImagePicker.VideoExportPreset.MediumQuality }
        : {}),
    });

    if (res.canceled || !res.assets?.length) {
      return { ok: false, canceled: true };
    }

    return { ok: true, data: pendingAttachmentsFromImagePickerAssets(res.assets) };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Could not open photo library.';
    return { ok: false, canceled: false, message };
  }
}

/** Capture a photo with the device camera for chat attachments. */
export async function pickChatMediaFromCamera(): Promise<ChatAttachPickResult<RavenPendingAttachment[]>> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      return { ok: false, canceled: false, message: 'Allow camera access to take a photo.' };
    }

    const res = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
    });

    if (res.canceled || !res.assets?.length) {
      return { ok: false, canceled: true };
    }

    return { ok: true, data: pendingAttachmentsFromImagePickerAssets(res.assets) };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Could not open camera.';
    return { ok: false, canceled: false, message };
  }
}

/** Prompt camera vs library, then attach photos/videos (library only supports videos). */
export async function pickChatMediaWithSource(
  labels: ImagePickSourceLabels
): Promise<ChatAttachPickResult<RavenPendingAttachment[]>> {
  const source = await promptImagePickSource(labels);
  if (!source) return { ok: false, canceled: true };
  if (source === 'camera') return pickChatMediaFromCamera();
  return pickChatMediaFromLibrary();
}

/** Open the system document picker for chat file attachments. */
export async function pickChatDocuments(): Promise<ChatAttachPickResult<RavenPendingAttachment[]>> {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
      multiple: true,
    });

    if (res.canceled || !res.assets?.length) {
      return { ok: false, canceled: true };
    }

    const picked: RavenPendingAttachment[] = res.assets.map((a, i) => ({
      key: `doc-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 9)}`,
      uri: a.uri,
      mimeType: (a.mimeType || 'application/octet-stream').trim() || 'application/octet-stream',
      name: a.name?.trim() || `file-${Date.now()}-${i}`,
    }));

    return { ok: true, data: picked };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Could not pick a file.';
    return { ok: false, canceled: false, message };
  }
}
