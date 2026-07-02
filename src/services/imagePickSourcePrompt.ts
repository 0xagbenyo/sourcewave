import { Alert, Platform } from 'react-native';
import type { ImagePickSourceLabels } from '../utils/formImagePicker';

export type ImagePickSourceChoice = 'camera' | 'library' | null;

type PromptFn = (labels: ImagePickSourceLabels) => Promise<ImagePickSourceChoice>;

let promptImpl: PromptFn | null = null;

export function bindImagePickSourcePrompt(fn: PromptFn | null) {
  promptImpl = fn;
}

function promptWithNativeAlert(labels: ImagePickSourceLabels): Promise<ImagePickSourceChoice> {
  return new Promise((resolve) => {
    Alert.alert(
      labels.title?.trim() || labels.chooseLibrary || 'Add image',
      undefined,
      [
        { text: labels.takePhoto, onPress: () => resolve('camera') },
        { text: labels.chooseLibrary, onPress: () => resolve('library') },
        { text: labels.cancel, style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) }
    );
  });
}

export function promptImagePickSource(labels: ImagePickSourceLabels): Promise<ImagePickSourceChoice> {
  if (promptImpl) {
    return promptImpl(labels);
  }
  if (typeof console !== 'undefined') {
    console.warn('[imagePickSourcePrompt] host unavailable — using Alert fallback');
  }
  if (Platform.OS === 'web') {
    return Promise.resolve(null);
  }
  return promptWithNativeAlert(labels);
}
