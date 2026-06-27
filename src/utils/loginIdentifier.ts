export function cleanPhoneInput(value: string): string {
  return value.replace(/[\s\-()]/g, '');
}

export function isEmailLoginIdentifier(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

export function isGhanaPhoneLoginIdentifier(value: string): boolean {
  const cleaned = cleanPhoneInput(value);
  return /^(\+?233|0)?[0-9]{9}$/.test(cleaned);
}

/** Frappe `User.username` — supported at login but not advertised in the sign-in UI. */
export function isUsernameLoginIdentifier(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || isEmailLoginIdentifier(trimmed)) return false;
  if (isGhanaPhoneLoginIdentifier(trimmed)) return false;
  if (looksLikePhoneInput(trimmed)) return false;
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{2,139}$/.test(trimmed);
}

export function looksLikePhoneInput(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return /^[\d+\s\-()]+$/.test(trimmed);
}

export function isValidLoginIdentifier(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (isEmailLoginIdentifier(trimmed)) return true;
  if (isGhanaPhoneLoginIdentifier(trimmed)) return true;
  return isUsernameLoginIdentifier(trimmed);
}

/** Formats email / phone / username for ERPNext login (`usr`). */
export function normalizeLoginIdentifier(value: string): string {
  const trimmed = value.trim();
  if (isEmailLoginIdentifier(trimmed)) return trimmed.toLowerCase();
  if (isGhanaPhoneLoginIdentifier(trimmed)) {
    const cleaned = cleanPhoneInput(trimmed);
    if (cleaned.startsWith('+233')) return cleaned;
    if (cleaned.startsWith('233')) return `+${cleaned}`;
    if (cleaned.startsWith('0')) return cleaned;
    return cleaned;
  }
  if (isUsernameLoginIdentifier(trimmed)) return trimmed;
  return trimmed;
}
