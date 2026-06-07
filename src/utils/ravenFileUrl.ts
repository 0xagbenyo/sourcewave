import { encodeErpFileUrl } from './erpImageUrl';

/**
 * Raven web strips the query string from message file URLs before display / parsing.
 *
 * @example
 * ```ts
 * const fileURL = message.file?.split('?')[0]
 * ```
 *
 * @see https://github.com/The-Commit-Company/raven/blob/develop/frontend/src/components/feature/chat/ChatMessage/Renderers/FileMessage.tsx
 * @see https://github.com/The-Commit-Company/raven/blob/develop/frontend/src/utils/operations.ts (getFileExtension splits `?` first)
 */
export function sanitizeRavenWebMessageFileUrl(path: string | null | undefined): string {
  if (path == null) return '';
  const t = String(path).trim();
  if (!t) return '';
  return t.split('?')[0] || '';
}

/** Attach Image / file path → URL for `ErpAuthenticatedImage` (workspace logos, Supplier `image`, etc.). */
export function resolveRavenErpAttachImageUri(attach: string | null | undefined): string | null {
  if (attach == null) return null;
  const t = sanitizeRavenWebMessageFileUrl(String(attach).trim());
  if (!t) return null;
  const uri = encodeErpFileUrl(t);
  return uri || null;
}
