/** ERPNext **Payment Gateway** name (Paystack Gateway Setting / Payment Gateway Account). */
export function erpPaystackPaymentGateway(): string {
  return String(process.env.EXPO_PUBLIC_ERPNEXT_PAYSTACK_GATEWAY || 'Paystack').trim() || 'Paystack';
}

/** ERPNext **Mode of Payment** document name (optional override after Paystack verify). */
export function erpPaystackModeOfPayment(): string {
  return String(process.env.EXPO_PUBLIC_ERPNEXT_PAYSTACK_MODE_OF_PAYMENT || '').trim();
}

/** Shown in the app UI only — not sent to ERPNext at checkout start. */
export const INVOICE_PAYMENT_MODE_LABEL = 'Pay Now';

/** Map Paystack `data.channel` to ERPNext **Mode of Payment** names to try (first match wins). */
export function paystackChannelToModeOfPaymentCandidates(channel: string): string[] {
  const ch = String(channel || '').trim().toLowerCase();
  const gateway = erpPaystackPaymentGateway();
  const uniq = (items: string[]) =>
    items.map((s) => String(s || '').trim()).filter((s, i, a) => s && a.indexOf(s) === i);

  switch (ch) {
    case 'card':
      return uniq(['Card', 'Credit Card', 'Debit Card', 'Paystack Card', gateway, 'Paystack']);
    case 'mobile_money':
      return uniq(['Mobile Money', 'MoMo', 'MTN Mobile Money', 'Telecel Cash', gateway, 'Paystack']);
    case 'bank':
    case 'bank_transfer':
      return uniq(['Bank', 'Bank Transfer', gateway, 'Paystack']);
    case 'ussd':
      return uniq(['USSD', gateway, 'Paystack']);
    case 'qr':
      return uniq(['QR', 'Paystack QR', gateway, 'Paystack']);
    default:
      return uniq([gateway, 'Paystack', 'Online', 'Online Payment', 'Bank']);
  }
}
