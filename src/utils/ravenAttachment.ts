/**
 * Attachment classification and naming aligned with Raven web
 * (`frontend/src/utils/operations.ts`, `FileMessage.tsx`, `ImageMessage.tsx`).
 *
 * @see https://github.com/The-Commit-Company/raven/blob/develop/frontend/src/utils/operations.ts
 */
import { encodeErpFileUrl } from './erpImageUrl';
import { sanitizeRavenWebMessageFileUrl } from './ravenFileUrl';
import { getERPNextBaseUrl } from '../services/erpnext';

/** Raven `VIDEO_FORMATS` */
export const RAVEN_VIDEO_EXTENSIONS = ['mp4', 'webm', 'mov'] as const;

/** Raven `AUDIO_FORMATS` */
export const RAVEN_AUDIO_EXTENSIONS = ['mp3', 'ogg', 'wav'] as const;

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'svg',
  'avif',
  'heic',
  'heif',
]);

/**
 * Raven `getFileExtension` — strip query, take last segment after `.`, lowercase.
 */
export function getRavenFileExtension(filePathOrUrl: string): string {
  const withoutQuery = filePathOrUrl?.split('?')[0] ?? '';
  return withoutQuery.split('.').pop()?.toLowerCase() ?? '';
}

/**
 * Display filename from a Frappe `/files/...` or `/private/files/...` path or full URL.
 * Walks path segments from the end so odd URLs / trailing slashes still yield a basename.
 */
export function getRavenDisplayFileName(filePathOrUrl: string): string {
  const wq = (filePathOrUrl || '').trim().split('?')[0];
  if (!wq) return '';
  const parts = wq.split('/').filter((p) => p.length > 0);
  for (let i = parts.length - 1; i >= 0; i--) {
    const seg = parts[i];
    if (!seg) continue;
    try {
      const decoded = decodeURIComponent(seg);
      if (decoded) return decoded;
    } catch {
      return seg;
    }
  }
  return '';
}

/**
 * Human-readable attachment label: path basename, and for HTTP URLs common query params
 * that carry the original filename (sanitizers often strip `?…` and hide the real name).
 */
export function getRavenAttachmentLabel(path: string | null | undefined): string {
  const raw = (path ?? '').trim();
  if (!raw) return '';

  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      for (const key of ['file_name', 'filename', 'fname', 'name', 'original_name', 'title']) {
        const v = u.searchParams.get(key)?.trim();
        if (v) {
          try {
            return decodeURIComponent(v.replace(/\+/g, ' '));
          } catch {
            return v;
          }
        }
      }
      const fromPath = getRavenDisplayFileName(u.pathname);
      if (fromPath) return fromPath;
    } catch {
      /* ignore */
    }
  }

  const sanitized = sanitizeRavenWebMessageFileUrl(raw);
  return getRavenDisplayFileName(sanitized || raw.split('?')[0]);
}

/** Raven `getAudioSource` */
export function getRavenAudioMimeType(ext: string): string {
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'ogg') return 'audio/ogg';
  if (ext === 'wav') return 'audio/wav';
  return 'audio/mpeg';
}

export type RavenAttachmentKind = 'image' | 'video' | 'audio' | 'pdf' | 'file';

export function classifyRavenAttachment(
  sanitizedPath: string,
  messageType?: string | null
): { ext: string; displayName: string; kind: RavenAttachmentKind } {
  const ext = getRavenFileExtension(sanitizedPath);
  const derivedName = sanitizedPath ? getRavenDisplayFileName(sanitizedPath).trim() : '';
  const displayName = derivedName || 'Attachment';
  const mt = (messageType || '').toLowerCase();

  if (mt === 'image') {
    return { ext, displayName, kind: 'image' };
  }
  if ((RAVEN_VIDEO_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ext, displayName, kind: 'video' };
  }
  if ((RAVEN_AUDIO_EXTENSIONS as readonly string[]).includes(ext)) {
    return { ext, displayName, kind: 'audio' };
  }
  if (ext === 'pdf') {
    return { ext, displayName, kind: 'pdf' };
  }
  if (IMAGE_EXTENSIONS.has(ext)) {
    return { ext, displayName, kind: 'image' };
  }
  return { ext, displayName, kind: 'file' };
}

/** Absolute HTTPS URL for opening / sharing (encoded path, site base for relative paths). */
export function buildAbsoluteRavenFileUrl(sanitizedPath: string): string {
  const enc = encodeErpFileUrl(sanitizedPath);
  if (!enc) return '';
  if (/^https?:\/\//i.test(enc)) return enc;
  const base = getERPNextBaseUrl().replace(/\/+$/, '');
  return enc.startsWith('/') ? `${base}${enc}` : `${base}/${enc}`;
}

/** Prefer main `file`, then `file_thumbnail` (Raven image messages). */
export function resolveRavenMessageFilePaths(item: {
  file?: string | null;
  file_thumbnail?: string | null;
}): { display: string; stream: string } {
  const main = sanitizeRavenWebMessageFileUrl(item.file);
  const thumb = sanitizeRavenWebMessageFileUrl(item.file_thumbnail);
  return {
    display: main || thumb,
    stream: main || thumb,
  };
}

/** True when the message shows an inline image or video in chat. */
export function ravenMessageHasVisualMedia(item: {
  file?: string | null;
  file_thumbnail?: string | null;
  message_type?: string | null;
}): boolean {
  const { display } = resolveRavenMessageFilePaths(item);
  if (!display) return false;
  const k = classifyRavenAttachment(display, item.message_type).kind;
  return k === 'image' || k === 'video';
}

export function ravenSameMessageOwner(
  a: { owner?: string | null },
  b: { owner?: string | null }
): boolean {
  const ao = (a.owner || '').trim();
  const bo = (b.owner || '').trim();
  return ao.length > 0 && ao === bo;
}
