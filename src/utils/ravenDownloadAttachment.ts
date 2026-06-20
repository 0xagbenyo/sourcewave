/**
 * Download ERP-hosted attachments with the same auth as in-app images, then open the OS share sheet
 * (Save to Files, Open in Excel, etc.) — avoids opening unauthenticated browser links for spreadsheets.
 */
import { Platform, Alert } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { buildAuthenticatedErpImageSource } from './erpImageUrl';
import { buildAbsoluteRavenFileUrl, getRavenFileExtension } from './ravenAttachment';

function safeFileSegment(name: string): string {
  const t = name.trim() || 'file';
  return t.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120) || 'file';
}

const MIME_BY_EXT: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  csv: 'text/csv',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  rtf: 'application/rtf',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odp: 'application/vnd.oasis.opendocument.presentation',
  pdf: 'application/pdf',
  zip: 'application/zip',
  json: 'application/json',
  xml: 'application/xml',
  txt: 'text/plain',
};

export function guessMimeTypeForExtension(ext: string): string {
  return MIME_BY_EXT[ext.toLowerCase()] ?? 'application/octet-stream';
}

export async function downloadErpFileAndShare(sanitizedPath: string, displayName: string): Promise<void> {
  if (Platform.OS === 'web') {
    Alert.alert('Download', 'File download is not supported in web preview. Use the mobile app instead.');
    return;
  }

  const src = buildAuthenticatedErpImageSource(sanitizedPath);
  if (!src?.uri) {
    throw new Error('Invalid file URL');
  }

  const base = FileSystem.cacheDirectory;
  if (!base) {
    throw new Error('Cache directory is not available.');
  }

  const ext = getRavenFileExtension(displayName);
  const localUri = `${base}raven-dl-${Date.now()}-${safeFileSegment(displayName)}`;

  const result = await FileSystem.downloadAsync(src.uri, localUri, {
    headers: src.headers as Record<string, string> | undefined,
  });

  if (result.status < 200 || result.status >= 400) {
    throw new Error(`Download failed (HTTP ${result.status}).`);
  }

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    const abs = buildAbsoluteRavenFileUrl(sanitizedPath);
    await Clipboard.setStringAsync(abs).catch(() => {});
    throw new Error('Sharing is not available. The file link was copied to the clipboard.');
  }

  await Sharing.shareAsync(result.uri, {
    mimeType: guessMimeTypeForExtension(ext),
    dialogTitle: displayName,
  });
}
