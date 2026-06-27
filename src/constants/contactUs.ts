/** SourceWave support — call, WhatsApp, and email shown on Contact us. */
export const SOURCEWAVE_SUPPORT_PHONE_E164 = '+233257420075';
export const SOURCEWAVE_SUPPORT_EMAIL = 'sourcewave88@gmail.com';

export function sourcewaveSupportWhatsAppUrl(): string {
  const digits = SOURCEWAVE_SUPPORT_PHONE_E164.replace(/\D/g, '');
  return `https://wa.me/${digits}`;
}

export function sourcewaveSupportTelUrl(): string {
  return `tel:${SOURCEWAVE_SUPPORT_PHONE_E164}`;
}

export function sourcewaveSupportMailtoUrl(): string {
  return `mailto:${SOURCEWAVE_SUPPORT_EMAIL}`;
}
