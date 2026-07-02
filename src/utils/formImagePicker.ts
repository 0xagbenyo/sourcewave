import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { promptImagePickSource } from '../services/imagePickSourcePrompt';

export type ImagePickSourceLabels = {
  title?: string;
  takePhoto: string;
  chooseLibrary: string;
  cancel: string;
  cameraPermission: string;
  libraryPermission: string;
  pickFailed: string;
};

export type ImagePickResult =
  | { ok: true; uri: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled: false; message: string };

const IMAGE_PICK_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: Platform.OS === 'ios',
  quality: 0.85,
};

async function pickFromLibrary(labels: ImagePickSourceLabels): Promise<ImagePickResult> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    return { ok: false, canceled: false, message: labels.libraryPermission };
  }
  try {
    const result = await ImagePicker.launchImageLibraryAsync(IMAGE_PICK_OPTIONS);
    if (result.canceled || !result.assets?.length) {
      return { ok: false, canceled: true };
    }
    const uri = result.assets[0].uri?.trim();
    if (!uri) return { ok: false, canceled: false, message: labels.pickFailed };
    return { ok: true, uri };
  } catch {
    return { ok: false, canceled: false, message: labels.pickFailed };
  }
}

async function pickFromCamera(labels: ImagePickSourceLabels): Promise<ImagePickResult> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    return { ok: false, canceled: false, message: labels.cameraPermission };
  }
  try {
    const result = await ImagePicker.launchCameraAsync(IMAGE_PICK_OPTIONS);
    if (result.canceled || !result.assets?.length) {
      return { ok: false, canceled: true };
    }
    const uri = result.assets[0].uri?.trim();
    if (!uri) return { ok: false, canceled: false, message: labels.pickFailed };
    return { ok: true, uri };
  } catch {
    return { ok: false, canceled: false, message: labels.pickFailed };
  }
}

/** Prompt for camera vs library, then return a single local image URI for form uploads. */
export async function pickSingleFormImage(labels: ImagePickSourceLabels): Promise<ImagePickResult> {
  const source = await promptImagePickSource(labels);
  if (!source) return { ok: false, canceled: true };
  if (source === 'camera') return pickFromCamera(labels);
  return pickFromLibrary(labels);
}

/** Shared i18n keys for {@link pickSingleFormImage} and chat media source prompts. */
export function imagePickLabelsFromT(t: (key: string) => string): ImagePickSourceLabels {
  return {
    title: t('sourcing.imagePickTitle'),
    takePhoto: t('sourcing.takePhoto'),
    chooseLibrary: t('sourcing.chooseFromLibrary'),
    cancel: t('ravenAttach.cancel'),
    cameraPermission: t('sourcing.cameraPermission'),
    libraryPermission: t('sourcing.libraryPermission'),
    pickFailed: t('sourcing.imagePickFailed'),
  };
}
