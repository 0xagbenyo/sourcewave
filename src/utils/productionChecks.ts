import { getErpNextUrl } from '../constants/env';
import { getPaystackConfigStatus } from '../services/paystack';
import { isPaystackClientSecretEnabled } from '../services/paystackSecure';

/**
 * Run once at startup in release builds. Uses console.error so messages survive
 * the production Babel strip-console plugin.
 */
export function runProductionStartupChecks(apiKey: string, apiSecret: string): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) return;

  if (!apiKey || !apiSecret) {
    console.error(
      '[SOURCEWAVE] Production build is missing ERPNext API credentials. ' +
        'Set EXPO_PUBLIC_API_KEY and EXPO_PUBLIC_API_SECRET in EAS secrets or .env before building.'
    );
  }

  const paystack = getPaystackConfigStatus();
  if (isPaystackClientSecretEnabled()) {
    if (paystack.secretKeyKind === 'test' || paystack.publicKeyKind === 'test') {
      console.error(
        '[SOURCEWAVE] SECURITY: Paystack TEST secret is embedded in this production build. ' +
          'Remove EXPO_PUBLIC_PAYSTACK_SECRET_KEY and use ERPNext Payment Request checkout for invoices, ' +
          'or set EXPO_PUBLIC_PAYSTACK_ALLOW_CLIENT_SECRET=false.'
      );
    } else if (paystack.configured) {
      console.error(
        '[SOURCEWAVE] SECURITY: Paystack secret key (sk_live_…) is embedded in this app bundle and can be extracted. ' +
          'Invoice payments use ERPNext hosted checkout; remove EXPO_PUBLIC_PAYSTACK_SECRET_KEY unless delivery-fee / subscription proxy is required.'
      );
    }
  }

  const url = getErpNextUrl();
  if (/localhost|127\.0\.0\.1/i.test(url)) {
    console.error(
      `[SOURCEWAVE] Production build points at a local ERPNext URL (${url}). ` +
        'Set EXPO_PUBLIC_ERPNEXT_URL to your live site.'
    );
  }

  if (!/^https:\/\//i.test(url)) {
    console.error(
      `[SOURCEWAVE] ERPNext URL should use HTTPS in production (${url}).`
    );
  }
}
