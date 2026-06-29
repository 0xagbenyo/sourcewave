import { plainTextFromMaybeHtml } from './chatPlainText';
import { parseRavenDateTime } from './ravenChatUi';
import { ravenMessageOwnerMatchesSession, type RavenMessageRow } from '../services/ravenNativeApi';

/** App rule: owners may edit or delete their own messages within this window. */
export const RAVEN_MESSAGE_MODIFY_WINDOW_MS = 15 * 60 * 1000;

/** When the message was sent — `creation` only (not `modified` after an edit). */
export function ravenMessageSentAtMs(row: RavenMessageRow | null | undefined): number {
  if (!row) return 0;
  const d = parseRavenDateTime(row.creation);
  return d ? d.getTime() : 0;
}

export function ravenMessageWithinModifyWindow(
  row: RavenMessageRow | null | undefined,
  nowMs = Date.now()
): boolean {
  if (!row) return false;
  const sent = ravenMessageSentAtMs(row);
  if (!sent) return false;
  return nowMs - sent <= RAVEN_MESSAGE_MODIFY_WINDOW_MS;
}

export function ravenMessageIsEdited(row: RavenMessageRow | null | undefined): boolean {
  if (!row) return false;
  const v = row.is_edited;
  return v === 1 || v === true || String(v) === '1';
}

export function ravenMessageCanDelete(
  row: RavenMessageRow | null | undefined,
  session: { email?: string | null; user?: string | null } | null | undefined
): boolean {
  if (!row?.name) return false;
  if (String(row.message_type || '').toLowerCase() === 'poll') return false;
  if (!ravenMessageOwnerMatchesSession(row.owner, session)) return false;
  return ravenMessageWithinModifyWindow(row);
}

/** Raven web only offers Edit when the message has `text` (not file-only). */
export function ravenMessageCanEdit(
  row: RavenMessageRow | null | undefined,
  session: { email?: string | null; user?: string | null } | null | undefined
): boolean {
  if (!ravenMessageCanDelete(row, session)) return false;
  if (!String(row?.text || '').trim()) return false;
  const mt = String(row?.message_type || '').toLowerCase();
  if (mt === 'file' || mt === 'image') return false;
  return true;
}

export function ravenMessagePlainTextForEdit(row: RavenMessageRow | null | undefined): string {
  return plainTextFromMaybeHtml(row?.text || '');
}
