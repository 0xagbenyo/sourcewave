/**
 * Strip backend / integration jargon from messages shown in alerts and inline UI.
 * Raw API errors stay in console logs for debugging.
 */
const BACKEND_JARGON =
  /erpnext|frappe|raven|whitelisted|doctype|api user|integration user|expo_public_|docstatus|custom_customer|custom_supplier|portal user|permission denied|not permitted|traceback|exception/i;

export function userFacingError(
  message: unknown,
  fallback = 'Something went wrong. Please try again.'
): string {
  const raw =
    message instanceof Error ? message.message : message != null ? String(message) : '';
  const m = raw.trim();
  if (!m) return fallback;
  if (BACKEND_JARGON.test(m)) return fallback;
  if (m.length > 220) return fallback;
  return m;
}
