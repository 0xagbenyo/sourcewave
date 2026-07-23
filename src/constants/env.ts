/** Production ERPNext site — used when EXPO_PUBLIC_ERPNEXT_URL is unset. */
export const DEFAULT_ERPNEXT_URL = 'https://sourcewave.frappe.cloud';

export function getErpNextUrl(): string {
  const raw = process.env.EXPO_PUBLIC_ERPNEXT_URL?.trim();
  return raw || DEFAULT_ERPNEXT_URL;
}

/** True in Metro dev or when EXPO_PUBLIC_DEBUG_MODE=true (verbose logs only). */
export const IS_DEBUG_MODE =
  (typeof __DEV__ !== 'undefined' && __DEV__) ||
  process.env.EXPO_PUBLIC_DEBUG_MODE === 'true';

/**
 * Paystack secret in the app bundle can be extracted — prefer ERPNext Payment Request checkout
 * for invoices. Set to `true` only for delivery-fee / subscription flows until a server proxy exists.
 */
export function paystackClientSecretAllowed(): boolean {
  const flag = process.env.EXPO_PUBLIC_PAYSTACK_ALLOW_CLIENT_SECRET?.trim().toLowerCase();
  if (flag === 'false' || flag === '0') return false;
  if (flag === 'true' || flag === '1') return true;
  // Dev default: allow; production default: block embedding sk_* in the client.
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

/** Optional whitelisted Frappe method that verifies a Paystack reference server-side (no sk_ in app). */
export function erpPaystackVerifyMethod(): string | null {
  const m = process.env.EXPO_PUBLIC_ERPNEXT_PAYSTACK_VERIFY_METHOD?.trim();
  return m || null;
}
