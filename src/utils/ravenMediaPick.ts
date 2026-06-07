import type { ImagePickerAsset } from 'expo-image-picker';

/**
 * Build `{ uri, mimeType, name }` for Raven upload from an expo-image-picker asset
 * (photos or videos from the library).
 */
export function attachmentFromImagePickerAsset(asset: ImagePickerAsset): {
  uri: string;
  mimeType: string;
  name: string;
} {
  const mime = (asset.mimeType || '').trim().toLowerCase();
  const isVideo = asset.type === 'video' || mime.startsWith('video/');
  const defaultName = isVideo ? `video-${Date.now()}.mp4` : `image-${Date.now()}.jpg`;
  const name = (asset.fileName && asset.fileName.trim()) || defaultName;
  let mimeType = (asset.mimeType || '').trim();
  if (!mimeType) {
    mimeType = isVideo ? 'video/mp4' : 'image/jpeg';
  }
  return { uri: asset.uri, mimeType, name };
}

/** Composer queue item (multi-attach). */
export type RavenPendingAttachment = {
  key: string;
  uri: string;
  mimeType: string;
  name: string;
};

function newPendingKey(prefix: string, index: number): string {
  return `${prefix}-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Map library picker result to pending rows for the send queue. */
export function pendingAttachmentsFromImagePickerAssets(assets: ImagePickerAsset[]): RavenPendingAttachment[] {
  return assets.map((a, i) => ({
    key: newPendingKey('media', i),
    ...attachmentFromImagePickerAsset(a),
  }));
}
