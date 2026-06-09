/**
 * Frappe / ERPNext password reset links use `/update-password?key=...`.
 */
export function parsePasswordResetKeyFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const path = (u.pathname || '').replace(/\/+$/, '') || '/';
    if (!path.toLowerCase().endsWith('/update-password')) return null;
    const key = u.searchParams.get('key');
    const trimmed = key?.trim();
    return trimmed || null;
  } catch {
    return null;
  }
}
