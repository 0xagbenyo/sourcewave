import { Platform } from 'react-native';
import { cacheDirectory, copyAsync } from 'expo-file-system/legacy';

/**
 * Android image/video pickers often return `content://` URIs. Axios/RN multipart
 * uploads frequently fail with "Network Error" for those; copying to a cache
 * `file://` path matches what DocumentPicker already does with `copyToCacheDirectory`.
 */
const LOG_PREP = '[ravenUploadFilePrep]';

export async function prepareLocalFileUriForUpload(uri: string, fileName: string): Promise<string> {
  const u = uri.trim();
  if (Platform.OS !== 'android') return u;
  if (!u.toLowerCase().startsWith('content://')) {
    console.log(LOG_PREP, 'skip copy (non-content URI)', { scheme: u.slice(0, 24), fileName });
    return u;
  }
  const safe = (fileName || 'upload').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'upload';
  const base = cacheDirectory || '';
  const dest = `${base}raven-upload-${Date.now()}-${safe}`;
  console.log(LOG_PREP, 'copy content→cache', { from: u.slice(0, 80), dest: dest.slice(0, 80), fileName });
  try {
    await copyAsync({ from: u, to: dest });
    console.log(LOG_PREP, 'copy OK', { dest: dest.slice(0, 100) });
    return dest;
  } catch (e) {
    console.warn(LOG_PREP, 'copyAsync failed, using original URI', e);
    return u;
  }
}
