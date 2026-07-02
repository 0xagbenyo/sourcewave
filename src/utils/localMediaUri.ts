/** Device-local media URIs — keep separate from erpImageUrl to avoid require cycles with erpnext. */
export function isLocalMediaUri(raw: string | undefined | null): boolean {
  if (raw == null || String(raw).trim() === '') return false;
  const low = String(raw).trim().toLowerCase();
  return (
    low.startsWith('file:') ||
    low.startsWith('content:') ||
    low.startsWith('asset:') ||
    low.startsWith('data:')
  );
}
