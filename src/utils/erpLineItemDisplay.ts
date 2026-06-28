/** Placeholder color/size values we should not show in line titles or descriptions. */
function isPlaceholderColor(name: string): boolean {
  const n = name.trim().toLowerCase();
  return !n || n === 'default';
}

function isPlaceholderSize(name: string): boolean {
  const n = name.trim().toLowerCase();
  return !n || n === 'default' || n === 'm';
}

/** Build a variant suffix like "Red · L", omitting Default / M placeholders. */
export function formatErpLineVariantLabel(color?: string | null, size?: string | null): string | null {
  const c = String(color ?? '').trim();
  const s = String(size ?? '').trim();
  const colorOk = c && !isPlaceholderColor(c);
  const sizeOk = s && !isPlaceholderSize(s);
  if (colorOk && sizeOk) return `${c} · ${s}`;
  if (colorOk) return c;
  if (sizeOk) return s;
  return null;
}

/**
 * Remove trailing placeholder variant text from ERP line titles/descriptions,
 * e.g. "Linen shirt (Default · M)" → "Linen shirt".
 */
export function cleanErpLineItemDisplayText(raw: string): string {
  let s = String(raw ?? '').trim();
  if (!s) return s;

  const patterns = [
    /\s*\(\s*Default\s*[·•\-/,]\s*M\s*\)\s*$/i,
    /\s*\(\s*Default\s*\(\s*M\s*\)\s*\)\s*$/i,
    /\s*\(\s*Default\s*·\s*M\s*\)\s*$/i,
    /\s*\(\s*Default\s*\)\s*$/i,
    /\s*\(\s*M\s*\)\s*$/i,
    /\s+Default\s*\(\s*M\s*\)\s*$/i,
    /\s+Default\s*·\s*M\s*$/i,
  ];

  let prev = '';
  while (s !== prev) {
    prev = s;
    for (const re of patterns) {
      s = s.replace(re, '').trim();
    }
  }
  return s;
}

export function erpLineItemTitle(
  itemName?: string | null,
  opts?: { description?: string | null; itemCode?: string | null; color?: string | null; size?: string | null }
): string {
  const base = cleanErpLineItemDisplayText(
    String(itemName || opts?.description || opts?.itemCode || 'Item').trim()
  );
  const variant = formatErpLineVariantLabel(opts?.color, opts?.size);
  if (!variant) return base || 'Item';
  if (!base) return variant;
  return `${base} (${variant})`;
}
