import { erpPaystackVerifyMethod, paystackClientSecretAllowed } from '../constants/env';
import { getERPNextClient } from './erpnext';
import type { PaystackVerifyResponse } from './paystack';
import { getPaystackConfigStatus, verifyPaystackPayment } from './paystack';

/** Whether direct Paystack API calls (sk_ in app) are permitted in this build. */
export function isPaystackClientSecretEnabled(): boolean {
  if (!paystackClientSecretAllowed()) return false;
  return getPaystackConfigStatus().configured;
}

/**
 * Verify a Paystack transaction — prefers ERPNext server method when configured,
 * otherwise falls back to client secret (dev / legacy only).
 */
export async function verifyPaystackPaymentSecure(reference: string): Promise<PaystackVerifyResponse> {
  const ref = String(reference || '').trim();
  if (!ref) throw new Error('Payment reference is missing.');

  const erpMethod = erpPaystackVerifyMethod();
  if (erpMethod) {
    const client = getERPNextClient();
    const raw = await client.callFrappeMethod(erpMethod, { reference: ref });
    const payload =
      raw != null && typeof raw === 'object' && 'message' in (raw as object)
        ? (raw as { message: unknown }).message
        : raw;
    if (payload && typeof payload === 'object' && 'status' in (payload as object)) {
      return payload as PaystackVerifyResponse;
    }
    throw new Error('Paystack verify method returned an unexpected response.');
  }

  if (!isPaystackClientSecretEnabled()) {
    throw new Error(
      'Paystack verification is not available in this build. Configure EXPO_PUBLIC_ERPNEXT_PAYSTACK_VERIFY_METHOD on ERPNext or use ERPNext Payment Request checkout for invoices.'
    );
  }

  return verifyPaystackPayment(ref);
}

/** User-facing error when MoMo/subscription Paystack is unavailable without a server proxy. */
export function paystackDirectApiConfigurationError(): string | null {
  if (isPaystackClientSecretEnabled()) return null;
  return (
    'Direct Paystack payments are disabled in production. ' +
    'Use invoice checkout (ERPNext Payment Request) or ask your administrator to enable a server-side Paystack proxy.'
  );
}
